import { Feather } from '@expo/vector-icons';
import {
  getGetConnectionsQueryKey,
  getGetDiscoveryQueryKey,
  getGetIncomingLikesQueryKey,
  getGetNotificationsQueryKey,
  useGetIncomingLikes,
  useRecordSwipe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Header, PhotoAvatar, Shell } from '@/components/ui';
import { defaultAvatarForUser } from '@/components/AppProvider';
import { useColors } from '@/hooks/useColors';
import { useErrorModal } from '@/components/ErrorModal';
import { getIntentionLabel } from '@/utils/intentions';

export default function LikesScreen() {
  const colors = useColors();
  const { showError } = useErrorModal();
  const queryClient = useQueryClient();
  const likesQuery = useGetIncomingLikes({
    query: { refetchInterval: 15_000 },
  });
  const respondToLike = useRecordSwipe();
  const [actingOn, setActingOn] = useState<string | null>(null);
  const people = likesQuery.data?.items ?? [];

  async function respond(userId: string, action: 'like' | 'pass') {
    if (actingOn) return;
    setActingOn(userId);
    try {
      const result = await respondToLike.mutateAsync({
        data: { targetUserId: userId, action },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
      ]);
      if (result.matched) {
        Alert.alert("It's a match", 'You both liked each other.', [
          { text: 'View matches', onPress: () => router.push('/(tabs)/matches') },
          { text: 'Stay here', style: 'cancel' },
        ]);
      }
    } catch {
      showError(
        'We couldn’t save your response. Check your connection and try again.',
        'Response not saved',
      );
    } finally {
      setActingOn(null);
    }
  }

  return (
    <Shell>
      <Header title="Likes" back={false} />
      {likesQuery.isPending ? (
        <View style={styles.state}><ActivityIndicator color={colors.primary} /></View>
      ) : likesQuery.isError ? (
        <View style={styles.state}>
          <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
            We couldn’t load your likes. Check your connection and try again.
          </Text>
          <Button onPress={() => void likesQuery.refetch()} secondary icon="repeat">Try again</Button>
        </View>
      ) : people.length === 0 ? (
        <View style={styles.state}>
          <Feather name="heart" size={24} color={colors.mutedForeground} />
          <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
            New likes from active profiles will appear here.
          </Text>
        </View>
      ) : (
        <>
          <Text style={[styles.count, { color: colors.foreground }]}>
            {people.length} {people.length === 1 ? 'person likes' : 'people like'} you
          </Text>
          {people.map(({ action, profile }) => {
            const busy = actingOn === profile.userId;
            return (
              <Pressable
                key={profile.userId}
                accessibilityRole="button"
                accessibilityLabel={`View ${profile.displayName}'s profile`}
                android_ripple={{ color: colors.ripple }}
                onPress={() => router.push({ pathname: '/discover/[id]', params: { id: profile.userId } })}
                style={styles.row}
                testID={`incoming-like-${profile.userId}`}
              >
                <PhotoAvatar
                  photo={profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(profile.userId)}
                  size={52}
                />
                <View style={styles.copy}>
                  <View style={styles.titleRow}>
                    <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>
                      {profile.displayName}, {profile.age}
                    </Text>
                    <Text style={[styles.likeType, { color: colors.onSurfaceVariant }]}>
                      {action === 'super' ? 'Super like' : 'Like'}
                    </Text>
                  </View>
                  <Text style={[styles.meta, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                    {profile.city} · {getIntentionLabel(profile.intention)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Like ${profile.displayName} back`}
                  disabled={Boolean(actingOn)}
                  onPress={() => void respond(profile.userId, 'like')}
                  style={[styles.action, { backgroundColor: colors.primary, opacity: actingOn && !busy ? 0.5 : 1 }]}
                  testID={`like-back-${profile.userId}`}
                >
                  {busy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="heart" size={20} color={colors.primaryForeground} />}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Pass on ${profile.displayName}`}
                  disabled={Boolean(actingOn)}
                  onPress={() => void respond(profile.userId, 'pass')}
                  style={styles.pass}
                  testID={`pass-like-${profile.userId}`}
                >
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </Pressable>
                <View style={[styles.divider, { backgroundColor: colors.divider }]} />
              </Pressable>
            );
          })}
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  count: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginBottom: 4, paddingHorizontal: 16 },
  row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, position: 'relative' },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  likeType: { fontSize: 12 },
  meta: { fontSize: 14, marginTop: 4 },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  divider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: 1 },
  state: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  stateCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
