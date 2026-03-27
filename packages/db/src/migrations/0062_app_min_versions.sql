CREATE TABLE "app_min_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ios_min_version" text NOT NULL DEFAULT '1.0.0',
  "android_min_version" text NOT NULL DEFAULT '1.0.0',
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "app_min_versions" ("ios_min_version", "android_min_version") VALUES ('1.0.0', '1.0.0');
