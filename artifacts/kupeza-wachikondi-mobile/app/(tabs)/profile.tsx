import { Feather } from '@expo/vector-icons';
import { useGetCurrentUser } from '@workspace/api-client-react';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/components/AppProvider';
import { Header, PhotoAvatar, Shell } from '@/components/ui';
import { USE_LIVE_API } from '@/constants/config';
import { ageFromBirthDate } from '@/utils/live-profile';
import { useColors } from '@/hooks/useColors';
import { getIntentionLabel } from '@/utils/intentions';

function ProfileField({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value || 'Not added yet'}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { user } = useApp();
  const profileQuery = useGetCurrentUser({ query: { enabled: USE_LIVE_API } });
  const apiProfile = profileQuery.data?.profile;

  if (USE_LIVE_API && profileQuery.isPending) {
    return (
      <Shell>
        <Header title="Profile" back={false} />
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>Loading your profile…</Text>
        </View>
      </Shell>
    );
  }

  if (USE_LIVE_API && profileQuery.isError) {
    return (
      <Shell>
        <Header title="Profile" back={false} />
        <View style={styles.state}>
          <Feather name="wifi-off" size={22} color={colors.mutedForeground} />
          <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
            We couldn’t load your profile. Check your connection and try again.
          </Text>
        </View>
      </Shell>
    );
  }

  const profile = apiProfile;
  if (USE_LIVE_API && !profile) {
    return (
      <Shell>
        <Header title="Profile" back={false} />
        <View style={styles.state}>
          <Text style={[styles.stateCopy, { color: colors.mutedForeground }]}>
            Your account doesn’t have a profile yet.
          </Text>
        </View>
      </Shell>
    );
  }

  const displayName = USE_LIVE_API ? profile!.displayName : user.name;
  const age = USE_LIVE_API ? ageFromBirthDate(profile!.birthDate) : user.age;
  const city = USE_LIVE_API ? profile!.city : user.location;
  const bio = USE_LIVE_API ? profile!.bio : user.bio;
  const interests = USE_LIVE_API ? profile!.interests.join(', ') : user.interests.join(', ');
  const intention = getIntentionLabel(
    USE_LIVE_API ? profile!.intention : user.intention,
  );

  return (
    <Shell>
      <Header title="Profile" back={false} />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/profile-edit')}
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          testID="profile-edit-action"
        >
          <Feather name="edit-2" size={16} color="#fff" />
          <Text style={styles.actionPrimaryText}>Edit profile</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={[styles.actionButton, styles.settingsButton, { borderColor: colors.border }]}
          testID="profile-settings-action"
        >
          <Feather name="settings" size={16} color={colors.foreground} />
          <Text style={[styles.actionText, { color: colors.foreground }]}>Settings</Text>
        </Pressable>
      </View>
      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <PhotoAvatar photo={user.photo} size={84} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
          onPress={() => router.push('/profile-photos')}
          style={styles.changePhoto}
          testID="profile-change-photo"
        >
          <Feather name="camera" size={14} color={colors.primary} />
          <Text style={[styles.changePhotoText, { color: colors.primary }]}>
            Change picture
          </Text>
        </Pressable>
        <Text style={[styles.name, { color: colors.foreground }]}>{displayName || 'Your profile'}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          {age ? `${age} years old` : 'Add your age'}{city ? ` · ${city}` : ''}
        </Text>
      </View>
      <ProfileField label="About" value={bio} />
      <ProfileField label="Interests" value={interests} />
      <ProfileField label="Looking for" value={intention} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  settingsButton: { borderWidth: 1 },
  actionPrimaryText: { color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  state: { flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  stateCopy: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  hero: { alignItems: 'center', padding: 22, borderWidth: 1, borderRadius: 22, marginBottom: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 28 },
  changePhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  changePhotoText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 12 },
  subtitle: { fontSize: 13, marginTop: 5 },
  field: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7 },
  value: { fontSize: 14, lineHeight: 21, marginTop: 6 },
});
