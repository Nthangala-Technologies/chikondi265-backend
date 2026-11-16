import { Feather, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  getGetConnectionsQueryKey,
  getGetDiscoveryQueryKey,
  useGetDiscovery,
  useRecordSwipe,
  useSearchUsers,
  type SearchUserProfile,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, ImageBackground, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ViewInstance } from 'react-native';
import { router } from 'expo-router';
import { Chip, Header, imageFor, Shell } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { toMobileProfile } from '@/utils/live-profile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const discoveryDeckStoragePrefix = 'kupeza.discovery.deck:';

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const discoveryQuery = useGetDiscovery();
  const swipeMutation = useRecordSwipe();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedSearchProfile, setSelectedSearchProfile] =
    useState<SearchUserProfile | null>(null);
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
  const cardRef = useRef<ViewInstance>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timeout);
  }, [searchText]);

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
    Animated.timing(position, { toValue, duration: 240, useNativeDriver: true }).start(() => {
      setSwipedLiveIds((ids) =>
        ids.includes(targetUserId) ? ids : [...ids, targetUserId],
      );
      position.setValue({ x: 0, y: 0 });
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
          Alert.alert('Swipe not saved', 'Check your connection and try again.');
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
          useNativeDriver: true,
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
          <Feather name="sliders" size={19} color={colors.foreground} />
        </Pressable>
      </View>
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={18} color={colors.mutedForeground} />
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
            <Feather name="x" size={17} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {searching ? (
        <View style={[styles.resultsArea, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
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
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={22} color="#fff" /></View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Discovery is unavailable.</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>We couldn’t load profiles. Check your connection and try again.</Text>
        </View>
      ) : !current ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary }]}><Ionicons name="heart" size={22} color="#fff" /></View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No profiles available right now.</Text>
          <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>Check back later for more people to discover.</Text>
        </View>
      ) : (
        <>
      <View ref={cardRef} collapsable={false} style={styles.card} testID={`card-profile-${current.id}`}>
        <Animated.View
          {...pan.panHandlers}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
        >
          <Pressable
            onPress={openProfile}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel={`View ${current.name}'s profile`}
            testID="button-open-profile-detail"
          >
            <ImageBackground
              source={imageFor(current.photo)}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
              imageStyle={styles.cardPhoto}
            />
            <View style={styles.cardShade} />
            <View style={styles.cardStatus}>
              <Text style={styles.status}>Profile</Text>
              <Feather name="bookmark" size={16} color="#fff" />
            </View>
            <View style={styles.cardCopy}>
              <Text numberOfLines={1} style={styles.cardName}>{current.name}, {current.age} {current.verified && <Ionicons name="shield-checkmark" size={20} color="#aee0ed" />}</Text>
              <Text style={styles.cardMeta}><Feather name="map-pin" size={12} color="#fff" /> {current.location}</Text>
              <Text numberOfLines={2} style={styles.cardBio}>{current.bio}</Text>
              <View style={styles.chips}>{current.interests.map((interest) => <Chip key={interest} label={interest} />)}</View>
            </View>
          </Pressable>
        </Animated.View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => finish('pass')} style={[styles.action, { backgroundColor: colors.card }]} testID="button-pass">
          <Feather name="x" size={23} color="#8a6a75" />
        </Pressable>
        <Pressable onPress={() => finish('super')} style={[styles.action, styles.super]} testID="button-super-like">
          <Feather name="star" size={23} color="#2e89a8" />
        </Pressable>
        <Pressable onPress={() => finish('like')} style={[styles.action, styles.like]} testID="button-like">
          <Ionicons name="heart" size={27} color="#df4e78" />
        </Pressable>
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
        <View style={[styles.profileModal, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={() => setSelectedSearchProfile(null)}
            style={StyleSheet.absoluteFill}
            accessibilityRole="button"
            accessibilityLabel="Close searched profile"
          />
          {selectedSearchProfile ? (
            <View style={[styles.profileModalCard, { backgroundColor: colors.card }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <ImageBackground
                  source={imageFor(selectedSearchProfile.photoUrl ?? selectedSearchProfile.photoId)}
                  resizeMode="cover"
                  style={styles.profileModalPhoto}
                  imageStyle={styles.profileModalPhotoImage}
                >
                  <View style={styles.profileModalShade} />
                  <Pressable
                    onPress={() => setSelectedSearchProfile(null)}
                    style={styles.profileModalClose}
                    accessibilityRole="button"
                    accessibilityLabel="Close searched profile"
                    testID="button-close-search-profile"
                  >
                    <Feather name="x" size={20} color="#fff" />
                  </Pressable>
                  <View style={styles.profileModalPhotoCopy}>
                    <Text style={styles.profileModalName}>
                      {selectedSearchProfile.displayName}, {selectedSearchProfile.age}
                    </Text>
                    <Text style={styles.profileModalCity}>
                      <Feather name="map-pin" size={13} color="#fff" /> {selectedSearchProfile.city}
                    </Text>
                  </View>
                </ImageBackground>
                <View style={styles.profileModalBody}>
                  {selectedSearchProfile.username ? (
                    <Text style={[styles.profileModalUsername, { color: colors.primary }]}>
                      @{selectedSearchProfile.username}
                    </Text>
                  ) : null}
                  <Text style={[styles.profileModalBio, { color: colors.foreground }]}>
                    {selectedSearchProfile.bio || 'This person has not added an introduction yet.'}
                  </Text>
                  <Text style={[styles.profileModalIntention, { color: colors.mutedForeground }]}>
                    Looking for {selectedSearchProfile.intention.replace('-', ' ')}
                  </Text>
                  <View style={styles.chips}>
                    {selectedSearchProfile.interests.map((interest) => (
                      <Chip label={interest} key={interest} />
                    ))}
                  </View>
                </View>
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </Shell>
  );
}

const styles = StyleSheet.create({
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.25 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -1.2, marginTop: 5 },
  filter: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchBox: { minHeight: 48, width: '100%', borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  searchInput: { flex: 1, minHeight: 46, fontFamily: 'Inter_400Regular', fontSize: 14 },
  searchClear: { width: 32, height: 36, alignItems: 'center', justifyContent: 'center' },
  resultsArea: { flex: 1, minHeight: 180, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  searchState: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  searchStateText: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  resultRow: { minHeight: 72, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  resultAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#eadfe3' },
  resultCopy: { flex: 1, gap: 4 },
  resultName: { fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  resultMeta: { fontSize: 12 },
  profileModal: { flex: 1, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: 'rgba(18,10,18,0.68)' },
  profileModalCard: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', borderRadius: 26, overflow: 'hidden' },
  profileModalPhoto: { width: '100%', height: 340, justifyContent: 'flex-end' },
  profileModalPhotoImage: { width: '100%', height: '100%' },
  profileModalShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18,10,18,0.28)' },
  profileModalClose: { position: 'absolute', top: 14, right: 14, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(25,15,25,0.56)' },
  profileModalPhotoCopy: { padding: 20, gap: 5 },
  profileModalName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 27 },
  profileModalCity: { color: '#fff', fontSize: 13 },
  profileModalBody: { padding: 20, gap: 12 },
  profileModalUsername: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  profileModalBio: { fontSize: 15, lineHeight: 22 },
  profileModalIntention: { textTransform: 'capitalize', fontSize: 13 },
  card: { flex: 1, minHeight: 0, width: '100%', maxWidth: 520, alignSelf: 'center', borderRadius: 28, overflow: 'hidden', backgroundColor: '#c8b4ba' },
  cardPhoto: { width: '100%', height: '100%' },
  cardShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(29,18,35,0.18)', borderRadius: 28 },
  cardStatus: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { color: '#fff', backgroundColor: 'rgba(42,27,45,0.65)', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, fontFamily: 'Inter_700Bold', fontSize: 11 },
  cardCopy: { position: 'absolute', left: 20, right: 20, bottom: 20 },
  cardName: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1.2 },
  cardMeta: { color: '#fff', fontSize: 12, marginTop: 4 },
  cardBio: { color: 'rgba(255,255,255,0.88)', lineHeight: 19, fontSize: 13, marginTop: 9, marginBottom: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, paddingVertical: 14 },
  action: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  super: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#e8f5f7' },
  like: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff0f3' },
  hint: { textAlign: 'center', fontSize: 11, paddingBottom: 4 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 25, gap: 12 },
  emptyIcon: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 24, textAlign: 'center' },
  emptyCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 12 },
});