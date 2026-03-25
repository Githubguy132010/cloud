import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/drizzle';
import {
  credit_transactions,
  kilocode_users,
  kiloclaw_subscriptions,
} from '@kilocode/db/schema';
import { processTopUp } from '@/lib/credits';
import { autoResumeIfSuspended } from '@/lib/kiloclaw/stripe-handlers';
import { maybeIssueKiloPassBonusFromUsageThreshold } from '@/lib/kilo-pass/usage-triggered-bonus';
import { sentryLogger } from '@/lib/utils.server';

const logInfo = sentryLogger('kiloclaw-credit-billing', 'info');
const logWarning = sentryLogger('kiloclaw-credit-billing', 'warning');
const logError = sentryLogger('kiloclaw-credit-billing', 'error');

/**
 * Settle a Stripe-funded KiloClaw invoice into the credit ledger.
 *
 * Creates a balance-neutral credit pair (positive deposit + matching negative deduction),
 * converts the subscription to hybrid state (payment_source='credits' with
 * stripe_subscription_id preserved), and advances the billing period from
 * invoice-derived boundaries.
 */
export async function applyStripeFundedKiloClawPeriod(params: {
  userId: string;
  stripeSubscriptionId: string;
  chargeId: string;
  plan: 'commit' | 'standard';
  amountMicrodollars: number;
  periodStart: string;
  periodEnd: string;
}): Promise<void> {
  const {
    userId,
    stripeSubscriptionId,
    chargeId,
    plan,
    amountMicrodollars,
    periodStart,
    periodEnd,
  } = params;

  const amountCents = Math.round(amountMicrodollars / 10_000);
  const periodStartDate = periodStart.slice(0, 10); // YYYY-MM-DD

  let wasSuspended = false;

  await db.transaction(async tx => {
    // Fetch the user row — processTopUp needs the full User record.
    const user = await tx.query.kilocode_users.findFirst({
      where: eq(kilocode_users.id, userId),
    });

    if (!user) {
      logWarning('User not found for credit settlement', { user_id: userId, chargeId });
      return;
    }

    // Step 1a: Create the positive credit deposit via processTopUp.
    // processTopUp uses stripe_payment_id uniqueness for idempotency.
    const deposited = await processTopUp(
      user,
      amountCents,
      { type: 'stripe', stripe_payment_id: chargeId },
      {
        skipPostTopUpFreeStuff: true,
        dbOrTx: tx,
        creditDescription: `KiloClaw ${plan} settlement`,
      }
    );

    if (!deposited) {
      // Duplicate charge — already processed. Return early (idempotent).
      logInfo('Duplicate charge skipped', { user_id: userId, chargeId });
      return;
    }

    // Step 1b: Insert the matching negative credit deduction.
    const deductionCategory = `kiloclaw-settlement:${stripeSubscriptionId}:${periodStartDate}`;

    const deductionResult = await tx
      .insert(credit_transactions)
      .values({
        id: crypto.randomUUID(),
        kilo_user_id: userId,
        amount_microdollars: -amountMicrodollars,
        is_free: false,
        description: `KiloClaw ${plan} period deduction`,
        credit_category: deductionCategory,
        check_category_uniqueness: true,
        original_baseline_microdollars_used: user.microdollars_used,
      })
      .onConflictDoNothing();

    const deductionIsNew = (deductionResult.rowCount ?? 0) > 0;

    if (deductionIsNew) {
      // Step 1c: Decrement total_microdollars_acquired to make the operation balance-neutral.
      // processTopUp already incremented by amountMicrodollars; this reverses it.
      // Only decrement on new deductions — a duplicate deduction means the prior
      // transaction already decremented.
      await tx
        .update(kilocode_users)
        .set({
          total_microdollars_acquired: sql`${kilocode_users.total_microdollars_acquired} - ${amountMicrodollars}`,
        })
        .where(eq(kilocode_users.id, userId));
    } else {
      logInfo('Duplicate deduction skipped, proceeding with subscription update', {
        user_id: userId,
        deductionCategory,
      });
    }

    // Step 1d: Read existing subscription row to check for suspension and scheduled plan.
    // Match on stripe_subscription_id for correctness when multiple instances exist.
    const [existingRow] = await tx
      .select({
        suspended_at: kiloclaw_subscriptions.suspended_at,
        scheduled_plan: kiloclaw_subscriptions.scheduled_plan,
        scheduled_by: kiloclaw_subscriptions.scheduled_by,
        stripe_schedule_id: kiloclaw_subscriptions.stripe_schedule_id,
      })
      .from(kiloclaw_subscriptions)
      .where(eq(kiloclaw_subscriptions.user_id, userId))
      .limit(1);

    wasSuspended = !!existingRow?.suspended_at;

    // If a scheduled plan change matches the settled plan, clear the schedule.
    const shouldClearSchedule = existingRow?.scheduled_plan === plan;

    const commitEndsAt = plan === 'commit' ? periodEnd : null;

    // Upsert the subscription row to hybrid state.
    await tx
      .insert(kiloclaw_subscriptions)
      .values({
        user_id: userId,
        stripe_subscription_id: stripeSubscriptionId,
        payment_source: 'credits',
        plan,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
        credit_renewal_at: periodEnd,
        commit_ends_at: commitEndsAt,
        past_due_since: null,
        auto_top_up_triggered_for_period: null,
        ...(shouldClearSchedule
          ? { scheduled_plan: null, scheduled_by: null, stripe_schedule_id: null }
          : {}),
      })
      .onConflictDoUpdate({
        target: kiloclaw_subscriptions.user_id,
        set: {
          stripe_subscription_id: stripeSubscriptionId,
          payment_source: 'credits',
          status: 'active',
          plan,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          credit_renewal_at: periodEnd,
          commit_ends_at: commitEndsAt,
          past_due_since: null,
          auto_top_up_triggered_for_period: null,
          ...(shouldClearSchedule
            ? { scheduled_plan: null, scheduled_by: null, stripe_schedule_id: null }
            : {}),
        },
      });
  });

  // Step 2: Post-transaction side effects.

  if (wasSuspended) {
    await autoResumeIfSuspended(userId);
  }

  // Best-effort Kilo Pass bonus evaluation.
  try {
    await maybeIssueKiloPassBonusFromUsageThreshold({
      kiloUserId: userId,
      nowIso: new Date().toISOString(),
    });
  } catch (error) {
    logError('Kilo Pass bonus evaluation failed after settlement', {
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  logInfo('Credit settlement completed', {
    user_id: userId,
    plan,
    stripe_subscription_id: stripeSubscriptionId,
    chargeId,
    amountMicrodollars,
  });
}
