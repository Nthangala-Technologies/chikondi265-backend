import { Feather, Ionicons } from '@expo/vector-icons';
import {
  getGetConnectionsQueryKey,
  getGetDiscoveryQueryKey,
  getGetIncomingLikesQueryKey,
  getGetNotificationsQueryKey,
  useCreateBlock,
  useGetDiscovery,
  useRecordSwipe,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, imageFor } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { useErrorModal } from '@/components/ErrorModal';
import { toMobileProfile } from '@/utils/live-profile';

const cardShadowStyle = Platform.select({
  web: { boxShadow: '0px 12px 24px rgba(19,13,24,0.25)' },
  default: {
    shadowColor: '#130d18',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
});

export default function ProfileDetail() {
  const colors = useColors();
  const { account } = useAuth();
  const { showError } = useErrorModal();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { id, origin } = useLocalSearchParams<{ id: string; origin?: string }>();
  const queryClient = useQueryClient();
  const viewerQueryId = account?.userId ?? 'signed-out';
  const discoveryQuery = useGetDiscovery(undefined, {
    query: {
      enabled: Boolean(account?.userId),
      queryKey: [...getGetDiscoveryQueryKey(), viewerQueryId],
    },
  });
  const swipeMutation = useRecordSwipe();
  const blockMutation = useCreateBlock();
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const apiProfile = discoveryQuery.data?.items.find(
    (item) => item.userId === id && item.userId !== account?.userId,
  );
  const profile = apiProfile ? toMobileProfile(apiProfile) : undefined;
  const parsedOrigin = origin?.split(',').map(Number);
  const originFrame = parsedOrigin?.length === 4
    && parsedOrigin.every(Number.isFinite)
    && parsedOrigin[2] > 0
    && parsedOrigin[3] > 0
    ? { x: parsedOrigin[0], y: parsedOrigin[1], width: parsedOrigin[2], height: parsedOrigin[3] }
    : undefined;
  const cardWidth = Math.max(0, windowWidth - 24);
  const cardHeight = Math.max(0, Math.min(windowHeight - insets.top - insets.bottom - 24, 740));
  const cardLeft = (windowWidth - cardWidth) / 2;
  const cardTop = Math.max(insets.top + 12, (windowHeight - cardHeight) / 2);
  const photoHeight = Math.max(
    0,
    Math.min(360, cardHeight * 0.48, Math.max(160, cardWidth * 1.15)),
  );
  const initialScaleX = originFrame ? originFrame.width / cardWidth : 0.96;
  const initialScaleY = originFrame ? originFrame.height / cardHeight : 0.96;
  const initialTranslateX = originFrame
    ? originFrame.x + originFrame.width / 2 - (cardLeft + cardWidth / 2)
    : 0;
  const initialTranslateY = originFrame
    ? originFrame.y + originFrame.height / 2 - (cardTop + cardHeight / 2)
    : 26;

  const closeProfile = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: 220,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (!finished) {
        closing.current = false;
        return;
      }
      if (router.canGoBack()) router.back();
      else router.push('/(tabs)');
    });
  }, [progress]);

  useEffect(() => {
    const entrance = Animated.spring(progress, {
      toValue: 1,
      damping: 23,
      stiffness: 190,
      mass: 0.9,
      useNativeDriver: Platform.OS !== 'web',
    });
    entrance.start();
    return () => entrance.stop();
  }, [progress]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeProfile();
      return true;
    });
    return () => subscription.remove();
  }, [closeProfile]);

  const animatedCardStyle = {
    transform: [
      {
        translateX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [initialTranslateX, 0],
        }),
      },
      {
        translateY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [initialTranslateY, 0],
        }),
      },
      {
        scaleX: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [initialScaleX, 1],
        }),
      },
      {
        scaleY: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [initialScaleY, 1],
        }),
      },
    ],
  };

  const likeProfile = () => {
    if (!profile) return;
    swipeMutation.mutate(
      { data: { targetUserId: profile.id, action: 'like' } },
      {
        onSuccess: () => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
          ]);
          closeProfile();
        },
        onError: () => showError('We couldn’t save your like. Check your connection and try again.', 'Like not saved'),
      },
    );
  };

  const blockProfile = () => {
    if (!profile) return;
    blockMutation.mutate(
      { data: { blockedUserId: profile.id } },
      {
        onSuccess: () => {
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
          ]);
          closeProfile();
        },
        onError: () => showError('We couldn’t block this profile. Check your connection and try again.', 'Profile not blocked'),
      },
    );
  };

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress, pointerEvents: 'none' }]}>
        <BlurView intensity={32} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.backdropShade} />
      </Animated.View>
      <Pressable
        onPress={closeProfile}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel="Close profile details"
        testID="button-close-profile-backdrop"
      />
      <Animated.View
        style={[
          styles.card,
          cardShadowStyle,
          {
            left: cardLeft,
            top: cardTop,
            width: cardWidth,
            height: cardHeight,
            backgroundColor: colors.card,
          },
          animatedCardStyle,
        ]}
      >
        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {profile ? (
            <>
              <View>
                <View style={[styles.photo, styles.livePhoto, { height: photoHeight, backgroundColor: colors.primary }]}>
                  <Image
                    source={imageFor(profile.photo)}
                    resizeMode="cover"
                    style={styles.profileImage}
                    accessible
                    accessibilityLabel={`${profile.name}'s profile photo`}
                  />
                </View>
                <View style={styles.photoShade} />
                <Pressable
                  onPress={closeProfile}
                  style={styles.closeButton}
                  accessibilityRole="button"
                  accessibilityLabel="Close profile details"
                  testID="button-close-profile-details"
                >
                  <Feather name="x" size={21} color="#fff" />
                </Pressable>
              </View>
              <View style={styles.body}>
                <Text style={[styles.name, { color: colors.foreground }]}>
                  {profile.name}, {profile.age}{' '}
                  {profile.verified && <Ionicons name="shield-checkmark" size={19} color="#66a7bd" />}
                </Text>
                <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                  <Feather name="map-pin" size={13} /> {profile.location}
                </Text>
                <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text>
                <View style={styles.chips}>
                  {profile.interests.map((interest) => <Chip label={interest} key={interest} />)}
                </View>
                <View style={styles.actions}>
                  <View style={styles.actionButton}>
                    <Button onPress={blockProfile} disabled={blockMutation.isPending} secondary icon="eye-off">
                      {blockMutation.isPending ? 'Blocking…' : 'Block'}
                    </Button>
                  </View>
                  <View style={styles.actionButton}>
                    <Button onPress={likeProfile} icon="heart">Like</Button>
                  </View>
                </View>
                <Pressable onPress={() => router.push({ pathname: '/report', params: { userId: profile.id } })} style={styles.safety}>
                  <Feather name="shield" size={14} color={colors.mutedForeground} />
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Report this profile</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.body}>
              <Pressable
                onPress={closeProfile}
                style={styles.closeError}
                accessibilityRole="button"
                accessibilityLabel="Close profile details"
              >
                <Feather name="x" size={21} color={colors.foreground} />
              </Pressable>
              <Text style={[styles.name, { color: colors.foreground }]}>
                {discoveryQuery.isPending ? 'Loading profile…' : 'Profile not found'}
              </Text>
              <Text style={[styles.bio, { color: colors.mutedForeground }]}>
                {discoveryQuery.isError
                  ? 'We couldn’t load this profile. Check your connection and try again.'
                  : 'This profile may no longer be available.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  backdropShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,11,22,0.42)' },
  card: {
    position: 'absolute',
    borderRadius: 28,
    overflow: 'hidden',
  },
  photo: { width: '100%', position: 'relative', overflow: 'hidden' },
  profileImage: { width: '100%', height: '100%' },
  livePhoto: { alignItems: 'center', justifyContent: 'center' },
  photoShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(22,14,27,0.08)' },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,19,33,0.55)',
  },
  body: { padding: 20 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 26 },
  meta: { fontSize: 13, marginTop: 5 },
  bio: { fontSize: 15, lineHeight: 23, marginTop: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionButton: { flex: 1 },
  safety: { justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18 },
  closeError: { alignSelf: 'flex-end', padding: 8, marginBottom: 14 },
});