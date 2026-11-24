# Subscription plans: first backend release

This release adds `GET /api/v1/subscriptions/plans`. It returns the daily, weekly and monthly plan prices from PostgreSQL and the requesting user's subscription expiry, or `null`. No changes are made to existing per-chat access, checkout or settled payments. This release does not enable subscription purchasing or switch chat to subscriptions.

## Deployment order

1. Confirm which PostgreSQL instance Dokploy currently uses and that it has a recoverable backup. Check the schema and Drizzle journal. Some migrations on this project have been applied manually; do not rerun the whole migration history against an existing database.
2. Apply the missing additive migrations in journal order: `0008_add_profile_gender.sql` (nullable column; retained here so it cannot be skipped by a later release) and `0009_add_chat_subscriptions.sql`. Verify both subscription tables and the seeded rows: daily 1,500 MWK, weekly 4,000 MWK, monthly 7,500 MWK.
3. Deploy the approved backend commit from Dokploy. Verify readiness and, from an already-signed-in session, confirm that `GET /api/v1/subscriptions/plans` returns 200 with all three plans and `activeUntil`. A signed-out 401 alone cannot prove the route is present because unmatched v1 routes also pass through auth middleware.
4. If the rollout needs to be reversed, redeploy the previous API image. The old version ignores the new tables and column; no schema rollback or data deletion is required.

Do not switch chat to subscription-only access until there is a working purchase path and an agreed policy for existing paid chat unlocks.
