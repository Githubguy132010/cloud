-- Backfill instance_id on existing kiloclaw_subscriptions rows.
-- For each subscription, set instance_id to the user's active (non-destroyed) instance.
-- Rows with no matching instance (e.g. user destroyed their instance) are left NULL.
--
-- Safety: kiloclaw_subscriptions has a UNIQUE constraint on user_id, so there is
-- exactly one subscription row per user. If a user has multiple active instances
-- (different sandbox_ids), this picks one arbitrarily — acceptable because multi-
-- instance support is not yet live.
UPDATE "kiloclaw_subscriptions" s
SET "instance_id" = (
  SELECT i."id"
  FROM "kiloclaw_instances" i
  WHERE i."user_id" = s."user_id"
    AND i."destroyed_at" IS NULL
  LIMIT 1
);

-- Backfill payment_source to 'stripe' for existing rows that have a Stripe subscription ID.
-- Rows without a Stripe subscription ID (trial-only rows, for example) are left NULL.
UPDATE "kiloclaw_subscriptions"
SET "payment_source" = 'stripe'
WHERE "stripe_subscription_id" IS NOT NULL
  AND "payment_source" IS NULL;
