import { useActivateCurrentAccount, useDeactivateCurrentAccount, useDeleteCurrentAccount } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Header, Shell } from '@/components/ui';
import { useAuth } from '@/components/AuthProvider';
import { useColors } from '@/hooks/useColors';
import { friendlyApiError, useErrorModal } from '@/components/ErrorModal';
import { useTheme, type ThemePreference } from '@/components/ThemeProvider';

export default function SettingsScreen() {
  const colors = useColors();
  const auth = useAuth();
  const theme = useTheme();
  const { showError } = useErrorModal();
  const deactivate = useDeactivateCurrentAccount();
  const activate = useActivateCurrentAccount();
  const deleteAccount = useDeleteCurrentAccount();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
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
      showError(
        friendlyApiError(error, 'We couldn’t update your profile. Check your connection and try again.'),
        'Could not update profile',
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
      showError(
        friendlyApiError(
          error,
          'This device is signed out, but the server could not end the session. Please sign in again.',
        ),
        'Signed out on this device',
      );
    }
  }

  function confirmDeleteAccount() {
    setDeleteConfirmation('');
    setDeleteModalVisible(true);
  }

  async function deleteMyAccount() {
    try {
      await deleteAccount.mutateAsync();
      setDeleteModalVisible(false);
      let storageCleanupFailed = false;
      try {
        await AsyncStorage.clear();
      } catch {
        storageCleanupFailed = true;
      }
      await auth.logout().catch(() => undefined);
      router.replace('/');
      if (storageCleanupFailed) {
        showError(
          'Your account was deleted, but some app data could not be cleared from this device.',
          'Account deleted',
        );
      }
    } catch (error) {
      showError(
        friendlyApiError(error, 'We couldn’t delete your account. Check your connection and try again.'),
        'Could not delete account',
      );
    }
  }

  async function selectTheme(preference: ThemePreference) {
    try {
      await theme.setPreference(preference);
    } catch (error) {
      showError(
        friendlyApiError(error, 'The appearance setting could not be saved on this device.'),
        'Theme not saved',
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
      <View style={styles.appearanceSection}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Appearance</Text>
        <View style={[styles.themePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {([
            { value: 'system', label: 'Use device settings', icon: 'smartphone' },
            { value: 'light', label: 'Light theme', icon: 'sun' },
            { value: 'dark', label: 'Dark theme', icon: 'moon' },
          ] as const).map((option) => {
            const selected = theme.preference === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => void selectTheme(option.value)}
                style={[
                  styles.themeOption,
                  selected && { backgroundColor: colors.secondary },
                ]}
              >
                <Feather name={option.icon} size={17} color={selected ? colors.primary : colors.mutedForeground} />
                <Text style={[styles.themeOptionText, { color: colors.foreground }]}>
                  {option.label}
                </Text>
                {selected ? <Feather name="check-circle" size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
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
      <Modal
        transparent
        animationType="fade"
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.deleteModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.deleteModalTitle, { color: colors.foreground }]}>
              Permanently delete your account?
            </Text>
            <Text style={[styles.deleteModalCopy, { color: colors.mutedForeground }]}>
              Your profile will be removed from discovery and this device will be signed out. Type DELETE to confirm.
            </Text>
            <TextInput
              value={deleteConfirmation}
              onChangeText={setDeleteConfirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Type DELETE"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Type DELETE to confirm account deletion"
              style={[
                styles.deleteInput,
                { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground },
              ]}
            />
            <View style={styles.deleteModalActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setDeleteModalVisible(false)}
                style={styles.modalCancel}
              >
                <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={deleteConfirmation !== 'DELETE' || deleteAccount.isPending}
                onPress={() => void deleteMyAccount()}
                style={[
                  styles.modalDelete,
                  { backgroundColor: colors.destructive, opacity: deleteConfirmation !== 'DELETE' || deleteAccount.isPending ? 0.5 : 1 },
                ]}
              >
                <Text style={{ color: colors.destructiveForeground, fontFamily: 'Inter_600SemiBold' }}>
                  {deleteAccount.isPending ? 'Deleting…' : 'Delete account'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  appearanceSection: { gap: 10, marginBottom: 18 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  themePanel: { borderWidth: 1, borderRadius: 18, padding: 7 },
  themeOption: { minHeight: 46, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11 },
  themeOptionText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(15, 12, 19, 0.5)' },
  deleteModal: { borderWidth: 1, borderRadius: 23, padding: 20, gap: 14 },
  deleteModalTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  deleteModalCopy: { fontSize: 14, lineHeight: 21 },
  deleteInput: { height: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, fontSize: 15 },
  deleteModalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 9, marginTop: 2 },
  modalCancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  modalDelete: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 13 },
});
