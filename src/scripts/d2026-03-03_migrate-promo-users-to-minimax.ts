/**
 * Migrates depleted promo users' code review model from Sonnet 4.6 to MiniMax M2.5 (free).
 *
 * Background:
 *   The Sonnet 4.6 free code review promo (Feb 18–25, 2026) attracted ~960 users.
 *   Many now have < $1 balance, meaning their code reviews will start then fail
 *   mid-stream when the LLM gateway enforces the balance gate — a poor experience.
 *   This script switches their review model to MiniMax M2.5 (free) so reviews
 *   can still complete without cost.
 *
 * What it does:
 *   1. Identifies promo users via microdollar_usage (cost=0, Sonnet 4.6, promo window)
 *   2. Splits into individual users (no org) and org-owned usage
 *   3. Filters to those with balance < $1 (the cloud agent minimum)
 *   4. For each: updates agent_configs.config.model_slug if set to Sonnet 4.6,
 *      or inserts a new agent_configs row if no config exists (they'd get Sonnet 4.6
 *      via DEFAULT_CODE_REVIEW_MODEL fallback and fail the same way)
 *
 * Usage:
 *   DRY RUN (default):
 *     pnpm script src/scripts/d2026-03-03_migrate-promo-users-to-minimax.ts
 *   LIVE:
 *     pnpm script src/scripts/d2026-03-03_migrate-promo-users-to-minimax.ts --run-actually
 */

import { db, closeAllDrizzleConnections } from '@/lib/drizzle';
import {
  agent_configs,
  kilocode_users,
  microdollar_usage,
  organizations,
  platform_integrations,
} from '@kilocode/db/schema';
import { sql, and, eq, lt, isNull, isNotNull } from 'drizzle-orm';
import { minimax_m25_free_model } from '@/lib/providers/minimax';
import {
  REVIEW_PROMO_START,
  REVIEW_PROMO_END,
  REVIEW_PROMO_MODEL,
} from '@/lib/code-reviews/core/constants';

const TARGET_MODEL = minimax_m25_free_model.public_id; // 'minimax/minimax-m2.5:free'
const MIN_BALANCE_MUSD = 1_000_000; // $1 in microdollars
const isDryRun = !process.argv.includes('--run-actually');

// ── Phase 1: Identify depleted promo users ─────────────────────────────────

type DepletedOwner = {
  type: 'user' | 'org';
  id: string;
  label: string; // email or org name for logging
  balance_usd: number;
};

async function findDepletedPromoOwners(): Promise<DepletedOwner[]> {
  const owners: DepletedOwner[] = [];

  // Individual users who used the promo (no org)
  const individualRows = await db
    .selectDistinctOn([microdollar_usage.kilo_user_id], {
      user_id: microdollar_usage.kilo_user_id,
      email: kilocode_users.google_user_email,
      balance_musd:
        sql<number>`(${kilocode_users.total_microdollars_acquired} - ${kilocode_users.microdollars_used})`.as(
          'balance_musd'
        ),
    })
    .from(microdollar_usage)
    .innerJoin(kilocode_users, eq(kilocode_users.id, microdollar_usage.kilo_user_id))
    .where(
      and(
        sql`${microdollar_usage.created_at} >= ${REVIEW_PROMO_START}`,
        sql`${microdollar_usage.created_at} < ${REVIEW_PROMO_END}`,
        eq(microdollar_usage.requested_model, REVIEW_PROMO_MODEL),
        eq(microdollar_usage.cost, 0),
        isNull(microdollar_usage.organization_id),
        lt(
          sql`(${kilocode_users.total_microdollars_acquired} - ${kilocode_users.microdollars_used})`,
          MIN_BALANCE_MUSD
        )
      )
    );

  for (const row of individualRows) {
    owners.push({
      type: 'user',
      id: row.user_id,
      label: row.email,
      balance_usd: row.balance_musd / 1_000_000,
    });
  }

  // Org-owned promo usage
  const orgRows = await db
    .selectDistinctOn([microdollar_usage.organization_id], {
      org_id: microdollar_usage.organization_id,
      org_name: organizations.name,
      balance_musd:
        sql<number>`(${organizations.total_microdollars_acquired} - ${organizations.microdollars_used})`.as(
          'balance_musd'
        ),
    })
    .from(microdollar_usage)
    .innerJoin(organizations, eq(organizations.id, microdollar_usage.organization_id))
    .where(
      and(
        sql`${microdollar_usage.created_at} >= ${REVIEW_PROMO_START}`,
        sql`${microdollar_usage.created_at} < ${REVIEW_PROMO_END}`,
        eq(microdollar_usage.requested_model, REVIEW_PROMO_MODEL),
        eq(microdollar_usage.cost, 0),
        isNotNull(microdollar_usage.organization_id),
        lt(
          sql`(${organizations.total_microdollars_acquired} - ${organizations.microdollars_used})`,
          MIN_BALANCE_MUSD
        )
      )
    );

  for (const row of orgRows) {
    if (row.org_id) {
      owners.push({
        type: 'org',
        id: row.org_id,
        label: row.org_name ?? '(unnamed org)',
        balance_usd: row.balance_musd / 1_000_000,
      });
    }
  }

  return owners;
}

// ── Phase 2: Update agent_configs ──────────────────────────────────────────

type UpdateResult = {
  updated: number;
  inserted: number;
  skipped: number;
  details: string[];
};

async function migrateReviewModels(owners: DepletedOwner[]): Promise<UpdateResult> {
  const result: UpdateResult = { updated: 0, inserted: 0, skipped: 0, details: [] };

  for (const owner of owners) {
    const ownerCondition =
      owner.type === 'org'
        ? eq(agent_configs.owned_by_organization_id, owner.id)
        : eq(agent_configs.owned_by_user_id, owner.id);

    // Check both github and gitlab platforms
    for (const platform of ['github', 'gitlab']) {
      const [existing] = await db
        .select({
          id: agent_configs.id,
          config: agent_configs.config,
        })
        .from(agent_configs)
        .where(
          and(
            ownerCondition,
            eq(agent_configs.agent_type, 'code_review'),
            eq(agent_configs.platform, platform)
          )
        )
        .limit(1);

      if (existing) {
        const config = existing.config as Record<string, unknown>;
        const currentModel = config.model_slug;

        if (currentModel !== REVIEW_PROMO_MODEL) {
          result.skipped++;
          result.details.push(
            `  [SKIP] ${owner.type}:${owner.label} (${platform}) — model is '${currentModel}', not Sonnet 4.6`
          );
          continue;
        }

        // Update existing config
        if (!isDryRun) {
          await db
            .update(agent_configs)
            .set({
              config: { ...config, model_slug: TARGET_MODEL },
              updated_at: new Date().toISOString(),
            })
            .where(eq(agent_configs.id, existing.id));
        }
        result.updated++;
        result.details.push(
          `  [UPDATE] ${owner.type}:${owner.label} (${platform}) — $${owner.balance_usd.toFixed(2)} balance`
        );
      } else {
        // No agent_configs row — they'd fall back to DEFAULT_CODE_REVIEW_MODEL (Sonnet 4.6).
        // Only insert if the owner actually has a platform_integration for this platform,
        // otherwise they don't have reviews enabled at all.
        const hasIntegration = await ownerHasIntegration(owner, platform);
        if (!hasIntegration) {
          continue; // no integration for this platform, nothing to do
        }

        if (!isDryRun) {
          const values =
            owner.type === 'org'
              ? {
                  owned_by_organization_id: owner.id,
                  owned_by_user_id: null,
                }
              : {
                  owned_by_organization_id: null,
                  owned_by_user_id: owner.id,
                };

          await db.insert(agent_configs).values({
            ...values,
            agent_type: 'code_review',
            platform,
            config: {
              review_style: 'balanced',
              focus_areas: [],
              max_review_time_minutes: 10,
              model_slug: TARGET_MODEL,
            },
            is_enabled: true,
            created_by: 'script:migrate-promo-users-to-minimax',
          });
        }
        result.inserted++;
        result.details.push(
          `  [INSERT] ${owner.type}:${owner.label} (${platform}) — no existing config, $${owner.balance_usd.toFixed(2)} balance`
        );
      }
    }
  }

  return result;
}

async function ownerHasIntegration(owner: DepletedOwner, platform: string): Promise<boolean> {
  const ownerCondition =
    owner.type === 'org'
      ? eq(platform_integrations.owned_by_organization_id, owner.id)
      : eq(platform_integrations.owned_by_user_id, owner.id);

  const [row] = await db
    .select({ id: platform_integrations.id })
    .from(platform_integrations)
    .where(and(ownerCondition, eq(platform_integrations.platform, platform)))
    .limit(1);

  return row != null;
}

// ── Phase 3: Verification ──────────────────────────────────────────────────

async function verify(owners: DepletedOwner[]): Promise<void> {
  const userIds = owners.filter(o => o.type === 'user').map(o => o.id);
  const orgIds = owners.filter(o => o.type === 'org').map(o => o.id);

  const allIds = [...userIds, ...orgIds];
  if (allIds.length === 0) return;

  const configs = await db
    .select({
      owned_by_user_id: agent_configs.owned_by_user_id,
      owned_by_organization_id: agent_configs.owned_by_organization_id,
      platform: agent_configs.platform,
      config: agent_configs.config,
    })
    .from(agent_configs)
    .where(
      and(
        eq(agent_configs.agent_type, 'code_review'),
        sql`(${agent_configs.owned_by_user_id} = ANY(${userIds}) OR ${agent_configs.owned_by_organization_id} = ANY(${orgIds}))`
      )
    );

  let onTarget = 0;
  let notOnTarget = 0;
  for (const c of configs) {
    const model = (c.config as Record<string, unknown>).model_slug;
    if (model === TARGET_MODEL) {
      onTarget++;
    } else {
      notOnTarget++;
      console.log(
        `  [WARN] ${c.owned_by_user_id ?? c.owned_by_organization_id} (${c.platform}) still on '${model}'`
      );
    }
  }
  console.log(`Verification: ${onTarget} configs on MiniMax, ${notOnTarget} not on MiniMax`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  console.log(isDryRun ? 'DRY RUN — no changes will be made\n' : 'LIVE RUN\n');

  // Phase 1
  console.log('Phase 1: Finding depleted promo users...');
  const owners = await findDepletedPromoOwners();
  const users = owners.filter(o => o.type === 'user');
  const orgs = owners.filter(o => o.type === 'org');
  console.log(
    `Found ${owners.length} depleted owners (${users.length} users, ${orgs.length} orgs)\n`
  );

  if (owners.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (const o of owners) {
    console.log(`  ${o.type}: ${o.label} — $${o.balance_usd.toFixed(2)}`);
  }
  console.log('');

  // Phase 2
  console.log('Phase 2: Updating agent_configs...');
  const result = await migrateReviewModels(owners);
  for (const line of result.details) {
    console.log(line);
  }
  console.log(
    `\nPhase 2 complete: ${result.updated} updated, ${result.inserted} inserted, ${result.skipped} skipped\n`
  );

  // Phase 3
  if (!isDryRun) {
    console.log('Phase 3: Verification...');
    await verify(owners);
  }
}

void run()
  .then(async () => {
    console.log('\nScript completed successfully');
    await closeAllDrizzleConnections();
    process.exit(0);
  })
  .catch(async error => {
    console.error('Script failed:', error);
    await closeAllDrizzleConnections();
    process.exit(1);
  });
