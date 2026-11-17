import { useChangeCurrentPassword } from '@workspace/api-client-react';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Button, Header, Shell } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { friendlyApiError, useErrorModal } from '@/components/ErrorModal';

export default function PasswordChangeScreen() {
  const colors = useColors();
  const { showError } = useErrorModal();
  const changePassword = useChangeCurrentPassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');

  async function savePassword() {
    setConfirmError('');
    if (newPassword !== confirmPassword) {
      setConfirmError('The new passwords do not match.');
      return;
    }

    try {
      await changePassword.mutateAsync({
        data: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert(
        'Password updated',
        'Other sessions have been signed out. This device remains signed in.',
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (error) {
      showError(
        friendlyApiError(error, 'We couldn’t update your password. Check your connection and try again.'),
        'Could not update password',
      );
    }
  }

  function confirmSave() {
    Alert.alert(
      'Change your password?',
      'Other signed-in devices will need to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change password', onPress: () => void savePassword() },
      ],
    );
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
    },
  ];

  return (
    <Shell keyboardAware>
      <Header title="Change password" back />
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Choose a password with at least 12 characters.
      </Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        Current password
      </Text>
      <TextInput
        testID="current-password"
        accessibilityLabel="Current password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        style={inputStyle}
      />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        New password
      </Text>
      <TextInput
        testID="new-password"
        accessibilityLabel="New password"
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        style={inputStyle}
      />
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        Confirm new password
      </Text>
      <TextInput
        testID="confirm-new-password"
        accessibilityLabel="Confirm new password"
        value={confirmPassword}
        onChangeText={(value) => {
          setConfirmPassword(value);
          if (confirmError) setConfirmError('');
        }}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        style={[
          inputStyle,
          confirmError ? { borderColor: colors.primary } : null,
        ]}
      />
      {confirmError ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.primary }]}>
          {confirmError}
        </Text>
      ) : null}
      <View style={{ height: 18 }} />
      <Button
        testID="submit-password-change"
        onPress={confirmSave}
        disabled={changePassword.isPending}
        icon="lock"
      >
        {changePassword.isPending ? 'Updating…' : 'Update password'}
      </Button>
    </Shell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginTop: 12,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
  },
  error: { fontSize: 12, marginTop: 6 },
});
