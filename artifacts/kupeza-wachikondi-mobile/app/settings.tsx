import { useActivateCurrentAccount, useDeactivateCurrentAccount, useDeleteCurrentAccount } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Header, Shell } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';
import { useColors } from '@/hooks/useColors';

function apiMessage(error: unknown, fallback: string) {
  return (
    error as { data?: { error?: { message?: string } } }
  )?.data?.error?.message ?? fallback;
}

export default function SettingsScreen() {
  const colors = useColors();
  const auth = useAuth();
  const deactivate = useDeactivateCurrentAccount();
  const activate = useActivateCurrentAccount();
  const deleteAccount = useDeleteCurrentAccount();
  const paused = auth.account?.profile?.visibilityStatus === 'paused';
  const busy =
    deactivate.isPending || activate.isPending || deleteAccount.isPending;

  async function changeVisibility(nextPaused: boolean) {
    try {
      if (nextPaused) {
        await deactivate.mutateAsync();
      } else {
        await activate.mutateAsync();
      }
      await auth.refreshAccount().catch(() => undefined);
      Alert.alert(
        nextPaused ? 'Profile paused' : 'Profile active',
        nextPaused
          ? 'Your profile is hidden from discovery. Your existing conversations remain available.'
          : 'Your profile is visible in discovery again.',
      );
    } catch (error) {
      Alert.alert(
        'Could not update profile',
        apiMessage(error, 'Check your connection and try again.'),
      );
    }
  }

  function confirmVisibilityChange() {
    const nextPaused = !paused;
    Alert.alert(
      nextPaused ? 'Pause your profile?' : 'Resume your profile?',
      nextPaused
        ? 'People will not see you in discovery until you resume your profile.'
        : 'Your profile will appear in discovery again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextPaused ? 'Pause profile' : 'Resume profile',
          onPress: () => void changeVisibility(nextPaused),
        },
      ],
    );
  }

  async function signOut() {
    try {
      await auth.logout();
    } catch (error) {
      Alert.alert(
        'Signed out on this device',
        error instanceof Error
          ? error.message
          : 'The server could not revoke the session.',
      );
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your account and profile will be marked as deleted. Messages, connections, and swipe history will remain stored for moderation and audit, but your profile will no longer appear in the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => void deleteMyAccount(),
        },
      ],
    );
  }

  async function deleteMyAccount() {
    try {
      await deleteAccount.mutateAsync();
      Alert.alert(
        'Account deleted',
        'Your account has been removed from discovery. You will be signed out.',
        [
          {
            text: 'Continue',
            onPress: () => void auth.logout().catch(() => undefined),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        'Could not delete account',
        apiMessage(error, 'Check your connection and try again.'),
      );
    }
  }

  const rows = [
    {
      icon: 'user' as const,
      title: 'Edit profile',
      testID: 'settings-edit-profile',
      onPress: () => router.push('/profile-edit'),
    },
    {
      icon: 'lock' as const,
      title: 'Change password',
      testID: 'settings-change-password',
      onPress: () => router.push('/password-change'),
    },
    {
      icon: 'credit-card' as const,
      title: 'Payment history',
      testID: 'settings-payment-history',
      onPress: () => router.push('/payment-history'),
    },
    {
      icon: 'bell' as const,
      title: 'Notifications',
      testID: 'settings-notifications',
      onPress: () => router.push('/notifications'),
    },
    {
      icon: 'shield' as const,
      title: 'Safety & privacy',
      testID: 'settings-safety',
      onPress: () => router.push('/safety'),
    },
    {
      icon: 'help-circle' as const,
      title: 'Help centre',
      testID: 'settings-help',
      onPress: () => undefined,
    },
  ];

  return (
    <Shell>
      <Header title="Settings" back />
      {rows.map((row) => (
        <Pressable
          key={row.testID}
          accessibilityRole="button"
          onPress={row.onPress}
          style={styles.row}
          testID={row.testID}
        >
          <Feather
            name={row.icon}
            size={19}
            color={colors.foreground}
          />
          <Text style={[styles.rowText, { color: colors.foreground }]}>
            {row.title}
          </Text>
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
          />
        </Pressable>
      ))}

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        accessibilityRole="button"
        onPress={confirmVisibilityChange}
        disabled={busy}
        style={styles.row}
        testID="settings-toggle-profile-visibility"
      >
        <Feather
          name={paused ? 'play-circle' : 'pause-circle'}
          size={19}
          color={colors.foreground}
        />
        <Text style={[styles.rowText, { color: colors.foreground }]}>
          {paused ? 'Resume profile' : 'Pause profile'}
        </Text>
        <Text style={[styles.rowState, { color: colors.mutedForeground }]}>
          {paused ? 'Paused' : 'Visible'}
        </Text>
      </Pressable>

      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      <Pressable
        accessibilityRole="button"
        onPress={signOut}
        style={styles.row}
        testID="button-sign-out"
      >
        <Feather name="log-out" size={19} color={colors.foreground} />
        <Text style={[styles.rowText, { color: colors.foreground }]}>
          Sign out
        </Text>
        <Text style={[styles.accountEmail, { color: colors.mutedForeground }]}>
          {auth.account?.email ?? ''}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={confirmDeleteAccount}
        disabled={busy}
        style={styles.deleteRow}
        testID="settings-delete-account"
      >
        <Feather name="trash-2" size={18} color={colors.primary} />
        <Text style={[styles.deleteText, { color: colors.primary }]}>
          Delete account
        </Text>
      </Pressable>

      <View style={[styles.note, { backgroundColor: colors.secondary }]}>
        <Feather
          name="info"
          size={17}
          color={colors.secondaryForeground}
        />
        <Text
          style={[
            styles.noteText,
            { color: colors.secondaryForeground },
          ]}
        >
          Profile edits and account controls are saved to your account.
        </Text>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  rowText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  rowState: { fontSize: 12 },
  accountEmail: { fontSize: 11, maxWidth: 140 },
  divider: { height: 1, marginVertical: 8 },
  deleteRow: {
    minHeight: 52,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  deleteText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  note: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    marginTop: 24,
  },
  noteText: { flex: 1, lineHeight: 19, fontSize: 12 },
});
