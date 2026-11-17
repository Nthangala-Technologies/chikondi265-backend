import './safe-area.css';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { createClient } from '@ably/pubsub-device';
import {
  ActivityIndicator,
  AppState,
  Platform,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import {
  Stack,
  useGlobalSearchParams,
  usePathname,
  useRouter,
  type Href,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  setApiDebugLogging,
  setAuthTokenGetter,
  setBaseUrl,
} from '@workspace/api-client-react';
import { AppProvider } from '@/components/AppProvider';
import { AuthProvider, getStoredSessionToken, useAuth } from '@/components/AuthProvider';
import { ErrorModalProvider } from '@/components/ErrorModal';
import { API_BASE_URL } from '@/constants/config';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
    },
  },
});
const lastRouteStoragePrefix = 'kupeza.navigation.last-route:';

function isRestorableRoute(path: string | null): path is string {
  if (!path || path === '/' || path.startsWith('//')) return false;
  return /^\/(likes|matches|messages|profile|discover|chat|notifications|filters|profile-edit|profile-photos|settings|payment-history|password-change|safety|report)(\/|$)/.test(
    path,
  );
}

setBaseUrl(API_BASE_URL);
setApiDebugLogging(__DEV__);
setAuthTokenGetter(getStoredSessionToken);

async function logApiReachability() {
  if (!__DEV__) return;
  if (!API_BASE_URL) {
    console.error('[API diagnostics] No API base URL is configured.');
    return;
  }

  console.info('[API diagnostics] Backend base URL:', API_BASE_URL);

  for (const endpoint of ['/api/healthz', '/api/readyz']) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const body = (await response.text()).slice(0, 500);
      console.info('[API diagnostics] Reachability probe:', {
        endpoint,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
        contentType: response.headers.get('content-type'),
        requestId:
          response.headers.get('x-request-id') ??
          response.headers.get('request-id'),
        body,
      });
    } catch (error) {
      console.error('[API diagnostics] Reachability probe failed:', {
        endpoint,
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function RootLayoutNav() {
  const { status, account } = useAuth();
  const pathname = usePathname();
  const launchPath = useRef(pathname);
  const params = useGlobalSearchParams();
  const router = useRouter();
  const routeKey = JSON.stringify([pathname, params]);
  const previousRouteKey = useRef<string | null>(null);
  const [routeRestoreUserId, setRouteRestoreUserId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;

    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (nextState) => {
      focusManager.setFocused(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const previous = previousRouteKey.current;
    previousRouteKey.current = routeKey;
    if (!previous || previous === routeKey || status !== 'signed-in') return;

    void queryClient.invalidateQueries(
      { refetchType: 'active' },
      { cancelRefetch: false },
    );
  }, [routeKey, status]);

  useEffect(() => {
    const userId = status === 'signed-in' ? account?.userId : null;
    if (!userId) {
      setRouteRestoreUserId(null);
      return;
    }

    let active = true;
    setRouteRestoreUserId(null);
    void AsyncStorage.getItem(`${lastRouteStoragePrefix}${userId}`)
      .then((savedPath) => {
        if (
          !active ||
          launchPath.current !== '/' ||
          !isRestorableRoute(savedPath)
        ) return;
        router.replace(savedPath as Href);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setRouteRestoreUserId(userId);
      });

    return () => {
      active = false;
    };
  }, [account?.userId, router, status]);

  useEffect(() => {
    const userId = account?.userId;
    if (
      status !== 'signed-in' ||
      !userId ||
      routeRestoreUserId !== userId ||
      !isRestorableRoute(pathname)
    ) {
      return;
    }
    void AsyncStorage.setItem(
      `${lastRouteStoragePrefix}${userId}`,
      pathname,
    ).catch(() => undefined);
  }, [account?.userId, pathname, routeRestoreUserId, status]);

  useEffect(() => {
    if (status !== 'signed-in') return;

    let active = true;
    let client: ReturnType<typeof createClient> | null = null;
    let subscribedChannel: string | null = null;
    const onDataUpdated = () => {
      void queryClient.invalidateQueries(
        { refetchType: 'active' },
        { cancelRefetch: false },
      );
    };
    const subscribeToOwnChannel = () => {
      if (!client || subscribedChannel) return;
      const userId = client.auth.clientId;
      if (typeof userId !== 'string' || userId.length === 0) return;

      subscribedChannel = `user:${userId}`;
      client.channels
        .get(subscribedChannel)
        .subscribe('data-updated', onDataUpdated);
    };

    void (async () => {
      const token = await getStoredSessionToken();
      if (!active || !token) return;

      client = createClient({
        authCallback: async (_tokenParams, callback) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10_000);
          try {
            const currentToken = await getStoredSessionToken();
            if (!currentToken) throw new Error('Sign in to enable realtime updates.');
            // Ably's authUrl XHR enables withCredentials for Authorization
            // headers. This bearer-only API does not accept browser cookies.
            const response = await fetch(`${API_BASE_URL}/api/v1/realtime/token`, {
              method: 'POST',
              credentials: 'omit',
              headers: {
                Authorization: `Bearer ${currentToken}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: '{}',
              signal: controller.signal,
            });
            if (!response.ok) {
              throw new Error(`Realtime authorization failed (HTTP ${response.status}).`);
            }
            callback(null, await response.json());
          } catch (error) {
            callback(
              error instanceof Error ? error.message : 'Realtime authorization failed.',
              null,
            );
          } finally {
            clearTimeout(timeout);
          }
        },
      });
      client.connection.on('connected', subscribeToOwnChannel);
      if (client.connection.state === 'connected') subscribeToOwnChannel();
    })().catch((error: unknown) => {
      if (__DEV__ && active) {
        console.warn('[realtime] Connection setup failed', {
          errorName: error instanceof Error ? error.name : 'UnknownError',
        });
      }
    });

    return () => {
      active = false;
      if (client && subscribedChannel) {
        client.channels
          .get(subscribedChannel)
          .unsubscribe('data-updated', onDataUpdated);
      }
      client?.close();
    };
  }, [status]);

  if (status === 'checking') {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View>;
  }
  const signedIn = status === 'signed-in';

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShown: false,
        animation: 'slide_from_right',
        animationDuration: 280,
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="index" options={{ animation: 'fade', animationDuration: 220 }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen
          name="discover/[id]"
          options={{
            presentation: 'transparentModal',
            animation: 'none',
            contentStyle: { backgroundColor: 'transparent' },
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="chat/[matchId]"
          options={{
            presentation: 'card',
            animation: 'slide_from_right',
            animationDuration: 260,
            fullScreenGestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.72, 1],
            sheetGrabberVisible: true,
            animationDuration: 300,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="filters"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.72, 1],
            sheetGrabberVisible: true,
            animationDuration: 300,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="profile-edit"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.62, 1],
            sheetGrabberVisible: true,
            animationDuration: 300,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen name="profile-photos" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="payment-history" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen
          name="password-change"
          options={{ presentation: 'card', animation: 'slide_from_right' }}
        />
        <Stack.Screen
          name="safety"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.72, 1],
            sheetGrabberVisible: true,
            animationDuration: 300,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
        <Stack.Screen
          name="report"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.62, 1],
            sheetGrabberVisible: true,
            animationDuration: 300,
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void logApiReachability();
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return <SafeAreaProvider><StatusBar style="dark" /><ErrorBoundary><QueryClientProvider client={queryClient}><GestureHandlerRootView style={{ flex: 1 }}><KeyboardProvider><AuthProvider><AppProvider><ErrorModalProvider><RootLayoutNav /></ErrorModalProvider></AppProvider></AuthProvider></KeyboardProvider></GestureHandlerRootView></QueryClientProvider></ErrorBoundary></SafeAreaProvider>;
}
