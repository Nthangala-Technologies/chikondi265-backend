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
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const date = new Date(value);
  if (hours < 24 && date.toDateString() === new Date().toDateString()) return `${hours}h`;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (minutes < 7 * 24 * 60) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
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
          <Feather name="bell" size={24} color={colors.mutedForeground} />
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
          style={styles.row}
          testID={`notification-${item.kind}-${item.id}`}
          android_ripple={{ color: colors.ripple }}
        >
          <View style={[styles.icon, { backgroundColor: colors.surfaceVariant }]}>
            <Feather name={icons[item.kind]} size={24} color={colors.secondaryForeground} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.time, { color: colors.onSurfaceVariant }]}>{relativeTime(item.createdAt)}</Text>
            </View>
            <Text style={[styles.copy, { color: colors.onSurfaceVariant }]} numberOfLines={1}>{item.body}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
        </Pressable>
      ))}
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  copy: { fontSize: 14, lineHeight: 18, marginTop: 4 },
  time: { fontSize: 12 },
  divider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: 1 },
  state: { minHeight: 220, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24 },
  retry: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
