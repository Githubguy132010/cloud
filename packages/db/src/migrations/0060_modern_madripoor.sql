ALTER TABLE "kiloclaw_subscriptions" ADD COLUMN "instance_id" uuid;--> statement-breakpoint
ALTER TABLE "kiloclaw_subscriptions" ADD COLUMN "payment_source" text;--> statement-breakpoint
ALTER TABLE "kiloclaw_subscriptions" ADD COLUMN "credit_renewal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kiloclaw_subscriptions" ADD COLUMN "auto_top_up_triggered_for_period" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "kiloclaw_subscriptions" ADD CONSTRAINT "kiloclaw_subscriptions_instance_id_kiloclaw_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."kiloclaw_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_kiloclaw_subscriptions_instance" ON "kiloclaw_subscriptions" USING btree ("instance_id") WHERE "kiloclaw_subscriptions"."instance_id" is not null;--> statement-breakpoint
ALTER TABLE "kiloclaw_subscriptions" ADD CONSTRAINT "kiloclaw_subscriptions_payment_source_check" CHECK ("kiloclaw_subscriptions"."payment_source" IN ('stripe', 'credits'));