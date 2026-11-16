import { Feather } from '@expo/vector-icons';
import { useGetNotifications } from '@workspace/api-client-react';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Header, Shell } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

const icons = {
  like: 'heart',
  match: 'users',
  message: 'message-circle',
} as const;

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(value).toLocaleDateString();
}

export default function NotificationsScreen() {
  const colors = useColors();
  const notificationsQuery = useGetNotifications({
    query: { refetchInterval: 15_000 },
  });
  const items = notificationsQuery.data?.items ?? [];

  return (
    <Shell>
      <Header title="Notifications" back />
      {notificationsQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={colors.primary} /></View>
      ) : notificationsQuery.isError ? (
        <View style={styles.state}>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            We couldn’t load your notifications. Check your connection and try again.
          </Text>
          <Pressable onPress={() => void notificationsQuery.refetch()} accessibilityRole="button">
            <Text style={[styles.retry, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          <Feather name="bell" size={22} color={colors.mutedForeground} />
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>
            New likes, matches, and unread messages will appear here.
          </Text>
        </View>
      ) : items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => {
            if (item.kind === 'like') router.push('/(tabs)/likes');
            else if (item.kind === 'match') router.push('/(tabs)/matches');
            else if (item.connectionId) router.push({ pathname: '/chat/[matchId]', params: { matchId: item.connectionId } });
          }}
          style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
          testID={`notification-${item.kind}-${item.id}`}
        >
          <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
            <Feather name={icons[item.kind]} size={17} color={colors.secondaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[styles.copy, { color: colors.mutedForeground }]}>{item.body}</Text>
            <Text style={[styles.time, { color: colors.mutedForeground }]}>{relativeTime(item.createdAt)}</Text>
          </View>
        </Pressable>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  icon: { width: 36, height: 36, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  copy: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  time: { fontSize: 10, marginTop: 7 },
  state: { minHeight: 220, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  retry: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
