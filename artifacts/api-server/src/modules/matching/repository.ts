import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  inArray,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import {
  blocksTable,
  connectionsTable,
  db,
  messagesTable,
  profilePhotosTable,
  profilesTable,
  swipesTable,
  userPreferencesTable,
  usersTable,
} from "@workspace/db";
import {
  canonicalUserPair,
  isEligibleViewer,
  isPositiveSwipe,
  type MatchingViewer,
} from "./policy";
import {
  avatarIdFromObjectKey,
  defaultAvatarForUser,
  type GeneratedProfileAvatarId,
} from "../profiles/avatars";

type MatchingExecutor = Pick<typeof db, "select">;

export interface PublicProfile {
  userId: string;
  displayName: string;
  age: number;
  city: string;
  countryCode: string;
  bio: string;
  interests: string[];
  intention: string;
  verificationStatus: string;
  photoId: GeneratedProfileAvatarId;
}

export interface ConnectionView {
  id: string;
  status: string;
  matchedAt: Date;
  chatEnabledAt: Date | null;
  otherProfile: PublicProfile | null;
}

export interface IncomingLikeView {
  action: "like" | "super";
  createdAt: Date;
  profile: PublicProfile;
}

export interface UserNotification {
  id: string;
  kind: "like" | "match" | "message";
  title: string;
  body: string;
  createdAt: Date;
  userId: string | null;
  connectionId: string | null;
}

const profileAge = (birthDate: typeof profilesTable.birthDate) =>
  sql<number>`date_part('year', age(current_date, ${birthDate}))::int`;

export async function getMatchingViewer(
  executor: MatchingExecutor,
  userId: string,
): Promise<MatchingViewer | null> {
  const [row] = await executor
    .select({
      userId: usersTable.id,
      userStatus: usersTable.status,
      deletedAt: usersTable.deletedAt,
      age: profileAge(profilesTable.birthDate),
      displayName: profilesTable.displayName,
      birthDate: profilesTable.birthDate,
      city: profilesTable.city,
      countryCode: profilesTable.countryCode,
      bio: profilesTable.bio,
      profileInterests: profilesTable.interests,
      intention: profilesTable.intention,
      visibilityStatus: profilesTable.visibilityStatus,
      ageMin: userPreferencesTable.ageMin,
      ageMax: userPreferencesTable.ageMax,
      preferenceIntentions: userPreferencesTable.intentions,
      preferenceInterests: userPreferencesTable.interests,
      preferenceCities: userPreferencesTable.cities,
    })
    .from(usersTable)
    .innerJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .leftJoin(
      userPreferencesTable,
      eq(userPreferencesTable.userId, usersTable.id),
    )
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!row) return null;

  return {
    userId: row.userId,
    userStatus: row.userStatus,
    deletedAt: row.deletedAt,
    age: row.age,
    profile: {
      displayName: row.displayName,
      birthDate: row.birthDate,
      city: row.city,
      countryCode: row.countryCode,
      bio: row.bio,
      interests: row.profileInterests,
      intention: row.intention,
      visibilityStatus: row.visibilityStatus,
    },
    preferences: {
      ageMin: row.ageMin ?? 18,
      ageMax: row.ageMax ?? 99,
      intentions: row.preferenceIntentions ?? [],
      interests: row.preferenceInterests ?? [],
      cities: row.preferenceCities ?? [],
    },
  };
}

function candidateEligibility(viewer: MatchingViewer) {
  const candidateAge = profileAge(profilesTable.birthDate);

  return [
    eq(usersTable.status, "active"),
    isNull(usersTable.deletedAt),
    eq(profilesTable.visibilityStatus, "active"),
    gte(candidateAge, 18),
    gte(candidateAge, viewer.preferences.ageMin),
    sql`${candidateAge} <= ${viewer.preferences.ageMax}`,
    sql`coalesce(${userPreferencesTable.ageMin}, 18) <= ${viewer.age}`,
    sql`coalesce(${userPreferencesTable.ageMax}, 99) >= ${viewer.age}`,
    viewer.preferences.intentions.length > 0
      ? inArray(profilesTable.intention, viewer.preferences.intentions)
      : undefined,
    sql`cardinality(coalesce(${userPreferencesTable.intentions}, '{}'::text[])) = 0
      OR ${viewer.profile.intention} = ANY(coalesce(${userPreferencesTable.intentions}, '{}'::text[]))`,
    viewer.preferences.cities.length > 0
      ? inArray(profilesTable.city, viewer.preferences.cities)
      : undefined,
    sql`cardinality(coalesce(${userPreferencesTable.cities}, '{}'::text[])) = 0
      OR ${viewer.profile.city} = ANY(coalesce(${userPreferencesTable.cities}, '{}'::text[]))`,
    viewer.preferences.interests.length > 0
      ? sql`${profilesTable.interests} && ${viewer.preferences.interests}`
      : undefined,
    sql`cardinality(coalesce(${userPreferencesTable.interests}, '{}'::text[])) = 0
      OR ${profilesTable.interests} && coalesce(${userPreferencesTable.interests}, '{}'::text[])`,
  ];
}

function notBlockedEitherWay(viewerId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(blocksTable)
      .where(
        or(
          and(
            eq(blocksTable.blockerUserId, viewerId),
            eq(blocksTable.blockedUserId, profilesTable.userId),
          ),
          and(
            eq(blocksTable.blockerUserId, profilesTable.userId),
            eq(blocksTable.blockedUserId, viewerId),
          ),
        ),
      ),
  );
}

function notAlreadySwiped(viewerId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(swipesTable)
      .where(
        and(
          eq(swipesTable.actorUserId, viewerId),
          eq(swipesTable.targetUserId, profilesTable.userId),
        ),
      ),
  );
}

function notAlreadyConnected(viewerId: string) {
  return notExists(
    db
      .select({ one: sql`1` })
      .from(connectionsTable)
      .where(
        or(
          and(
            eq(connectionsTable.userLowId, viewerId),
            eq(connectionsTable.userHighId, profilesTable.userId),
          ),
          and(
            eq(connectionsTable.userHighId, viewerId),
            eq(connectionsTable.userLowId, profilesTable.userId),
          ),
        ),
      ),
  );
}

export async function findDiscoveryPage(
  viewer: MatchingViewer,
  limit: number,
  after?: string,
): Promise<{ items: PublicProfile[]; nextCursor: string | null }> {
  const rows = await db
    .select({
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      age: profileAge(profilesTable.birthDate),
      city: profilesTable.city,
      countryCode: profilesTable.countryCode,
      bio: profilesTable.bio,
      interests: profilesTable.interests,
      intention: profilesTable.intention,
      verificationStatus: profilesTable.verificationStatus,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
    .leftJoin(
      userPreferencesTable,
      eq(userPreferencesTable.userId, profilesTable.userId),
    )
    .where(
      and(
        ...candidateEligibility(viewer),
        ne(profilesTable.userId, viewer.userId),
        notAlreadySwiped(viewer.userId),
        notAlreadyConnected(viewer.userId),
        notBlockedEitherWay(viewer.userId),
        after ? gt(profilesTable.userId, after) : undefined,
      ),
    )
    .orderBy(asc(profilesTable.userId))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    items: await attachPhotoIds(page),
    nextCursor: hasMore ? (page.at(-1)?.userId ?? null) : null,
  };
}

export async function findIncomingLikes(
  userId: string,
): Promise<IncomingLikeView[]> {
  const rows = await db
    .select({
      action: swipesTable.action,
      createdAt: swipesTable.createdAt,
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      age: profileAge(profilesTable.birthDate),
      city: profilesTable.city,
      countryCode: profilesTable.countryCode,
      bio: profilesTable.bio,
      interests: profilesTable.interests,
      intention: profilesTable.intention,
      verificationStatus: profilesTable.verificationStatus,
    })
    .from(swipesTable)
    .innerJoin(usersTable, eq(usersTable.id, swipesTable.actorUserId))
    .innerJoin(profilesTable, eq(profilesTable.userId, usersTable.id))
    .where(
      and(
        eq(swipesTable.targetUserId, userId),
        inArray(swipesTable.action, ["like", "super"]),
        eq(usersTable.status, "active"),
        isNull(usersTable.deletedAt),
        eq(profilesTable.visibilityStatus, "active"),
        gte(profileAge(profilesTable.birthDate), 18),
        notAlreadySwiped(userId),
        notAlreadyConnected(userId),
        notBlockedEitherWay(userId),
      ),
    )
    .orderBy(desc(swipesTable.createdAt))
    .limit(50);

  return (await attachPhotoIds(rows)).map((row) => {
    const { action, createdAt, ...profile } = row;
    return {
      action: action as "like" | "super",
      createdAt,
      profile,
    };
  });
}

export async function findUserNotifications(
  userId: string,
): Promise<UserNotification[]> {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const notifications: UserNotification[] = [];
  const [likes, connections, unreadMessages] = await Promise.all([
    findIncomingLikes(userId),
    findConnectionsForUser(userId),
    db
      .select({
        id: messagesTable.id,
        connectionId: messagesTable.connectionId,
        senderUserId: messagesTable.senderUserId,
        displayName: profilesTable.displayName,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .innerJoin(
        connectionsTable,
        eq(connectionsTable.id, messagesTable.connectionId),
      )
      .innerJoin(usersTable, eq(usersTable.id, messagesTable.senderUserId))
      .innerJoin(profilesTable, eq(profilesTable.userId, messagesTable.senderUserId))
      .where(
        and(
          or(
            eq(connectionsTable.userLowId, userId),
            eq(connectionsTable.userHighId, userId),
          ),
          eq(connectionsTable.status, "chat_enabled"),
          isNull(connectionsTable.closedAt),
          ne(messagesTable.senderUserId, userId),
          isNull(messagesTable.readAt),
          gte(messagesTable.createdAt, since),
          eq(usersTable.status, "active"),
          isNull(usersTable.deletedAt),
          notBlockedEitherWay(userId),
        ),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(30),
  ]);

  for (const like of likes) {
    notifications.push({
      id: `like:${like.profile.userId}:${like.createdAt.toISOString()}`,
      kind: "like",
      title: "New like",
      body: `${like.profile.displayName} likes your profile.`,
      createdAt: like.createdAt,
      userId: like.profile.userId,
      connectionId: null,
    });
  }

  for (const connection of connections) {
    if (
      connection.status === "closed" ||
      connection.matchedAt < since ||
      !connection.otherProfile
    ) {
      continue;
    }
    notifications.push({
      id: `match:${connection.id}`,
      kind: "match",
      title: "You matched",
      body: `You and ${connection.otherProfile.displayName} liked each other.`,
      createdAt: connection.matchedAt,
      userId: connection.otherProfile.userId,
      connectionId: connection.id,
    });
  }

  for (const message of unreadMessages) {
    notifications.push({
      id: `message:${message.id}`,
      kind: "message",
      title: "New message",
      body: `${message.displayName} sent you a message.`,
      createdAt: message.createdAt,
      userId: message.senderUserId,
      connectionId: message.connectionId,
    });
  }

  return notifications
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 50);
}

async function isBlocked(
  executor: MatchingExecutor,
  userId: string,
  otherUserId: string,
): Promise<boolean> {
  const [block] = await executor
    .select({ one: sql`1` })
    .from(blocksTable)
    .where(
      or(
        and(
          eq(blocksTable.blockerUserId, userId),
          eq(blocksTable.blockedUserId, otherUserId),
        ),
        and(
          eq(blocksTable.blockerUserId, otherUserId),
          eq(blocksTable.blockedUserId, userId),
        ),
      ),
    )
    .limit(1);
  return Boolean(block);
}

export async function recordSwipe(
  actorUserId: string,
  targetUserId: string,
  action: "like" | "pass" | "super",
): Promise<
  | { error: "viewer_ineligible" | "target_unavailable" }
  | { targetUserId: string; action: "like" | "pass" | "super"; matched: boolean; connectionId: string | null }
> {
  return db.transaction(async (tx) => {
    const [userLowId, userHighId] = canonicalUserPair(
      actorUserId,
      targetUserId,
    );
    const pairLockKey = `${userLowId}:${userHighId}`;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${pairLockKey}, 0))`,
    );

    const viewer = await getMatchingViewer(tx, actorUserId);
    if (!isEligibleViewer(viewer)) return { error: "viewer_ineligible" };
    if (actorUserId === targetUserId) return { error: "target_unavailable" };

    const [target] = await tx
      .select({ userId: profilesTable.userId })
      .from(profilesTable)
      .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
      .leftJoin(
        userPreferencesTable,
        eq(userPreferencesTable.userId, profilesTable.userId),
      )
      .where(
        and(
          eq(profilesTable.userId, targetUserId),
          ...candidateEligibility(viewer),
        ),
      )
      .limit(1);
    if (!target || (await isBlocked(tx, actorUserId, targetUserId))) {
      return { error: "target_unavailable" };
    }

    await tx
      .insert(swipesTable)
      .values({ actorUserId, targetUserId, action })
      .onConflictDoUpdate({
        target: [swipesTable.actorUserId, swipesTable.targetUserId],
        set: { action, createdAt: new Date() },
      });

    if (!isPositiveSwipe(action)) {
      return { targetUserId, action, matched: false, connectionId: null };
    }

    const [reciprocalSwipe] = await tx
      .select({ action: swipesTable.action })
      .from(swipesTable)
      .where(
        and(
          eq(swipesTable.actorUserId, targetUserId),
          eq(swipesTable.targetUserId, actorUserId),
          inArray(swipesTable.action, ["like", "super"]),
        ),
      )
      .limit(1);

    if (!reciprocalSwipe || (await isBlocked(tx, actorUserId, targetUserId))) {
      return { targetUserId, action, matched: false, connectionId: null };
    }

    const [created] = await tx
      .insert(connectionsTable)
      .values({ userLowId, userHighId })
      .onConflictDoNothing({
        target: [connectionsTable.userLowId, connectionsTable.userHighId],
      })
      .returning({
        id: connectionsTable.id,
        status: connectionsTable.status,
      });

    const [connection] = created
      ? [created]
      : await tx
          .select({
            id: connectionsTable.id,
            status: connectionsTable.status,
          })
          .from(connectionsTable)
          .where(
            and(
              eq(connectionsTable.userLowId, userLowId),
              eq(connectionsTable.userHighId, userHighId),
            ),
          )
          .limit(1);

    const isActiveConnection =
      connection?.status === "matched" ||
      connection?.status === "chat_enabled";
    return {
      targetUserId,
      action,
      matched: isActiveConnection,
      connectionId: isActiveConnection ? connection.id : null,
    };
  });
}

async function getPublicProfiles(
  userIds: string[],
): Promise<Map<string, PublicProfile>> {
  if (userIds.length === 0) return new Map();

  const rows = await db
    .select({
      userId: profilesTable.userId,
      displayName: profilesTable.displayName,
      age: profileAge(profilesTable.birthDate),
      city: profilesTable.city,
      countryCode: profilesTable.countryCode,
      bio: profilesTable.bio,
      interests: profilesTable.interests,
      intention: profilesTable.intention,
      verificationStatus: profilesTable.verificationStatus,
    })
    .from(profilesTable)
    .innerJoin(usersTable, eq(usersTable.id, profilesTable.userId))
    .where(
      and(
        inArray(profilesTable.userId, userIds),
        eq(usersTable.status, "active"),
        isNull(usersTable.deletedAt),
        gte(profileAge(profilesTable.birthDate), 18),
      ),
    );

  const profiles = await attachPhotoIds(rows);
  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

async function attachPhotoIds<T extends { userId: string }>(
  profiles: T[],
): Promise<Array<T & { photoId: GeneratedProfileAvatarId }>> {
  if (profiles.length === 0) return [];

  const userIds = [...new Set(profiles.map((profile) => profile.userId))];
  const photos = await db
    .select({
      userId: profilePhotosTable.userId,
      objectKey: profilePhotosTable.objectKey,
    })
    .from(profilePhotosTable)
    .where(
      and(
        inArray(profilePhotosTable.userId, userIds),
        eq(profilePhotosTable.position, 0),
        eq(profilePhotosTable.moderationStatus, "approved"),
      ),
    );
  const photoKeys = new Map(photos.map((photo) => [photo.userId, photo.objectKey]));

  return profiles.map((profile) => ({
    ...profile,
    photoId:
      avatarIdFromObjectKey(photoKeys.get(profile.userId)) ??
      defaultAvatarForUser(profile.userId),
  }));
}

function otherParticipantId(userId: string) {
  return sql<string>`case
    when ${connectionsTable.userLowId} = ${userId}
    then ${connectionsTable.userHighId}
    else ${connectionsTable.userLowId}
  end`;
}

export async function findConnectionsForUser(
  userId: string,
): Promise<ConnectionView[]> {
  const rows = await db
    .select({
      id: connectionsTable.id,
      status: connectionsTable.status,
      matchedAt: connectionsTable.matchedAt,
      chatEnabledAt: connectionsTable.chatEnabledAt,
      otherUserId: otherParticipantId(userId),
    })
    .from(connectionsTable)
    .where(
      or(
        eq(connectionsTable.userLowId, userId),
        eq(connectionsTable.userHighId, userId),
      ),
    )
    .orderBy(desc(connectionsTable.updatedAt), desc(connectionsTable.id));

  const profiles = await getPublicProfiles(
    rows.map((connection) => connection.otherUserId),
  );
  return rows
    .filter((connection) => profiles.has(connection.otherUserId))
    .map(({ otherUserId: _otherUserId, ...connection }) => ({
      ...connection,
      otherProfile: profiles.get(_otherUserId)!,
    }));
}

export async function findConnectionForUser(
  userId: string,
  connectionId: string,
): Promise<ConnectionView | null> {
  const [row] = await db
    .select({
      id: connectionsTable.id,
      status: connectionsTable.status,
      matchedAt: connectionsTable.matchedAt,
      chatEnabledAt: connectionsTable.chatEnabledAt,
      otherUserId: otherParticipantId(userId),
    })
    .from(connectionsTable)
    .where(
      and(
        eq(connectionsTable.id, connectionId),
        or(
          eq(connectionsTable.userLowId, userId),
          eq(connectionsTable.userHighId, userId),
        ),
      ),
    )
    .limit(1);
  if (!row) return null;

  const profiles = await getPublicProfiles([row.otherUserId]);
  const otherProfile = profiles.get(row.otherUserId);
  if (!otherProfile) return null;

  return {
    id: row.id,
    status: row.status,
    matchedAt: row.matchedAt,
    chatEnabledAt: row.chatEnabledAt,
    otherProfile,
  };
}
