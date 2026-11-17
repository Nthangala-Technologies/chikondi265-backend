import { Feather } from '@expo/vector-icons';
import {
  getGetConnectionQueryKey,
  getGetConnectionsQueryKey,
  getConnection,
  useCreatePaymentIntent,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';

type Props = {
  connectionId: string;
  chatEnabled: boolean;
  onOpenChat?: () => void;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
};

export function UnlockChatButton({
  connectionId,
  chatEnabled,
  onOpenChat,
  disabled = false,
  compact = false,
  testID,
}: Props) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const paymentIntent = useCreatePaymentIntent();
  const [openingCheckout, setOpeningCheckout] = useState(false);

  const refreshConnections = React.useCallback(
    async () => {
      const connection = await getConnection(connectionId);
      queryClient.setQueryData(
        getGetConnectionQueryKey(connectionId),
        connection,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetConnectionsQueryKey(),
        }),
        queryClient.invalidateQueries({
          queryKey: getGetConnectionQueryKey(connectionId),
          exact: true,
        }),
      ]);
      return connection;
    },
    [connectionId, queryClient],
  );

  const handlePress = async () => {
    if (disabled || openingCheckout) return;
    if (chatEnabled) {
      onOpenChat?.();
      return;
    }

    setOpeningCheckout(true);
    try {
      const result = await paymentIntent.mutateAsync({
        id: connectionId,
        data: {},
      });
      const rawCheckoutUrl = result.checkoutUrl.trim();
      const secureCheckoutUrl = /^https?:\/\//i.test(rawCheckoutUrl)
        ? rawCheckoutUrl
        : `https://${rawCheckoutUrl.replace(/^\/+/, '')}`;
      const checkoutUrl = new URL(secureCheckoutUrl);
      if (
        !['https:', 'http:'].includes(checkoutUrl.protocol) ||
        checkoutUrl.hostname !== 'checkout.paychangu.com'
      ) {
        throw new Error('The checkout link is not secure.');
      }
      if (checkoutUrl.protocol === 'http:') {
        console.warn(
          '[payments] PayChangu returned an HTTP checkout URL; continuing with the sandbox link.',
          { origin: checkoutUrl.origin, path: checkoutUrl.pathname },
        );
      }
      console.info('[payments] Opening PayChangu checkout', {
        origin: checkoutUrl.origin,
        path: checkoutUrl.pathname,
        hasQuery: checkoutUrl.search.length > 0,
      });
      await WebBrowser.openBrowserAsync(checkoutUrl.toString());
      await refreshConnections();
    } catch (error) {
      Alert.alert(
        'Unable to unlock chat',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setOpeningCheckout(false);
    }
  };

  const buttonDisabled =
    disabled || openingCheckout || (chatEnabled && !onOpenChat);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        chatEnabled ? 'Open chat' : 'Unlock chat for 5,000 kwacha'
      }
      accessibilityState={{ disabled: buttonDisabled, busy: openingCheckout }}
      disabled={buttonDisabled}
      onPress={() => void handlePress()}
      style={[
        styles.button,
        compact && styles.compact,
        {
          backgroundColor: colors.primary,
          opacity: buttonDisabled ? 0.55 : 1,
        },
      ]}
      testID={testID ?? `unlock-chat-${connectionId}`}
    >
      {openingCheckout ? (
        <ActivityIndicator color="#fff" size="small" />
      ) : (
        <Feather
          name={chatEnabled ? 'message-circle' : 'lock'}
          size={compact ? 15 : 18}
          color="#fff"
        />
      )}
      <Text style={[styles.label, compact && styles.compactLabel]}>
        {openingCheckout
          ? 'Opening checkout…'
          : chatEnabled
            ? 'Open chat'
            : 'Unlock chat — MWK 5,000'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  compact: {
    maxWidth: 150,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  label: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    textAlign: 'center',
  },
  compactLabel: {
    fontSize: 11,
  },
});
