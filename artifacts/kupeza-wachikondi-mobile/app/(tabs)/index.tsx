import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  getGetConnectionsQueryKey,
  getGetDiscoveryQueryKey,
  getGetIncomingLikesQueryKey,
  useGetDiscovery,
  useCreateBlock,
  useRecordSwipe,
  useSearchUsers,
  type SearchUserProfile,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, ImageBackground, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewInstance } from 'react-native';
import { router } from 'expo-router';
import { Chip, Header, imageFor, PressScale, Shell } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';
import { useErrorModal } from '@/components/ErrorModal';
import { useColors } from '@/hooks/useColors';
import { toMobileProfile } from '@/utils/live-profile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const discoveryDeckStoragePrefix = 'kupeza.discovery.deck:';

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { account } = useAuth();
  const { showError } = useErrorModal();
  const queryClient = useQueryClient();
  const discoveryQuery = useGetDiscovery();
  const swipeMutation = useRecordSwipe();
  const blockMutation = useCreateBlock();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSearchProfile, setSelectedSearchProfile] =
    useState<SearchUserProfile | null>(null);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchQuery = useSearchUsers(
    { q: debouncedSearch.trim() },
    { query: { enabled: debouncedSearch.trim().length >= 3 } },
  );
  const searching = searchText.trim().length >= 3;
  const [swipedLiveIds, setSwipedLiveIds] = useState<string[]>([]);
  const [confirmedSwipedLiveIds, setConfirmedSwipedLiveIds] = useState<
    string[]
  >([]);
  const [hydratedDeckKey, setHydratedDeckKey] = useState<string | null>(null);
  const deckStorageKey = account?.userId
    ? `${discoveryDeckStoragePrefix}${account.userId}`
    : null;
  const position = useRef(new Animated.ValueXY()).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const cardRef = useRef<ViewInstance>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timeout);
  }, [searchText]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2200);
  };

  const sendSearchLike = async () => {
    if (!selectedSearchProfile || swipeMutation.isPending) return;
    const userId = selectedSearchProfile.userId;
    try {
      await swipeMutation.mutateAsync({ data: { targetUserId: userId, action: 'like' } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
      ]);
      setSelectedSearchProfile(null);
      showToast('Like sent');
    } catch {
      showError('We couldn’t send that like. Check your connection and try again.', 'Like not sent');
    }
  };

  const blockSearchProfile = () => {
    if (!selectedSearchProfile || blockMutation.isPending) return;
    const profile = selectedSearchProfile;
    Alert.alert(
      `Block ${profile.displayName}?`,
      'You will no longer see each other in discovery.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockMutation.mutateAsync({ data: { blockedUserId: profile.userId } })
              .then(async () => {
                await queryClient.invalidateQueries();
                setSelectedSearchProfile(null);
                showToast('Profile blocked');
              })
              .catch(() => showError('We couldn’t block this profile. Please try again.', 'Block failed'));
          },
        },
      ],
    );
  };

  useEffect(() => {
    let active = true;
    setHydratedDeckKey(null);
    setSwipedLiveIds([]);
    setConfirmedSwipedLiveIds([]);
    if (!deckStorageKey) return () => {
      active = false;
    };

    void AsyncStorage.getItem(deckStorageKey)
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const saved = JSON.parse(raw) as unknown;
          if (
            saved &&
            typeof saved === 'object' &&
            'swipedLiveIds' in saved &&
            Array.isArray(saved.swipedLiveIds)
          ) {
            const ids = saved.swipedLiveIds.filter(
              (id: unknown): id is string => typeof id === 'string',
            );
            setSwipedLiveIds(ids);
            setConfirmedSwipedLiveIds(ids);
          }
        } catch {
          // Ignore malformed local deck state; the API remains authoritative.
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHydratedDeckKey(deckStorageKey);
      });

    return () => {
      active = false;
    };
  }, [deckStorageKey]);

  useEffect(() => {
    if (!deckStorageKey || hydratedDeckKey !== deckStorageKey) return;
    void AsyncStorage.setItem(
      deckStorageKey,
      JSON.stringify({ swipedLiveIds: confirmedSwipedLiveIds }),
    ).catch(() => undefined);
  }, [confirmedSwipedLiveIds, deckStorageKey, hydratedDeckKey]);

  const liveProfiles = useMemo(
    () => (discoveryQuery.data?.items ?? []).map(toMobileProfile),
    [discoveryQuery.data?.items],
  );
  const available = useMemo(
    () => liveProfiles.filter((profile) => !swipedLiveIds.includes(profile.id)),
    [liveProfiles, swipedLiveIds],
  );
  const current = available[0];
  const finish = (action: 'like' | 'pass' | 'super') => {
    if (!current || moving) return;
    const targetUserId = current.id;
    setMoving(true);
    Haptics.impactAsync(action === 'pass' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    const toValue = action === 'super' ? { x: 0, y: -700 } : action === 'like' ? { x: 500, y: 0 } : { x: -500, y: 0 };
    Animated.parallel([
      Animated.timing(position, { toValue, duration: 240, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(cardOpacity, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(cardScale, { toValue: 0.95, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(({ finished }) => {
      if (!finished) return;
      setSwipedLiveIds((ids) =>
        ids.includes(targetUserId) ? ids : [...ids, targetUserId],
      );
      position.setValue({ x: 0, y: 0 });
      cardOpacity.setValue(1);
      cardScale.setValue(1);
      setMoving(false);
      void swipeMutation
        .mutateAsync({ data: { targetUserId, action } })
        .then(() => {
          setConfirmedSwipedLiveIds((ids) =>
            ids.includes(targetUserId) ? ids : [...ids, targetUserId],
          );
          return Promise.all([
            queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
            queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
          ]);
        })
        .catch(() => {
          setSwipedLiveIds((ids) => ids.filter((id) => id !== targetUserId));
          position.setValue({ x: 0, y: 0 });
          cardOpacity.setValue(1);
          cardScale.setValue(1);
          showError(
            'We couldn’t save your swipe. Please check your connection and try again.',
            'Swipe not saved',
          );
        });
    });
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const openProfile = () => {
    if (!current) return;
    cardRef.current?.measureInWindow((x, y, width, height) => {
      router.push({
        pathname: '/discover/[id]',
        params: {
          id: current.id,
          origin: [x, y, width, height].map(Math.round).join(','),
        },
      });
    });
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 8 || Math.abs(gesture.dy) > 8,
    onPanResponderMove: (_, gesture) =>
      position.setValue({ x: gesture.dx, y: Math.min(0, gesture.dy) }),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dy < -90) finishRef.current('super');
      else if (Math.abs(gesture.dx) > 95) {
        finishRef.current(gesture.dx > 0 ? 'like' : 'pass');
      } else {
        Animated.spring(position, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      }
    },
  })).current;
  const rotate = position.x.interpolate({ inputRange: [-250, 0, 250], outputRange: ['-12deg', '0deg', '12deg'] });
  const loadingDiscovery =
    discoveryQuery.isPending ||
    Boolean(deckStorageKey && hydratedDeckKey !== deckStorageKey);
  return (
    <Shell scroll={false}>
      <Header />
      <View style={styles.topline}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>Chikondi265 App</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>Find your person.</Text>
        </View>
        <Pressable onPress={() => router.push('/filters')} style={[styles.filter, { backgroundColor: colors.card }]}>
          <Feather name="sliders" size={20} color={colors.foreground} />
        </Pressable>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={20} color={colors.mutedForeground} />
        <TextInput
          accessibilityLabel="Search profiles"
          testID="input-discovery-search"
          value={searchText}
          onChangeText={setSearchText}
          placeholder="Search names or usernames"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {searchText.length > 0 ? (
          <Pressable
            onPress={() => {
              setSearchText('');
              setDebouncedSearch('');
              setSelectedSearchProfile(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Clear profile search"
            testID="button-clear-discovery-search"
            style={styles.searchClear}
          >
            <Feather name="x" size={20} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {searching ? (
        <View style={styles.resultsArea}>
          {debouncedSearch.trim().length < 3 || searchQuery.isFetching ? (
            <View style={styles.searchState}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.searchStateText, { color: colors.mutedForeground }]}>Searching profiles…</Text>
            </View>
          ) : searchQuery.isError ? (
            <View style={styles.searchState}>
              <Text style={[styles.searchStateText, { color: colors.mutedForeground }]}>Search is unavailable. Check your connection and try again.</Text>
            </View>
          ) : (
            <FlatList
              data={searchQuery.data?.items ?? []}
              keyExtractor={(item) => item.userId}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              scrollEnabled={(searchQuery.data?.items.length ?? 0) > 0}
              ListEmptyComponent={
                <View style={styles.searchState}>
                  <Text style={[styles.searchStateText, { color: colors.mutedForeground }]}>No profiles found for that search.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setSelectedSearchProfile(item)}
                  style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.7 : 1 }]}
                  android_ripple={{ color: colors.ripple }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.displayName}'s profile`}
                  testID={`search-result-${item.userId}`}
                >
                  <Image
                    source={imageFor(item.photoUrl ?? item.photoId)}
                    style={styles.resultAvatar}
                    accessibilityLabel={`${item.displayName}'s profile picture`}
                  />
                  <View style={styles.resultCopy}>
                    <Text numberOfLines={1} style={[styles.resultName, { color: colors.foreground }]}>
                      {item.displayName}
                    </Text>
                    <Text numberOfLines={1} style={[styles.resultMeta, { color: colors.mutedForeground }]}>
                      {item.username ? `@${item.username} · ` : ''}{item.city} · {item.age}
                    </Text>
                  </View>
                  <View style={[styles.resultDivider, { backgroundColor: colors.divider }]} />
                </Pressable>
              )}
            />
          )}
        </View>
      ) : loadingDiscovery ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Loading profiles…</Text>
        </View>
      ) : discoveryQuery.isError ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={24} color={colors.primaryForeground} /></View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Discovery is unavailable.</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>We couldn’t load profiles. Check your connection and try again.</Text>
        </View>
      ) : !current ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={24} color={colors.primaryForeground} /></View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No profiles available right now.</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Check back later for more people to discover.</Text>
        </View>
      ) : (
        <>
      <View
        ref={cardRef}
        collapsable={false}
        style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
        testID={`card-profile-${current.id}`}
      >
        <Animated.View
          {...pan.panHandlers}
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: cardOpacity,
              transform: [
                { translateX: position.x },
                { translateY: position.y },
                { rotate },
                { scale: cardScale },
              ],
            },
          ]}
        >
          <Pressable
            onPress={openProfile}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`View ${current.name}'s profile`}
            testID="button-open-profile-detail"
          >
            <View style={styles.cardContent}>
              <ImageBackground
                source={imageFor(current.photo)}
                resizeMode="cover"
                style={styles.cardPhoto}
                imageStyle={styles.cardPhotoImage}
              >
                <View style={[styles.cardShade, { backgroundColor: colors.imageShade }]} />
                <View style={styles.cardStatus}>
                  <Text style={[styles.status, { color: colors.onImage, backgroundColor: colors.overlay }]}>Profile</Text>
                  <Feather name="bookmark" size={20} color={colors.onImage} />
                </View>
              </ImageBackground>
              <View style={[styles.cardCopy, { backgroundColor: colors.surface }]}>
                <Text numberOfLines={1} style={[styles.cardName, { color: colors.onSurface }]}>
                  {current.name}, {current.age} {current.verified && <Ionicons name="shield-checkmark" size={20} color={colors.primary} />}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.onSurfaceVariant }]}>
                  <Feather name="map-pin" size={20} color={colors.onSurfaceVariant} /> {current.location}
                </Text>
                <Text numberOfLines={2} style={[styles.cardBio, { color: colors.onSurfaceVariant }]}>{current.bio}</Text>
                <View style={styles.chips}>{current.interests.map((interest) => <Chip key={interest} label={interest} />)}</View>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </View>
      <View style={styles.actions}>
        <PressScale onPress={() => finish('pass')} style={[styles.action, { backgroundColor: colors.surface }]} testID="button-pass">
          <Feather name="x" size={24} color={colors.onSurfaceVariant} />
        </PressScale>
        <PressScale onPress={() => finish('super')} style={[styles.action, styles.super, { backgroundColor: colors.secondary }]} testID="button-super-like">
          <Feather name="star" size={24} color={colors.secondaryForeground} />
        </PressScale>
        <PressScale onPress={() => finish('like')} style={[styles.action, styles.like, { backgroundColor: colors.accent }]} testID="button-like">
          <Ionicons name="heart" size={28} color={colors.primary} />
        </PressScale>
      </View>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>Tap a profile for details · Swipe left to pass · right to like · up to super like</Text>
        </>
      )}
      <Modal
        visible={Boolean(selectedSearchProfile)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSearchProfile(null)}
      >
        <View style={[styles.profileModal, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, backgroundColor: colors.overlay }]}>
          <Pressable
            onPress={() => setSelectedSearchProfile(null)}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close searched profile"
          />
          {selectedSearchProfile ? (
            <View style={[styles.profileModalCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <ImageBackground
                  source={imageFor(selectedSearchProfile.photoUrl ?? selectedSearchProfile.photoId)}
                  resizeMode="cover"
                  style={styles.profileModalPhoto}
                  imageStyle={styles.profileModalPhotoImage}
                >
                    <View style={[styles.profileModalShade, { backgroundColor: colors.imageShade }]} />
                  <Pressable
                    onPress={() => setSelectedSearchProfile(null)}
                    style={[styles.profileModalClose, { backgroundColor: colors.overlay }]}
                    accessibilityRole="button"
                    accessibilityLabel="Close searched profile"
                    testID="button-close-search-profile"
                  >
                    <Feather name="x" size={20} color={colors.onImage} />
                  </Pressable>
                  <View style={styles.profileModalPhotoCopy}>
                    <Text style={[styles.profileModalName, { color: colors.onImage }]}>
                      {selectedSearchProfile.displayName}, {selectedSearchProfile.age}
                    </Text>
                    <Text style={[styles.profileModalCity, { color: colors.onImage }]}>
                      <Feather name="map-pin" size={20} color={colors.onImage} /> {selectedSearchProfile.city}
                    </Text>
                  </View>
                </ImageBackground>
                <View style={styles.profileModalBody}>
                  {selectedSearchProfile.username ? (
                    <Text style={[styles.profileModalUsername, { color: colors.primary }]}>
                      @{selectedSearchProfile.username}
                    </Text>
                  ) : null}
                    <Text style={[styles.profileModalBio, { color: colors.onSurface }]}>
                    {selectedSearchProfile.bio || 'This person has not added an introduction yet.'}
                  </Text>
                    <Text style={[styles.profileModalIntention, { color: colors.onSurfaceVariant }]}>
                    Looking for {selectedSearchProfile.intention.replace('-', ' ')}
                  </Text>
                  <View style={styles.chips}>
                    {selectedSearchProfile.interests.map((interest) => (
                      <Chip label={interest} key={interest} />
                    ))}
                  </View>
                </View>
              </ScrollView>
              <View style={styles.profileModalActions}>
                <PressScale
                  accessibilityLabel={`Send like to ${selectedSearchProfile.displayName}`}
                  disabled={swipeMutation.isPending}
                  onPress={() => void sendSearchLike()}
                  style={[styles.modalPrimaryAction, { backgroundColor: colors.primary, opacity: swipeMutation.isPending ? 0.6 : 1 }]}
                  testID={`button-search-like-${selectedSearchProfile.userId}`}
                >
                  {swipeMutation.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Ionicons name="heart" size={20} color={colors.primaryForeground} />
                  )}
                  <Text style={[styles.modalActionText, { color: colors.primaryForeground }]}>Send Like</Text>
                </PressScale>
                <PressScale
                  accessibilityLabel={`Block ${selectedSearchProfile.displayName}`}
                  disabled={blockMutation.isPending}
                  onPress={blockSearchProfile}
                  style={[styles.modalSecondaryAction, { borderColor: colors.border, opacity: blockMutation.isPending ? 0.6 : 1 }]}
                  testID={`button-search-block-${selectedSearchProfile.userId}`}
                >
                  <Feather name="slash" size={20} color={colors.destructive} />
                  <Text style={[styles.modalActionText, { color: colors.destructive }]}>Block</Text>
                </PressScale>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      {toastMessage ? (
        <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: colors.onSurface }]}>
          <Text style={[styles.toastText, { color: colors.surface }]}>{toastMessage}</Text>
        </View>
      ) : null}
    </Shell>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.25 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -1.2, marginTop: 5 },
  filter: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { minHeight: 48, width: '100%', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 46, fontFamily: 'Inter_400Regular', fontSize: 14 },
  searchClear: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  resultsArea: { flex: 1, minHeight: 180 },
  searchState: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  searchStateText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  resultRow: { minHeight: 76, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, position: 'relative' },
  resultAvatar: { width: 52, height: 52, borderRadius: 26 },
  resultCopy: { flex: 1, gap: 4, minWidth: 0 },
  resultName: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  resultMeta: { fontSize: 14 },
  resultDivider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: 1 },
  profileModal: { flex: 1, paddingHorizontal: 16, justifyContent: 'center' },
  profileModalCard: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: 20, overflow: 'hidden', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  profileModalPhoto: { width: '100%', height: 320, justifyContent: 'flex-end' },
  profileModalPhotoImage: { width: '100%', height: '100%' },
  profileModalShade: { ...StyleSheet.absoluteFill },
  profileModalClose: { position: 'absolute', top: 12, right: 12, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  profileModalPhotoCopy: { padding: 16, gap: 8 },
  profileModalName: { fontFamily: 'Inter_600SemiBold', fontSize: 20 },
  profileModalCity: { fontSize: 14, letterSpacing: 0.1 },
  profileModalBody: { padding: 16, gap: 12 },
  profileModalUsername: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  profileModalBio: { fontSize: 14, lineHeight: 20 },
  profileModalIntention: { textTransform: 'capitalize', fontSize: 13 },
  profileModalActions: { flexDirection: 'row', gap: 8, padding: 16 },
  modalPrimaryAction: { minHeight: 48, flex: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalSecondaryAction: { minHeight: 48, flex: 1, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modalActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  toast: { position: 'absolute', bottom: 24, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  toastText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  card: { flex: 1, minHeight: 0, width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 20, overflow: 'hidden', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  cardContent: { flex: 1, minHeight: 0 },
  cardPhoto: { flex: 1, minHeight: 140, width: '100%' },
  cardPhotoImage: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  cardShade: { ...StyleSheet.absoluteFill, borderRadius: 16 },
  cardStatus: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  cardCopy: { padding: 16, gap: 8 },
  cardName: { fontFamily: 'Inter_600SemiBold', fontSize: 20, letterSpacing: 0.15 },
  cardMeta: { fontSize: 14, letterSpacing: 0.1, marginTop: 4 },
  cardBio: { lineHeight: 20, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, paddingVertical: 12 },
  action: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  super: { width: 56, height: 56, borderRadius: 28 },
  like: { width: 64, height: 64, borderRadius: 32 },
  hint: { textAlign: 'center', fontSize: 12, paddingBottom: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 12 },
  emptyIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, textAlign: 'center' },
  emptyCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 12 },
});