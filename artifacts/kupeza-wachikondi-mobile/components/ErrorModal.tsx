import { Feather } from '@expo/vector-icons';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

type ErrorModalContextValue = {
  showError: (message: string, title?: string) => void;
};

const ErrorModalContext = createContext<ErrorModalContextValue | null>(null);

type ErrorModalProps = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
};

function ErrorModal({ visible, title, message, onClose }: ErrorModalProps) {
  const colors = useColors();
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: visible ? 190 : 140,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: visible ? 1 : 0.96,
        duration: visible ? 190 : 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [opacity, scale, visible]);

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={mounted}
    >
      <Animated.View style={[styles.scrim, { opacity }]}>
        <Pressable
          accessibilityLabel="Dismiss error"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          accessibilityRole="alert"
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: `${colors.destructive}33`,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.icon}>
            <Feather name="alert-circle" size={24} color={colors.destructive} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.mutedForeground }]}>
            {message}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.button, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.buttonLabel}>Got it</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function ErrorModalProvider({ children }: React.PropsWithChildren) {
  const [error, setError] = useState<{
    title: string;
    message: string;
  } | null>(null);
  const showError = useCallback((message: string, title = 'Oops, something went wrong') => {
    setError({ title, message });
  }, []);
  const close = useCallback(() => setError(null), []);
  const value = useMemo(() => ({ showError }), [showError]);

  return (
    <ErrorModalContext.Provider value={value}>
      {children}
      <ErrorModal
        visible={Boolean(error)}
        title={error?.title ?? 'Oops, something went wrong'}
        message={error?.message ?? ''}
        onClose={close}
      />
    </ErrorModalContext.Provider>
  );
}

export function useErrorModal(): ErrorModalContextValue {
  const context = useContext(ErrorModalContext);
  if (!context) {
    throw new Error('useErrorModal must be used within ErrorModalProvider.');
  }
  return context;
}

export function friendlyApiError(error: unknown, fallback: string): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (/UNAUTHENTICATED|unauthorized|HTTP 401/i.test(message)) {
    return 'Please log in again to continue.';
  }
  if (/fetch failed|network request failed|network error|offline/i.test(message)) {
    return 'Check your internet connection and try again.';
  }
  return fallback;
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(36, 19, 27, 0.42)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    shadowColor: '#2d2332',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0ef',
    marginBottom: 15,
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 9,
  },
  button: {
    alignSelf: 'stretch',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginTop: 22,
  },
  buttonLabel: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
  },
});
