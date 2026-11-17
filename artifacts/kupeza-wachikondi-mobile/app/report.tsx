import { useCreateSafetyReport } from '@workspace/api-client-react';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Chip, Header, Shell } from '@/components/ui';
import { useColors } from '@/hooks/useColors';
import { useErrorModal } from '@/components/ErrorModal';

const categories = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'scam', label: 'Scam' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'underage', label: 'Underage' },
  { value: 'other', label: 'Other' },
] as const;

export default function ReportScreen() {
  const colors = useColors();
  const { showError } = useErrorModal();
  const { userId, connectionId } = useLocalSearchParams<{
    userId?: string;
    connectionId?: string;
  }>();
  const createReport = useCreateSafetyReport();
  const [category, setCategory] = useState<(typeof categories)[number]['value']>('other');
  const [details, setDetails] = useState('');

  async function submit() {
    if (!userId) {
      Alert.alert('Profile unavailable', 'Return to the profile and try again.');
      return;
    }
    try {
      await createReport.mutateAsync({
        data: {
          reportedUserId: userId,
          category,
          ...(connectionId ? { connectionId } : {}),
          ...(details.trim() ? { details: details.trim() } : {}),
        },
      });
      Alert.alert('Report sent', 'Thank you. Our team will review it.', [
        { text: 'Done', onPress: () => router.back() },
      ]);
    } catch {
      showError('We couldn’t send your report. Check your connection and try again.', 'Could not send report');
    }
  }

  return (
    <Shell keyboardAware>
      <Header title="Report profile" back />
      <Text style={[styles.title, { color: colors.foreground }]}>What happened?</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>
        Reports are private. Choose the closest reason and include any details that may help.
      </Text>
      <View style={styles.choices}>
        {categories.map((item) => (
          <Chip
            key={item.value}
            label={item.label}
            active={category === item.value}
            onPress={() => setCategory(item.value)}
          />
        ))}
      </View>
      <TextInput
        value={details}
        onChangeText={setDetails}
        placeholder="Optional details"
        placeholderTextColor={colors.mutedForeground}
        multiline
        maxLength={1000}
        textAlignVertical="top"
        style={[styles.details, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        accessibilityLabel="Optional report details"
      />
      <Text style={[styles.counter, { color: colors.mutedForeground }]}>{details.length}/1000</Text>
      <Button onPress={() => void submit()} disabled={createReport.isPending} icon="shield">
        {createReport.isPending ? 'Sending…' : 'Send report'}
      </Button>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, letterSpacing: -0.8, marginTop: 14 },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  details: { minHeight: 130, borderWidth: 1, borderRadius: 17, padding: 14, marginTop: 20, fontSize: 14, lineHeight: 20 },
  counter: { alignSelf: 'flex-end', fontSize: 11, marginVertical: 8 },
});
