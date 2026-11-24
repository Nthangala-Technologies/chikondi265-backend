CREATE TABLE "subscription_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "plan" text NOT NULL REFERENCES "subscription_plans" ("plan"),
  "provider" text NOT NULL DEFAULT 'paychangu',
  "tx_ref" text NOT NULL,
  "checkout_url" text,
  "provider_transaction_id" text,
  "idempotency_key" text NOT NULL,
  "amount_mwk" integer NOT NULL,
  "currency" char(3) NOT NULL DEFAULT 'MWK',
  "status" text NOT NULL DEFAULT 'pending',
  "failure_code" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "verified_at" timestamptz,
  CONSTRAINT "subscription_payment_attempts_tx_ref_unique" UNIQUE ("tx_ref"),
  CONSTRAINT "subscription_payment_attempts_user_idempotency_unique" UNIQUE ("user_id", "idempotency_key"),
  CONSTRAINT "subscription_payment_attempts_provider_transaction_unique" UNIQUE ("provider", "provider_transaction_id"),
  CONSTRAINT "subscription_payment_attempts_amount_check" CHECK ("amount_mwk" > 0),
  CONSTRAINT "subscription_payment_attempts_provider_check" CHECK ("provider" = 'paychangu'),
  CONSTRAINT "subscription_payment_attempts_currency_check" CHECK ("currency" = 'MWK'),
  CONSTRAINT "subscription_payment_attempts_status_check" CHECK ("status" IN ('pending', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "subscription_payment_attempts_user_created_idx"
ON "subscription_payment_attempts" ("user_id", "created_at");
