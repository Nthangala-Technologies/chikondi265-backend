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
import {
  getIntentionLabel,
  INTENTION_OPTIONS,
  type Intention,
} from '@/utils/intentions';

type IntentionPickerProps = {
  label: string;
  value: Intention | '';
  onChange: (value: Intention) => void;
  testID: string;
  error?: string;
};

export function IntentionPicker({
  label,
  value,
  onChange,
  testID,
  error,
}: IntentionPickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const selectionLabel = value ? getIntentionLabel(value) : 'Choose an option';

  const animateTo = (toValue: number, onFinished?: () => void) => {
    Animated.spring(progress, {
      toValue,
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
    setVisible(true);
    requestAnimationFrame(() => animateTo(1));
  };

  const closePicker = () => {
    progress.stopAnimation();
    animateTo(0, () => setVisible(false));
  };

  const chooseIntention = (intention: Intention) => {
    onChange(intention);
    closePicker();
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectionLabel}`}
        accessibilityHint="Required. Opens an animated intention selector."
        accessibilityState={{ selected: Boolean(value) }}
        onPress={openPicker}
        style={[
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.primary : colors.border,
          },
        ]}
        testID={testID}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            {
              color: value ? colors.foreground : colors.mutedForeground,
            },
          ]}
        >
          {selectionLabel}
        </Text>
        <Feather name="chevron-down" size={18} color={colors.primary} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.primary }]}>
          {error}
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
              accessibilityLabel="Close intention selector"
              onPress={closePicker}
              style={[StyleSheet.absoluteFill, styles.backdrop]}
              testID={`${testID}-backdrop`}
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
              What are you looking for?
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Choose one option
            </Text>
            <ScrollView
              style={styles.optionList}
              contentContainerStyle={styles.optionContent}
              showsVerticalScrollIndicator={false}
            >
              {INTENTION_OPTIONS.map((option) => {
                const selected = value === option.value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityLabel={option.label}
                    accessibilityState={{ selected }}
                    onPress={() => chooseIntention(option.value)}
                    style={[
                      styles.optionRow,
                      {
                        backgroundColor: selected
                          ? colors.secondary
                          : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    testID={`${testID}-option-${option.value}`}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        {
                          color: selected
                            ? colors.secondaryForeground
                            : colors.foreground,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Feather
                      name={selected ? 'check-circle' : 'circle'}
                      size={19}
                      color={selected ? colors.primary : colors.border}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
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
  optionList: { flexShrink: 1, minHeight: 160, marginTop: 18 },
  optionContent: { gap: 8, paddingBottom: 4 },
  optionRow: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionLabel: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
});
