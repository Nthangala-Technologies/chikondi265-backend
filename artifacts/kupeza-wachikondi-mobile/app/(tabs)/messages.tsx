import React from 'react';
import { router } from 'expo-router';
import { useGetConnections } from '@workspace/api-client-react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useApp, getProfile } from '@/components/AppProvider';
import { LiveConnectionCard } from '@/components/LiveConnectionCard';
import { Avatar, Header, Shell } from '@/components/ui';
import { USE_LIVE_API } from '@/constants/config';
import { useColors } from '@/hooks/useColors';

function LiveMessages() {
  const colors = useColors();
  const connectionsQuery = useGetConnections();

  return (
    <Shell>
      <Header title="Messages" back={false} />
      {connectionsQuery.isPending ? (
        <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : connectionsQuery.isError ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20 }}>
          We couldn’t load your messages. Check your connection and try again.
        </Text>
      ) : connectionsQuery.data?.length ? (
        connectionsQuery.data.map((connection) => (
          <LiveConnectionCard key={connection.id} connection={connection} mode="messages" />
        ))
      ) : (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20 }}>
          Your conversations will appear here after you connect with someone.
        </Text>
      )}
    </Shell>
  );
}

export default function MessagesScreen() {
  const colors = useColors();
  const { matches } = useApp();
  if (USE_LIVE_API) return <LiveMessages />;
  return (
    <Shell>
      <Header title="Messages" back={false} />
      {matches.map((match) => {
        const profile = getProfile(match.profileId);
        if (!profile) return null;
        const preview = match.lastMessage?.trim() || 'Say hi';
        return (
          <Pressable
            key={match.id}
            accessibilityRole="button"
            accessibilityLabel={`${profile.name}, ${preview}`}
            android_ripple={{ color: colors.ripple }}
            onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.id } })}
            style={styles.row}
          >
            <Avatar profile={profile} />
            <View style={styles.rowCopy}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>{profile.name}</Text>
                <Text style={[styles.time, { color: colors.onSurfaceVariant }]}>now</Text>
              </View>
              <Text style={[styles.message, { color: colors.onSurfaceVariant }, !match.lastMessage && styles.emptyMessage]} numberOfLines={1}>
                {preview}
              </Text>
            </View>
            {match.unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{match.unread}</Text>
              </View>
            ) : null}
            <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          </Pressable>
        );
      })}
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  message: { fontSize: 14, lineHeight: 18 },
  emptyMessage: { fontStyle: 'italic' },
  time: { fontSize: 12 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, fontFamily: 'Inter_700Bold' },
  divider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: 1 },
});