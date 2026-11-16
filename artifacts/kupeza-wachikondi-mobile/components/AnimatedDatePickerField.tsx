import { Feather } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type AnimatedDatePickerFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testID: string;
  error?: string;
};

const MIN_YEAR = 1900;
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function getLatestAdultBirthDate(): Date {
  const today = new Date();
  return new Date(
    today.getUTCFullYear() - 18,
    today.getUTCMonth(),
    today.getUTCDate(),
  );
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null;
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function AnimatedDatePickerField({
  label,
  value,
  onChange,
  testID,
  error,
}: AnimatedDatePickerFieldProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [draftDate, setDraftDate] = useState(getLatestAdultBirthDate);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(getLatestAdultBirthDate()),
  );
  const [selectingYear, setSelectingYear] = useState(false);
  const [yearPageStart, setYearPageStart] = useState(
    () => Math.max(MIN_YEAR, Math.floor(getLatestAdultBirthDate().getFullYear() / 12) * 12),
  );

  const maxDate = getLatestAdultBirthDate();
  const minDate = new Date(MIN_YEAR, 0, 1);
  const useNativeDriver = Platform.OS !== 'web';
  const displayValue = parseDate(value);
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstWeekday = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  ).getDay();
  const calendarCells = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) => {
        const day = index - firstWeekday + 1;
        return day < 1 || day > daysInMonth
          ? null
          : new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
      }),
    [daysInMonth, firstWeekday, visibleMonth],
  );
  const maxMonth = maxDate.getFullYear() * 12 + maxDate.getMonth();
  const visibleMonthIndex =
    visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
  const canGoToPreviousMonth =
    visibleMonth.getFullYear() > MIN_YEAR || visibleMonth.getMonth() > 0;
  const canGoToNextMonth = visibleMonthIndex < maxMonth;
  const canGoToPreviousYearPage = yearPageStart > MIN_YEAR;
  const canGoToNextYearPage =
    yearPageStart + 12 <= maxDate.getFullYear();

  const animateTo = (value: number, onFinished?: () => void) => {
    Animated.spring(progress, {
      toValue: value,
      damping: 24,
      stiffness: 220,
      mass: 0.85,
      useNativeDriver,
    }).start(({ finished }) => {
      if (finished) onFinished?.();
    });
  };

  const openPicker = () => {
    Keyboard.dismiss();
    const currentValue = parseDate(value);
    const initialDate =
      currentValue && currentValue <= maxDate && currentValue >= minDate
        ? currentValue
        : maxDate;
    progress.stopAnimation();
    progress.setValue(0);
    setDraftDate(initialDate);
    setVisibleMonth(startOfMonth(initialDate));
    setYearPageStart(
      Math.max(MIN_YEAR, Math.floor(initialDate.getFullYear() / 12) * 12),
    );
    setSelectingYear(false);
    setVisible(true);
    requestAnimationFrame(() => animateTo(1));
  };

  const closePicker = () => {
    progress.stopAnimation();
    animateTo(0, () => setVisible(false));
  };

  const moveMonth = (direction: -1 | 1) => {
    setVisibleMonth(
      (month) => new Date(month.getFullYear(), month.getMonth() + direction, 1),
    );
  };

  const moveYearPage = (direction: -1 | 1) => {
    setYearPageStart((start) =>
      Math.max(MIN_YEAR, start + direction * 12),
    );
  };

  const chooseYear = (year: number) => {
    if (year > maxDate.getFullYear()) return;
    setVisibleMonth(
      (month) => new Date(year, month.getMonth(), 1),
    );
    setSelectingYear(false);
  };

  const confirmDate = () => {
    if (draftDate > maxDate || draftDate < minDate) return;
    onChange(toDateKey(draftDate));
    closePicker();
  };

  const yearOptions = Array.from(
    { length: 12 },
    (_, index) => yearPageStart + index,
  ).filter((year) => year >= MIN_YEAR);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}${displayValue ? `, ${formatDisplayDate(displayValue)}` : ''}`}
        accessibilityHint="Opens an animated calendar"
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
          style={[
            styles.triggerText,
            { color: displayValue ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {displayValue ? formatDisplayDate(displayValue) : 'Choose a date'}
        </Text>
        <Feather name="calendar" size={19} color={colors.primary} />
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
              accessibilityLabel="Close date picker"
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
                  Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 0) + 18,
                opacity: progress,
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [320, 0],
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
              Select {label.toLowerCase()}
            </Text>
            <Text style={[styles.dateSummary, { color: colors.mutedForeground }]}>
              {formatDisplayDate(draftDate)}
            </Text>

            <View style={styles.calendarHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  selectingYear ? 'Show earlier years' : 'Previous month'
                }
                accessibilityState={{
                  disabled: selectingYear
                    ? !canGoToPreviousYearPage
                    : !canGoToPreviousMonth,
                }}
                disabled={
                  selectingYear
                    ? !canGoToPreviousYearPage
                    : !canGoToPreviousMonth
                }
                onPress={() =>
                  selectingYear ? moveYearPage(-1) : moveMonth(-1)
                }
                style={styles.calendarArrow}
              >
                <Feather
                  name="chevron-left"
                  size={21}
                  color={colors.foreground}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  selectingYear ? 'Choose a month' : 'Choose a year'
                }
                onPress={() => {
                  if (!selectingYear) {
                    setYearPageStart(
                      Math.max(
                        MIN_YEAR,
                        Math.floor(visibleMonth.getFullYear() / 12) * 12,
                      ),
                    );
                  }
                  setSelectingYear((current) => !current);
                }}
                style={styles.monthButton}
              >
                <Text style={[styles.monthTitle, { color: colors.foreground }]}>
                  {selectingYear
                    ? `${yearPageStart}–${Math.min(yearPageStart + 11, maxDate.getFullYear())}`
                    : `${MONTH_NAMES[visibleMonth.getMonth()]} ${visibleMonth.getFullYear()}`}
                </Text>
                <Feather
                  name={selectingYear ? 'chevron-down' : 'chevron-up'}
                  size={15}
                  color={colors.mutedForeground}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  selectingYear ? 'Show later years' : 'Next month'
                }
                accessibilityState={{
                  disabled: selectingYear
                    ? !canGoToNextYearPage
                    : !canGoToNextMonth,
                }}
                disabled={
                  selectingYear
                    ? !canGoToNextYearPage
                    : !canGoToNextMonth
                }
                onPress={() =>
                  selectingYear ? moveYearPage(1) : moveMonth(1)
                }
                style={styles.calendarArrow}
              >
                <Feather
                  name="chevron-right"
                  size={21}
                  color={colors.foreground}
                />
              </Pressable>
            </View>

            {selectingYear ? (
              <View style={styles.yearGrid}>
                {yearOptions.map((year) => {
                  const selected = year === visibleMonth.getFullYear();
                  const disabled = year > maxDate.getFullYear();
                  return (
                    <Pressable
                      key={year}
                      accessibilityRole="button"
                      accessibilityLabel={`Choose ${year}`}
                      accessibilityState={{ selected, disabled }}
                      disabled={disabled}
                      onPress={() => chooseYear(year)}
                      style={[
                        styles.yearCell,
                        selected && { backgroundColor: colors.primary },
                      ]}
                      testID={`${testID}-year-${year}`}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          {
                            color: selected
                              ? colors.primaryForeground
                              : disabled
                                ? colors.mutedForeground
                                : colors.foreground,
                            opacity: disabled ? 0.4 : 1,
                          },
                        ]}
                      >
                        {year}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.weekdays}>
                  {WEEKDAYS.map((weekday, index) => (
                    <Text
                      key={`${weekday}-${index}`}
                      style={[styles.weekday, { color: colors.mutedForeground }]}
                    >
                      {weekday}
                    </Text>
                  ))}
                </View>
                <View style={styles.daysGrid}>
                  {calendarCells.map((date, index) => {
                    if (!date) {
                      return <View key={`empty-${index}`} style={styles.dayCell} />;
                    }
                    const disabled = date > maxDate || date < minDate;
                    const selected = toDateKey(date) === toDateKey(draftDate);
                    return (
                      <Pressable
                        key={toDateKey(date)}
                        accessibilityRole="button"
                        accessibilityLabel={formatDisplayDate(date)}
                        accessibilityState={{ selected, disabled }}
                        disabled={disabled}
                        onPress={() => setDraftDate(date)}
                        style={[
                          styles.dayCell,
                          selected && { backgroundColor: colors.primary },
                        ]}
                        testID={`${testID}-day-${toDateKey(date)}`}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            {
                              color: selected
                                ? colors.primaryForeground
                                : colors.foreground,
                              opacity: disabled ? 0.35 : 1,
                            },
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={closePicker}
                style={[styles.actionButton, { borderColor: colors.border }]}
                testID={`${testID}-cancel`}
              >
                <Text style={[styles.actionText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={confirmDate}
                style={[
                  styles.actionButton,
                  styles.confirmButton,
                  { backgroundColor: colors.primary },
                ]}
                testID={`${testID}-confirm`}
              >
                <Text
                  style={[
                    styles.actionText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  Use date
                </Text>
              </Pressable>
            </View>
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
  },
  triggerText: { fontFamily: 'Inter_400Regular', fontSize: 15 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(23, 14, 24, 0.48)' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 21,
    textAlign: 'center',
  },
  dateSummary: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 12,
  },
  calendarHeader: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  calendarArrow: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  monthTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  weekdays: { flexDirection: 'row', marginBottom: 3 },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    paddingVertical: 8,
  },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
  },
  dayText: { fontFamily: 'Inter_500Medium', fontSize: 14 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
  yearCell: {
    width: '25%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionButton: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
  },
  confirmButton: { borderColor: 'transparent' },
  actionText: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});
