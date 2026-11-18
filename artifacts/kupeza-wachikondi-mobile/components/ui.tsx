import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { ReactNode, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, Platform, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { profileImages, Profile } from '@/components/AppProvider';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';

export function Shell({
  children,
  scroll = true,
  keyboardAware = false,
  contentBottomPadding,
}: {
  children: ReactNode;
  scroll?: boolean;
  keyboardAware?: boolean;
  contentBottomPadding?: number;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const content = <View style={[styles.content, !scroll && styles.fillContent, { paddingTop: insets.top + 12, paddingBottom: contentBottomPadding ?? insets.bottom + 100 }]}>{children}</View>;
  const scrollContent = keyboardAware ? (
    <KeyboardAwareScrollViewCompat
      bottomOffset={40}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {content}
    </KeyboardAwareScrollViewCompat>
  ) : (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {content}
    </ScrollView>
  );
  return <View style={[styles.shell, { backgroundColor: colors.background }]}>{scroll ? scrollContent : content}</View>;
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={light ? 'Chikondi265 App' : 'Go to home'}
      onPress={() => router.push('/(tabs)')}
      style={styles.brand}
    >
      <Image
        source={profileImages.logo}
        resizeMode="contain"
        style={styles.brandLogo}
      />
    </Pressable>
  );
}

export function Header({
  back,
  right,
}: {
  title?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Brand />
      {back && (
        <Pressable onPress={() => router.back()} style={styles.iconButton}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      )}
      <View style={styles.headerSpacer} />
      {right ?? (
        <Pressable
          onPress={() => router.push('/notifications')}
          style={styles.iconButton}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Feather name="bell" size={20} color={colors.foreground} />
        </Pressable>
      )}
    </View>
  );
}

export function Avatar({ profile, size = 52 }: { profile: Profile; size?: number }) {
  return <PhotoAvatar photo={profile.photo} size={size} />;
}

export function PhotoAvatar({ photo, size = 52 }: { photo: number | string; size?: number }) {
  return (
    <Image
      source={imageFor(photo)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  );
}

export function imageFor(photo: number | string): ImageSourcePropType {
  if (
    typeof photo === 'string' &&
    /^data:image\/(?:jpeg|png|webp);base64,/.test(photo)
  ) {
    return { uri: photo };
  }
  if (typeof photo === 'string' && photo.startsWith('/uploads/')) {
    const apiBase = process.env.EXPO_PUBLIC_API_URL;
    if (!apiBase) throw new Error('EXPO_PUBLIC_API_URL must be configured to load profile photos.');
    return { uri: `${apiBase.replace(/\/+$/, '')}${photo}` };
  }
  if (typeof photo === 'string' && photo in profileImages) {
    return profileImages[photo as keyof typeof profileImages];
  }
  const index = typeof photo === 'number' ? photo : 0;
  return [profileImages.chisomo, profileImages.thoko, profileImages.mwayi][
    ((index % 3) + 3) % 3
  ];
}

export function Button({ children, onPress, secondary = false, icon, testID, disabled = false }: { children: ReactNode; onPress: () => void; secondary?: boolean; icon?: keyof typeof Feather.glyphMap; testID?: string; disabled?: boolean }) {
  const colors = useColors();
  return (
    <PressScale
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: secondary ? colors.secondary : colors.primary, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      {icon && <Feather name={icon} size={20} color={secondary ? colors.secondaryForeground : colors.primaryForeground} />}
      <Text style={[styles.buttonText, { color: secondary ? colors.secondaryForeground : colors.primaryForeground }]}>{children}</Text>
    </PressScale>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({
  children,
  onPress,
  style,
  disabled = false,
  testID,
  accessibilityLabel,
  accessibilityRole = 'button',
}: {
  children: ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityRole?: 'button';
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const animateScale = (value: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateScale(0.97)}
      onPressOut={() => animateScale(1)}
      style={[style, { transform: [{ scale }] }]}
      testID={testID}
    >
      {children}
    </AnimatedPressable>
  );
}

export function IconButton({ name, onPress, color }: { name: keyof typeof Feather.glyphMap; onPress: () => void; color?: string }) {
  const colors = useColors();
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.roundButton, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}><Feather name={name} size={20} color={color ?? colors.foreground} /></Pressable>;
}

export function Chip({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const colors = useColors();
  return <Pressable disabled={!onPress} onPress={onPress} style={[styles.chip, { backgroundColor: active ? colors.accent : colors.surface, borderColor: active ? colors.primary : colors.border }]}><Text style={{ color: active ? colors.primary : colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' }}>{label}</Text></Pressable>;
}

export const styles = StyleSheet.create({
  shell: { flex: 1 },
  fillContent: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { paddingHorizontal: 18 },
  header: { minHeight: 64, marginHorizontal: -18, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerSpacer: { flex: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandLogo: { width: 42, height: 42 },
  headerBrand: { marginBottom: 20 },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  roundButton: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  button: { minHeight: 48, paddingHorizontal: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
});