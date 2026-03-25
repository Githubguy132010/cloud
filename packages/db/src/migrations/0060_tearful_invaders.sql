ALTER TABLE "kiloclaw_instances" ADD COLUMN "instance_id" text;--> statement-breakpoint
ALTER TABLE "kiloclaw_instances" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
-- Backfill: generate 12-char hex instance_id for every existing row.
-- Uses left(replace(gen_random_uuid()::text, '-', ''), 12) to match
-- the application-level generateInstanceId() format.
UPDATE "kiloclaw_instances"
  SET "instance_id" = left(replace(gen_random_uuid()::text, '-', ''), 12)
  WHERE "instance_id" IS NULL;--> statement-breakpoint
ALTER TABLE "kiloclaw_instances" ADD CONSTRAINT "kiloclaw_instances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_kiloclaw_instances_instance_id_active" ON "kiloclaw_instances" USING btree ("instance_id") WHERE "kiloclaw_instances"."destroyed_at" is null;