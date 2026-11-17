import { Feather } from '@expo/vector-icons';
import {
  getGetCurrentPreferencesQueryKey,
  getGetDiscoveryQueryKey,
  useGetCurrentPreferences,
  useSaveCurrentPreferences,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Chip, Header, Shell } from '@/components/ui';
import {
  AnimatedDistrictPickerField,
  districtFiltersForApi,
  normalizeDistrict,
} from '@/components/AnimatedDistrictPickerField';
import { useColors } from '@/hooks/useColors';
import { useErrorModal } from '@/components/ErrorModal';
import { INTENTION_OPTIONS, type Intention } from '@/utils/intentions';

export default function FiltersScreen() {
  const colors = useColors();
  const { showError } = useErrorModal();
  const queryClient = useQueryClient();
  const preferencesQuery = useGetCurrentPreferences();
  const savePreferences = useSaveCurrentPreferences();
  const initialized = useRef(false);
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('99');
  const [intentions, setIntentions] = useState<Intention[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [interests, setInterests] = useState('');

  useEffect(() => {
    if (initialized.current || !preferencesQuery.data) return;
    initialized.current = true;
    setAgeMin(String(preferencesQuery.data.ageMin));
    setAgeMax(String(preferencesQuery.data.ageMax));
    setIntentions(preferencesQuery.data.intentions);
    setCities(
      [...new Set(preferencesQuery.data.cities.map(normalizeDistrict))],
    );
    setInterests(preferencesQuery.data.interests.join(', '));
  }, [preferencesQuery.data]);

  const toggleIntention = (value: Intention) => {
    setIntentions((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  };

  const splitValues = (value: string) => [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))];

  async function save() {
    const minimum = Number(ageMin);
    const maximum = Number(ageMax);
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || minimum < 18 || maximum > 99 || minimum > maximum) {
      Alert.alert('Check your age range', 'Choose whole-number ages from 18 to 99, with the maximum at or above the minimum.');
      return;
    }

    try {
      await savePreferences.mutateAsync({
        data: {
          ageMin: minimum,
          ageMax: maximum,
          intentions,
          cities: districtFiltersForApi(cities),
          interests: splitValues(interests),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetCurrentPreferencesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDiscoveryQueryKey() }),
      ]);
      router.back();
    } catch {
      showError('We couldn’t save your preferences. Check your connection and try again.', 'Could not save preferences');
    }
  }

  if (preferencesQuery.isPending) {
    return <Shell><Header title="Preferences" back /><View style={styles.state}><ActivityIndicator color={colors.primary} /></View></Shell>;
  }
  if (preferencesQuery.isError) {
    return (
      <Shell>
        <Header title="Preferences" back />
        <View style={styles.state}>
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>We couldn’t load your saved preferences.</Text>
          <Button onPress={() => void preferencesQuery.refetch()} secondary icon="repeat">Try again</Button>
        </View>
      </Shell>
    );
  }

  return (
    <Shell keyboardAware>
      <Header title="Preferences" back />
      <Text style={[styles.title, { color: colors.foreground }]}>Shape your introductions.</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>
        These choices are saved to your account and applied to discovery. Distance is not shown because profiles only provide city-level locations.
      </Text>

      <Text style={[styles.label, { color: colors.foreground }]}>Age range</Text>
      <View style={styles.ageRow}>
        <View style={[styles.ageField, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Minimum</Text>
          <TextInput value={ageMin} onChangeText={setAgeMin} keyboardType="number-pad" maxLength={2} style={[styles.input, { color: colors.foreground }]} accessibilityLabel="Minimum age" />
        </View>
        <View style={[styles.ageField, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Maximum</Text>
          <TextInput value={ageMax} onChangeText={setAgeMax} keyboardType="number-pad" maxLength={2} style={[styles.input, { color: colors.foreground }]} accessibilityLabel="Maximum age" />
        </View>
      </View>

      <Text style={[styles.label, { color: colors.foreground }]}>Intentions</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground }]}>Leave all unselected to see any intention.</Text>
      <View style={styles.choices}>
        {INTENTION_OPTIONS.map((option) => (
          <Chip key={option.value} label={option.label} active={intentions.includes(option.value)} onPress={() => toggleIntention(option.value)} />
        ))}
      </View>

      <AnimatedDistrictPickerField
        label="Preferred districts"
        mode="multiple"
        value={cities}
        onChange={setCities}
        testID="preferences-districts"
      />

      <Text style={[styles.label, { color: colors.foreground }]}>Shared interests</Text>
      <TextInput
        value={interests}
        onChangeText={setInterests}
        placeholder="Any interests, or e.g. music, reading"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.textField, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        accessibilityLabel="Preferred interests, separated by commas"
      />
      <Button onPress={() => void save()} disabled={savePreferences.isPending} icon="check">
        {savePreferences.isPending ? 'Saving…' : 'Save preferences'}
      </Button>
    </Shell>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'Inter_700Bold', fontSize: 27, letterSpacing: -1, marginTop: 12 },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  label: { fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 25, marginBottom: 9 },
  hint: { fontSize: 12, lineHeight: 18 },
  ageRow: { flexDirection: 'row', gap: 10 },
  ageField: { flex: 1, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, paddingTop: 9 },
  input: { fontFamily: 'Inter_700Bold', fontSize: 18, paddingVertical: 5 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 9 },
  textField: { minHeight: 48, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, fontSize: 14, marginTop: 3 },
  state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
});
