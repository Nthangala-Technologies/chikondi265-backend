CREATE TABLE "subscription_plans" (
  "plan" text PRIMARY KEY,
  "amount_mwk" integer NOT NULL,
  CONSTRAINT "subscription_plans_plan_check" CHECK ("plan" IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT "subscription_plans_amount_check" CHECK ("amount_mwk" > 0)
);
--> statement-breakpoint
INSERT INTO "subscription_plans" ("plan", "amount_mwk")
VALUES ('daily', 1500), ('weekly', 4000), ('monthly', 7500);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "plan" text NOT NULL REFERENCES "subscription_plans" ("plan"),
  "status" text NOT NULL,
  "started_at" timestamptz NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "provider" text NOT NULL,
  CONSTRAINT "subscriptions_status_check" CHECK ("status" IN ('active', 'expired', 'cancelled', 'pending')),
  CONSTRAINT "subscriptions_access_window_check" CHECK ("expires_at" > "started_at")
);
--> statement-breakpoint
CREATE INDEX "subscriptions_user_active_idx" ON "subscriptions" ("user_id", "expires_at")
WHERE "status" = 'active';
