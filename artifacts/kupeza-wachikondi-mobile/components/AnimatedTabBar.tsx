import React, { useEffect, useState } from 'react';
import { Keyboard, LayoutChangeEvent, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, withSequence } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/components/ThemeProvider';

export const TAB_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  index: 'compass', likes: 'heart', matches: 'users', messages: 'message-circle', profile: 'user',
};

const SPRING = { damping: 18, stiffness: 220, mass: 0.8 };

function TabItem({ label, icon, focused, onPress, onLongPress, accessibilityLabel, testID, reduce }: {
  label: string; icon: keyof typeof Feather.glyphMap; focused: boolean; onPress: () => void; onLongPress: () => void;
  accessibilityLabel?: string; testID?: string; reduce: boolean;
}) {
  const colors = useColors();
  const active = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);
  const bounce = useSharedValue(0);

  useEffect(() => {
    active.value = reduce ? withTiming(focused ? 1 : 0, { duration: 120 }) : withSpring(focused ? 1 : 0, SPRING);
    if (focused && !reduce) bounce.value = withSequence(withTiming(-5, { duration: 140 }), withSpring(0, { damping: 9, stiffness: 260 }));
  }, [focused, reduce, active, bounce]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value - active.value * 1 }, { scale: press.value * (1 + active.value * 0.08) }],
  }));
  const labelStyle = useAnimatedStyle(() => ({ opacity: 0.72 + active.value * 0.28 }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: active.value, transform: [{ scale: active.value }] }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID ?? `tab-${label.toLowerCase()}`}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { if (!reduce) press.value = withSpring(0.86, { damping: 15, stiffness: 400 }); }}
      onPressOut={() => { press.value = reduce ? 1 : withSpring(1, { damping: 10, stiffness: 300 }); }}
      hitSlop={4}
      style={styles.item}
    >
      <Animated.View style={iconStyle}>
        <Feather name={icon} size={21} color={focused ? colors.primary : colors.mutedForeground} />
      </Animated.View>
      <Animated.Text numberOfLines={1} style={[styles.label, { color: focused ? colors.primary : colors.mutedForeground, fontFamily: focused ? 'Inter_700Bold' : 'Inter_500Medium' }, labelStyle]}>
        {label}
      </Animated.Text>
      <Animated.View style={[styles.dot, { backgroundColor: colors.accent }, dotStyle]} />
    </Pressable>
  );
}

export function AnimatedTabBar({ state, descriptors, emitter, navigateToTab }: BottomTabBarProps) {
  const colors = useColors();
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const web = Platform.OS === 'web';
  const ios = Platform.OS === 'ios';
  const [width, setWidth] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const count = state.routes.length;
  const slot = width / count;
  const x = useSharedValue(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!slot) return;
    const target = state.index * slot;
    x.value = reduce ? target : withSpring(target, SPRING);
  }, [state.index, slot, reduce, x]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  // A custom tab bar must implement keyboard hiding itself.
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  const flat = StyleSheet.flatten(focusedOptions.tabBarStyle);
  if (flat?.display === 'none' || (focusedOptions.tabBarHideOnKeyboard && keyboardVisible)) return null;

  const bottom = web ? 34 : Math.max(insets.bottom, 10);

  return (
    <View style={[styles.wrap, { paddingBottom: bottom }]} pointerEvents="box-none">
      <View style={[styles.bar, { borderColor: colors.border, backgroundColor: ios ? 'transparent' : colors.card, shadowColor: colors.foreground }]}>
        {ios ? <BlurView intensity={90} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, styles.clip]} /> : null}
        <View accessibilityRole="tablist" style={styles.row} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {slot > 0 ? (
            <Animated.View pointerEvents="none" style={[styles.pillTrack, { width: slot }, pillStyle]}>
              <View style={[styles.pill, { backgroundColor: colors.muted }]} />
            </Animated.View>
          ) : null}
          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
            const focused = state.index === index;
            const onPress = () => {
              const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              // Active tabs intentionally do not navigate, preventing duplicate tab routes.
              if (!focused && !event.defaultPrevented) {
                if (!web) Haptics.selectionAsync().catch(() => {});
                navigateToTab(route.key);
              }
            };
            const onLongPress = () => emitter.emit({ type: 'tabLongPress', target: route.key });
            return (
              <TabItem key={route.key} label={label} icon={TAB_ICONS[route.name] ?? 'circle'} focused={focused}
                onPress={onPress} onLongPress={onLongPress} reduce={reduce}
                accessibilityLabel={options.tabBarAccessibilityLabel} testID={options.tabBarButtonTestID} />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  bar: { borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  clip: { borderRadius: 26, overflow: 'hidden' },
  row: { flexDirection: 'row', height: 64, paddingVertical: 0 },
  pillTrack: { position: 'absolute', top: 6, bottom: 6, left: 0, paddingHorizontal: 5 },
  pill: { flex: 1, borderRadius: 18 },
  item: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 10.5, letterSpacing: 0.1 },
  dot: { position: 'absolute', bottom: 7, width: 4, height: 4, borderRadius: 2 },
});
