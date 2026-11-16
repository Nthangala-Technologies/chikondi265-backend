import { Feather } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const DISTRICT_GROUPS = [
  {
    region: 'Northern Region',
    shortName: 'North',
    districts: ['Chitipa', 'Karonga', 'Likoma', 'Mzimba', 'Nkhata Bay', 'Rumphi'],
  },
  {
    region: 'Central Region',
    shortName: 'Central',
    districts: [
      'Dedza',
      'Dowa',
      'Kasungu',
      'Lilongwe',
      'Mchinji',
      'Nkhotakota',
      'Ntcheu',
      'Ntchisi',
      'Salima',
    ],
  },
  {
    region: 'Southern Region',
    shortName: 'South',
    districts: [
      'Balaka',
      'Blantyre',
      'Chikwawa',
      'Chiradzulu',
      'Machinga',
      'Mangochi',
      'Mulanje',
      'Mwanza',
      'Neno',
      'Nsanje',
      'Phalombe',
      'Thyolo',
      'Zomba',
    ],
  },
] as const;

const REGIONS = ['All', ...DISTRICT_GROUPS.map(({ shortName }) => shortName)];
const REGION_NAME: Record<string, string> = {
  North: 'Northern Region',
  Central: 'Central Region',
  South: 'Southern Region',
};

export const MALAWI_DISTRICTS = DISTRICT_GROUPS.flatMap(({ districts }) => [
  ...districts,
]);

export function normalizeDistrict(value: string): string {
  const cleaned = value.trim();
  if (cleaned.toLowerCase() === 'mzuzu') return 'Mzimba';
  return MALAWI_DISTRICTS.find(
    (district) => district.toLowerCase() === cleaned.toLowerCase(),
  ) ?? cleaned;
}

export function districtFiltersForApi(districts: string[]): string[] {
  return [
    ...new Set(
      districts.flatMap((district) =>
        district === 'Mzimba' ? ['Mzimba', 'Mzuzu'] : [district],
      ),
    ),
  ];
}

type CommonProps = {
  label: string;
  testID: string;
  error?: string;
  placeholder?: string;
};

type SinglePickerProps = CommonProps & {
  mode?: 'single';
  value: string;
  onChange: (district: string) => void;
};

type MultiPickerProps = CommonProps & {
  mode: 'multiple';
  value: string[];
  onChange: (districts: string[]) => void;
};

type AnimatedDistrictPickerFieldProps =
  | SinglePickerProps
  | MultiPickerProps;

export function AnimatedDistrictPickerField(
  props: AnimatedDistrictPickerFieldProps,
) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [activeRegion, setActiveRegion] = useState('All');
  const [draftDistricts, setDraftDistricts] = useState<string[]>([]);
  const isMultiple = props.mode === 'multiple';
  const selectedDistricts = isMultiple
    ? props.value
    : props.value
      ? [props.value]
      : [];

  const animateTo = (value: number, onFinished?: () => void) => {
    Animated.spring(progress, {
      toValue: value,
      damping: 24,
      stiffness: 220,
      mass: 0.85,
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  };

  const openPicker = () => {
    progress.stopAnimation();
    progress.setValue(0);
    setActiveRegion('All');
    setDraftDistricts(selectedDistricts);
    setVisible(true);
    requestAnimationFrame(() => animateTo(1));
  };

  const closePicker = () => {
    progress.stopAnimation();
    animateTo(0, () => setVisible(false));
  };

  const chooseDistrict = (district: string) => {
    if (isMultiple) {
      setDraftDistricts((current) =>
        current.includes(district)
          ? current.filter((item) => item !== district)
          : [...current, district],
      );
      return;
    }
    props.onChange(district);
    closePicker();
  };

  const applyDistricts = () => {
    if (props.mode !== 'multiple') return;
    props.onChange(
      MALAWI_DISTRICTS.filter((district) => draftDistricts.includes(district)),
    );
    closePicker();
  };

  const filteredGroups =
    activeRegion === 'All'
      ? DISTRICT_GROUPS
      : DISTRICT_GROUPS.filter(
          (group) => group.shortName === activeRegion,
        );
  const selectionLabel = isMultiple
    ? selectedDistricts.length === 0
      ? 'Any district'
      : selectedDistricts.length === 1
        ? selectedDistricts[0]
        : `${selectedDistricts[0]} + ${selectedDistricts.length - 1} more`
    : selectedDistricts[0] || props.placeholder || 'Choose a district';

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {props.label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: ${selectionLabel}`}
        accessibilityHint="Opens an animated list of Malawi districts"
        onPress={openPicker}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: props.error ? colors.primary : colors.border,
          },
        ]}
        testID={props.testID}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            {
              color:
                selectedDistricts.length > 0
                  ? colors.foreground
                  : colors.mutedForeground,
            },
          ]}
        >
          {selectionLabel}
        </Text>
        <Feather name="map-pin" size={18} color={colors.primary} />
      </Pressable>
      {props.error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.primary }]}>
          {props.error}
        </Text>
      ) : null}

      <Modal
        transparent
        visible={visible}
        animationType="none"
        statusBarTranslucent
        onRequestClose={closePicker}
      >
        <View style={styles.modalRoot} accessibilityViewIsModal>
          <Animated.View
            pointerEvents="box-none"
            style={[StyleSheet.absoluteFill, { opacity: progress }]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close district selector"
              onPress={closePicker}
              style={[StyleSheet.absoluteFill, styles.backdrop]}
              testID={`${props.testID}-backdrop`}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom:
                  Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 16,
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [360, 0],
                    }),
                  },
                  {
                    scale: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.98, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Choose {isMultiple ? 'districts' : 'a district'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Malawi · 28 districts
            </Text>

            <View style={styles.regions}>
              {REGIONS.map((region) => {
                const active = activeRegion === region;
                return (
                  <Pressable
                    key={region}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveRegion(region)}
                    style={[
                      styles.regionChip,
                      {
                        backgroundColor: active ? colors.primary : colors.muted,
                      },
                    ]}
                    testID={`${props.testID}-region-${region.toLowerCase()}`}
                  >
                    <Text
                      style={[
                        styles.regionText,
                        {
                          color: active
                            ? colors.primaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {region}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <ScrollView
              style={styles.districtList}
              contentContainerStyle={styles.districtContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredGroups.map((group) => (
                <View key={group.region}>
                  <Text style={[styles.regionHeading, { color: colors.mutedForeground }]}>
                    {REGION_NAME[group.shortName]}
                  </Text>
                  <View style={styles.districtGrid}>
                    {group.districts.map((district) => {
                      const selected = (isMultiple
                        ? draftDistricts
                        : selectedDistricts
                      ).includes(district);
                      return (
                        <Pressable
                          key={district}
                          accessibilityRole="button"
                          accessibilityLabel={district}
                          accessibilityState={{ selected }}
                          onPress={() => chooseDistrict(district)}
                          style={[
                            styles.districtRow,
                            {
                              backgroundColor: selected
                                ? colors.secondary
                                : colors.background,
                              borderColor: selected
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                          testID={`${props.testID}-district-${district.toLowerCase().replaceAll(' ', '-')}`}
                        >
                          <Text
                            style={[
                              styles.districtName,
                              {
                                color: selected
                                  ? colors.secondaryForeground
                                  : colors.foreground,
                              },
                            ]}
                          >
                            {district}
                          </Text>
                          <Feather
                            name={selected ? 'check-circle' : 'circle'}
                            size={19}
                            color={selected ? colors.primary : colors.border}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>

            {isMultiple ? (
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={closePicker}
                  style={[styles.actionButton, { borderColor: colors.border }]}
                  testID={`${props.testID}-cancel`}
                >
                  <Text style={[styles.actionText, { color: colors.foreground }]}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={applyDistricts}
                  style={[
                    styles.actionButton,
                    styles.applyButton,
                    { backgroundColor: colors.primary },
                  ]}
                  testID={`${props.testID}-apply`}
                >
                  <Text
                    style={[
                      styles.actionText,
                      { color: colors.primaryForeground },
                    ]}
                  >
                    Apply {draftDistricts.length ? `(${draftDistricts.length})` : ''}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  trigger: {
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  triggerText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 15 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(23, 14, 24, 0.48)' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '88%',
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 21,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  regions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    marginBottom: 8,
  },
  regionChip: {
    minHeight: 36,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    paddingHorizontal: 8,
  },
  regionText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  districtList: { flexShrink: 1, minHeight: 160 },
  districtContent: { paddingBottom: 4 },
  regionHeading: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 13,
    marginBottom: 7,
  },
  districtGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  districtRow: {
    width: '48%',
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  districtName: { flexShrink: 1, fontFamily: 'Inter_500Medium', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
  },
  applyButton: { borderColor: 'transparent' },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
