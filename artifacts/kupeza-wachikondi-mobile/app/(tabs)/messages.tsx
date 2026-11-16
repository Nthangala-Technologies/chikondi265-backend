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
      <Text style={[styles.sub, { color: colors.mutedForeground }]}>
        Keep the conversation here until you feel comfortable.
      </Text>
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
  return <Shell><Header title="Messages" back={false} /><Text style={[styles.sub, { color: colors.mutedForeground }]}>Keep the conversation here until you feel comfortable.</Text>{matches.map((match) => { const profile = getProfile(match.profileId); return profile ? <Pressable key={match.id} onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.id } })} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}><Avatar profile={profile} /><View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.foreground }]}>{profile.name}</Text><Text style={[styles.message, { color: colors.mutedForeground }]} numberOfLines={1}>{match.lastMessage}</Text></View><Text style={[styles.time, { color: colors.mutedForeground }]}>now</Text></Pressable> : null; })}</Shell>;
}
const styles = StyleSheet.create({ sub: { fontSize: 13, marginTop: -10, marginBottom: 18, lineHeight: 19 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, borderWidth: 1, marginBottom: 10 }, name: { fontFamily: 'Inter_700Bold', fontSize: 15 }, message: { fontSize: 12, marginTop: 5 }, time: { fontSize: 10 } });