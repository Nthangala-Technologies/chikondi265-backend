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
import { getIntentionLabel } from '@/utils/intentions';

export default function LikesScreen() {
  const colors = useColors();
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
      Alert.alert('Could not save your response', 'Check your connection and try again.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <Shell>
      <Header title="Likes" back={false} />
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="heart" size={20} color={colors.primary} />
        <Text style={[styles.heroTitle, { color: colors.foreground }]}>People who chose you</Text>
        <Text style={[styles.heroCopy, { color: colors.mutedForeground }]}>
          Incoming likes refresh while this screen is open.
        </Text>
      </View>

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
          <Feather name="heart" size={22} color={colors.mutedForeground} />
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
              <View key={profile.userId} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <PhotoAvatar
                  photo={profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(profile.userId)}
                  size={56}
                />
                <View style={styles.copy}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{profile.displayName}, {profile.age}</Text>
                  <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {profile.city} · {getIntentionLabel(profile.intention)}
                  </Text>
                  {action === 'super' ? <Text style={[styles.super, { color: colors.primary }]}>Super like</Text> : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Like ${profile.displayName} back`}
                  disabled={Boolean(actingOn)}
                  onPress={() => void respond(profile.userId, 'like')}
                  style={[styles.action, { backgroundColor: colors.primary, opacity: actingOn && !busy ? 0.5 : 1 }]}
                  testID={`like-back-${profile.userId}`}
                >
                  {busy ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="heart" size={18} color="#fff" />}
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
              </View>
            );
          })}
        </>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 20, borderWidth: 1, marginBottom: 18 },
  heroTitle: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 10 },
  heroCopy: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  count: { fontFamily: 'Inter_700Bold', fontSize: 17, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, borderWidth: 1, marginBottom: 10 },
  copy: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  meta: { fontSize: 12, marginTop: 4 },
  super: { fontSize: 11, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  state: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  stateCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
