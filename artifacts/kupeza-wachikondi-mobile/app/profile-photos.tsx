import {
  getGetConnectionsQueryKey,
  getGetDiscoveryQueryKey,
  getGetIncomingLikesQueryKey,
  getGetNotificationsQueryKey,
  saveCurrentUserProfile,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { File as ExpoFile } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import {
  defaultAvatarForUser,
  generatedAvatarIds,
  profileImages,
  type GeneratedAvatarId,
} from '@/components/AppProvider';
import { getStoredSessionToken, useAuth } from '@/components/AuthProvider';
import { API_BASE_URL } from '@/constants/config';
import { Header, imageFor, Shell } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

export default function ProfilePhotosScreen() {
  const colors = useColors();
  const { width: windowWidth } = useWindowDimensions();
  const queryClient = useQueryClient();
  const { account, refreshAccount } = useAuth();
  const [saving, setSaving] = useState<GeneratedAvatarId | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const selectedPhoto =
    account?.profile?.photoUrl
      ? null
      : account?.profile?.photoId ??
        (account?.userId ? defaultAvatarForUser(account.userId) : null);
  const gridWidth = Math.min(Math.max(0, windowWidth - 36), 720);
  const columns = gridWidth >= 720 ? 4 : gridWidth >= 510 ? 3 : 2;
  const tileWidth = Math.max(0, (gridWidth - 12 * (columns - 1)) / columns);
  const portraitSize = Math.max(0, tileWidth - 4);

  const choosePhoto = async (photoId: GeneratedAvatarId) => {
    const profile = account?.profile;
    if (!profile) {
      Alert.alert('Profile unavailable', 'Try again after your profile loads.');
      return;
    }

    setSaving(photoId);
    try {
      await saveCurrentUserProfile({
        displayName: profile.displayName,
        birthDate: profile.birthDate,
        city: profile.city,
        countryCode: profile.countryCode,
        bio: profile.bio,
        interests: profile.interests,
        intention: profile.intention,
        photoId,
      });
      await refreshAccount();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
      ]);
      router.back();
    } catch {
      Alert.alert(
        'Photo not updated',
        'Check your connection and try selecting the portrait again.',
      );
    } finally {
      setSaving(null);
    }
  };

  const uploadPhoto = async (file: Blob, mimeType: string) => {
    setPhotoError(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      setPhotoError('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('The image must be 5 MB or smaller.');
      return;
    }

    setUploadingPhoto(true);
    try {
      if (!API_BASE_URL) throw new Error('The API address is not configured.');
      const token = await getStoredSessionToken();
      if (!token) throw new Error('Sign in again before uploading a photo.');

      const response = await expoFetch(
        `${API_BASE_URL}/api/v1/me/photo`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': mimeType,
          },
          body: file,
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          result?.error?.message ?? 'The photo could not be uploaded.',
        );
      }

      await refreshAccount();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetConnectionsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetIncomingLikesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetNotificationsQueryKey() }),
      ]);
      Alert.alert(
        'Photo saved',
        'You can see it on your profile now. It will appear to other people after review.',
      );
      router.back();
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : 'The photo could not be uploaded.',
      );
    } finally {
      setUploadingPhoto(false);
    }
  };

  const chooseFile = async () => {
    setPhotoError(null);
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) void uploadPhoto(file, file.type);
      };
      input.click();
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Allow photo library access to choose a picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const extension = asset.fileName?.split('.').pop()?.toLowerCase();
    const mimeType =
      asset.mimeType ??
      (extension === 'jpg' || extension === 'jpeg'
        ? 'image/jpeg'
        : extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : '');
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      setPhotoError('The image must be 5 MB or smaller.');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      setPhotoError('Choose a JPEG, PNG, or WebP image.');
      return;
    }

    const file = new ExpoFile(asset.uri);
    await uploadPhoto(file, mimeType);
  };

  return (
    <Shell>
      <Header title="Choose a picture" back />
      <Text style={[styles.notice, { color: colors.mutedForeground }]}>
        These are fictional, AI-generated portraits. Your choice appears on your
        public profile.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose a photo from your device"
        disabled={uploadingPhoto || saving !== null}
        onPress={() => void chooseFile()}
        style={[
          styles.uploadButton,
          { borderColor: colors.border, backgroundColor: colors.card },
        ]}
        testID="profile-photo-upload"
      >
        <Feather
          name={uploadingPhoto ? 'loader' : 'image'}
          size={18}
          color={colors.primary}
        />
        <Text style={[styles.uploadLabel, { color: colors.foreground }]}>
          {uploadingPhoto ? 'Uploading…' : 'Choose a photo'}
        </Text>
      </Pressable>
      {account?.profile?.photoUrl ? (
        <View style={styles.currentPhoto}>
          <Image
            source={imageFor(account.profile.photoUrl)}
            resizeMode="cover"
            style={styles.currentPhotoImage}
          />
          <View style={styles.currentPhotoCopy}>
            <Text style={[styles.uploadLabel, { color: colors.foreground }]}>
              Your uploaded photo
            </Text>
            <Text style={[styles.notice, { color: colors.mutedForeground }]}>
              It is visible to you now and will appear publicly after review.
            </Text>
          </View>
        </View>
      ) : null}
      <Text style={[styles.storageNote, { color: colors.mutedForeground }]}>
        Upload storage is temporary in this deployment. Photos may be cleared when
        the server is redeployed.
      </Text>
      {photoError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.primary }]}>
          {photoError}
        </Text>
      ) : null}
      <View style={[styles.grid, { width: gridWidth }]}>
        {generatedAvatarIds.map((photoId, index) => {
          const isSelected = photoId === selectedPhoto;
          const isSaving = photoId === saving;
          return (
            <Pressable
              key={photoId}
              accessibilityRole="button"
              accessibilityLabel={`Choose AI portrait ${index + 1}`}
              accessibilityState={{ selected: isSelected, disabled: saving !== null }}
              disabled={saving !== null}
              onPress={() => void choosePhoto(photoId)}
              style={[
                styles.option,
                {
                  width: tileWidth,
                  backgroundColor: colors.card,
                  borderColor: isSelected ? colors.primary : colors.border,
                  opacity: saving && !isSaving ? 0.55 : 1,
                },
              ]}
              testID={`profile-photo-${photoId}`}
            >
              <Image
                source={profileImages[photoId]}
                resizeMode="cover"
                style={[styles.portrait, { width: portraitSize, height: portraitSize }]}
              />
              <View style={styles.optionFooter}>
                <Text style={[styles.optionLabel, { color: colors.foreground }]}>
                  Portrait {index + 1}
                </Text>
                {isSaving ? (
                  <Feather name="loader" size={16} color={colors.primary} />
                ) : isSelected ? (
                  <Feather name="check-circle" size={17} color={colors.primary} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  notice: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  uploadButton: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 12 },
  uploadLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  currentPhoto: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  currentPhotoImage: { width: 68, height: 68, borderRadius: 16 },
  currentPhotoCopy: { flex: 1 },
  storageNote: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginBottom: 12 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  grid: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: 12 },
  option: { borderWidth: 2, borderRadius: 18, overflow: 'hidden', marginBottom: 4 },
  portrait: { alignSelf: 'center', flexShrink: 0 },
  optionFooter: { minHeight: 42, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});
