import { Feather } from '@expo/vector-icons';
import { useGetConnections } from '@workspace/api-client-react';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp, getProfile } from '@/components/AppProvider';
import { LiveConnectionCard } from '@/components/LiveConnectionCard';
import { Avatar, Header, Shell } from '@/components/ui';
import { USE_LIVE_API } from '@/constants/config';
import { useColors } from '@/hooks/useColors';

function LiveMatches() {
  const colors = useColors();
  const connectionsQuery = useGetConnections();

  return (
    <Shell>
      <Header title="Matches" back={false} />
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>The people you both chose.</Text>
      {connectionsQuery.isPending ? (
        <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : connectionsQuery.isError ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginVertical: 16 }}>
          We couldn’t load your connections. Check your connection and try again.
        </Text>
      ) : connectionsQuery.data?.length ? (
        connectionsQuery.data.map((connection) => (
          <LiveConnectionCard key={connection.id} connection={connection} mode="matches" />
        ))
      ) : (
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginVertical: 16 }}>
          Your connections will appear here when you match with someone.
        </Text>
      )}
    </Shell>
  );
}

export default function MatchesScreen() {
  const colors = useColors();
  const { matches } = useApp();
  if (USE_LIVE_API) return <LiveMatches />;
  return <Shell><Header title="Matches" back={false} /><Text style={[styles.sub, { color: colors.mutedForeground }]}>The people you both chose.</Text><View style={styles.avatarRail}>{matches.map((match) => { const profile = getProfile(match.profileId); return profile ? <Pressable key={match.id} onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.id } })} style={styles.matchAvatar}><Avatar profile={profile} size={68} /><Text style={[styles.avatarName, { color: colors.foreground }]}>{profile.name}</Text></Pressable> : null; })}</View><Text style={[styles.section, { color: colors.foreground }]}>Recent connections</Text>{matches.map((match) => { const profile = getProfile(match.profileId); return profile ? <Pressable key={match.id} onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.id } })} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}><Avatar profile={profile} /><View style={{ flex: 1 }}><View style={styles.rowTop}><Text style={[styles.name, { color: colors.foreground }]}>{profile.name}</Text>{match.unread > 0 && <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{match.unread}</Text></View>}</View><Text style={[styles.message, { color: colors.mutedForeground }]} numberOfLines={1}>{match.lastMessage}</Text></View><Feather name="chevron-right" size={18} color={colors.mutedForeground} /></Pressable> : null; })}</Shell>;
}
const styles = StyleSheet.create({ sub: { fontSize: 13, marginTop: -10, marginBottom: 12 }, avatarRail: { flexDirection: 'row', gap: 14, paddingVertical: 8, marginBottom: 18 }, matchAvatar: { alignItems: 'center', width: 70 }, avatarName: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 6 }, section: { fontFamily: 'Inter_700Bold', fontSize: 22, marginBottom: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, borderWidth: 1, marginBottom: 10 }, name: { fontFamily: 'Inter_700Bold', fontSize: 15 }, rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, message: { fontSize: 12, marginTop: 5 }, badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }, badgeText: { color: '#fff', fontSize: 10, fontFamily: 'Inter_700Bold' } });