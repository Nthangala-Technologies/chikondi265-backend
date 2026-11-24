import { db, subscriptionPlansTable, subscriptionsTable } from "@workspace/db";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export async function findActiveSubscription(userId: string) {
  const [subscription] = await db.select({
    startedAt: subscriptionsTable.startedAt,
    expiresAt: subscriptionsTable.expiresAt,
  }).from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.userId, userId),
      sql`${subscriptionsTable.status} = 'active'`,
      sql`${subscriptionsTable.startedAt} <= statement_timestamp()`,
      sql`${subscriptionsTable.expiresAt} > statement_timestamp()`,
    ))
    .orderBy(desc(subscriptionsTable.expiresAt))
    .limit(1);
  return subscription ?? null;
}

export function listSubscriptionPlans() {
  return db.select().from(subscriptionPlansTable).orderBy(
    asc(sql`case ${subscriptionPlansTable.plan} when 'daily' then 1 when 'weekly' then 2 else 3 end`),
  );
}
