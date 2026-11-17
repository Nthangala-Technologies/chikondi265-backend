import { getGetCurrentUserQueryKey, useSaveCurrentUserProfile } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Button, Header, Shell } from '@/components/ui';
import { AnimatedDatePickerField } from '@/components/AnimatedDatePickerField';
import { IntentionPicker } from '@/components/IntentionPicker';
import {
  AnimatedDistrictPickerField,
  normalizeDistrict,
} from '@/components/AnimatedDistrictPickerField';
import { useAuth } from '@/components/AuthProvider';
import { friendlyApiError, useErrorModal } from '@/components/ErrorModal';
import { useColors } from '@/hooks/useColors';
import { isIntention, type Intention } from '@/utils/intentions';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  multiline?: boolean;
  testID: string;
  keyboardType?: TextInputProps['keyboardType'];
};

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  multiline = false,
  testID,
  keyboardType,
}: FieldProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        keyboardType={keyboardType}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[
          styles.input,
          multiline && styles.textarea,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.primary : colors.border,
            color: colors.foreground,
          },
        ]}
      />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.primary }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function firstFieldError(errors: Record<string, string[]>, field: string) {
  return errors[field]?.[0];
}

export default function ProfileEditScreen() {
  const colors = useColors();
  const auth = useAuth();
  const { showError } = useErrorModal();
  const queryClient = useQueryClient();
  const profile = auth.account?.profile;
  const saveProfile = useSaveCurrentUserProfile();
  const currentIntention = profile?.intention;
  const [username, setUsername] = useState(profile?.username ?? '');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '');
  const [city, setCity] = useState(
    normalizeDistrict(profile?.city ?? ''),
  );
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [interests, setInterests] = useState(
    (profile?.interests ?? []).join(', '),
  );
  const [intention, setIntention] = useState<Intention>(
    isIntention(currentIntention)
      ? currentIntention
      : 'long-term',
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function save() {
    setFieldErrors({});
    try {
      await saveProfile.mutateAsync({
        data: {
          ...(username.trim() ? { username: username.trim().toLowerCase() } : {}),
          displayName,
          birthDate,
          city,
          countryCode: profile?.countryCode ?? 'MW',
          bio,
          interests: interests
            .split(',')
            .map((interest) => interest.trim())
            .filter(Boolean),
          intention,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() }),
        auth.refreshAccount(),
      ]);
      Alert.alert('Profile saved', 'Your profile changes are now live.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch (error) {
      const apiError = (
        error as {
          data?: {
            error?: {
              message?: string;
              fieldErrors?: Record<string, string[]>;
            };
          };
        }
      )?.data?.error;
      if (apiError?.fieldErrors) {
        setFieldErrors(apiError.fieldErrors);
      }
      showError(
        friendlyApiError(error, 'We couldn’t save your profile. Check your connection and try again.'),
        'Could not save profile',
      );
    }
  }

  function confirmSave() {
    Alert.alert(
      'Save profile changes?',
      'Your updated profile will be used in discovery.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save changes', onPress: () => void save() },
      ],
    );
  }

  return (
    <Shell keyboardAware>
      <Header title="Edit profile" back />
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Keep your details current so people can get to know you.
      </Text>
      <ProfileField
        label="Username"
        testID="profile-username"
        value={username}
        onChangeText={(value) =>
          setUsername(value.toLowerCase().replace(/\s+/g, '_').slice(0, 30))
        }
        error={firstFieldError(fieldErrors, 'username')}
        placeholder="your_name"
      />
      <ProfileField
        label="Display name"
        testID="profile-display-name"
        value={displayName}
        onChangeText={setDisplayName}
        error={firstFieldError(fieldErrors, 'displayName')}
        placeholder="Your name"
      />
      <View style={styles.field}>
        <AnimatedDatePickerField
          label="Date of birth"
          testID="profile-birth-date"
          value={birthDate}
          onChange={setBirthDate}
          error={firstFieldError(fieldErrors, 'birthDate')}
        />
      </View>
      <AnimatedDistrictPickerField
        label="District"
        testID="profile-city"
        value={city}
        onChange={setCity}
        error={firstFieldError(fieldErrors, 'city')}
      />
      <ProfileField
        label="Your introduction"
        testID="profile-bio"
        value={bio}
        onChangeText={setBio}
        error={firstFieldError(fieldErrors, 'bio')}
        placeholder="A little about you"
        multiline
      />
      <ProfileField
        label="Interests, separated by commas"
        testID="profile-interests"
        value={interests}
        onChangeText={setInterests}
        error={firstFieldError(fieldErrors, 'interests')}
        placeholder="Music, cooking, travel"
      />
      <IntentionPicker
        label="What are you looking for?"
        value={intention}
        onChange={setIntention}
        testID="profile-intention"
        error={firstFieldError(fieldErrors, 'intention')}
      />
      <View style={styles.saveButton}>
        <Button
          testID="save-profile"
          onPress={confirmSave}
          disabled={saveProfile.isPending}
          icon="check"
        >
          {saveProfile.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </View>
      <View style={{ height: 20 }} />
    </Shell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  field: { marginTop: 12 },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
  },
  textarea: { minHeight: 118, lineHeight: 21 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  saveButton: { marginTop: 24 },
});
