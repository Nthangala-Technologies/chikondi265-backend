import { Feather } from '@expo/vector-icons';
import { useGetCurrentUserPaymentHistory } from '@workspace/api-client-react';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Header, Shell } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

function statusLabel(status: string) {
  if (status === 'succeeded') return 'Paid';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function PaymentHistoryScreen() {
  const colors = useColors();
  const historyQuery = useGetCurrentUserPaymentHistory();
  const items = historyQuery.data?.items ?? [];

  return (
    <Shell>
      <Header title="Payment history" back />
      <Text style={[styles.intro, { color: colors.mutedForeground }]}>
        Your chat unlock payments and their latest status.
      </Text>

      {historyQuery.isPending ? (
        <View style={styles.state}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Loading payment history…
          </Text>
        </View>
      ) : historyQuery.isError ? (
        <View style={styles.state}>
          <Feather name="wifi-off" size={22} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            We couldn’t load your payments.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void historyQuery.refetch()}
            style={[styles.retry, { backgroundColor: colors.secondary }]}
            testID="payment-history-retry"
          >
            <Text style={[styles.retryText, { color: colors.secondaryForeground }]}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.state}>
          <Feather name="credit-card" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            No payments yet
          </Text>
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            Completed and pending chat unlock payments will appear here.
          </Text>
        </View>
      ) : (
        <View testID="payment-history-list">
          {items.map((item) => (
            <View
              key={item.id}
              style={[
                styles.transaction,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              testID={`payment-history-entry-${item.id}`}
            >
              <View style={styles.transactionTop}>
                <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
                  <Feather
                    name="credit-card"
                    size={18}
                    color={colors.secondaryForeground}
                  />
                </View>
                <View style={styles.description}>
                  <Text style={[styles.title, { color: colors.foreground }]}>
                    {item.description}
                  </Text>
                  <Text style={[styles.provider, { color: colors.mutedForeground }]}>
                    {item.provider === 'paychangu' ? 'PayChangu' : item.provider}
                  </Text>
                </View>
                <Text style={[styles.status, { color: colors.primary }]}>
                  {statusLabel(item.status)}
                </Text>
              </View>

              <View style={styles.amountRow}>
                <Text style={[styles.amount, { color: colors.foreground }]}>
                  {item.currency} {item.amountMwk.toLocaleString()}
                </Text>
                <Text style={[styles.date, { color: colors.mutedForeground }]}>
                  {formatDate(item.createdAt)}
                </Text>
              </View>
              <Text style={[styles.reference, { color: colors.mutedForeground }]}>
                Reference: {item.reference}
              </Text>
              {item.completedAt ? (
                <Text style={[styles.reference, { color: colors.mutedForeground }]}>
                  Completed: {formatDate(item.completedAt)}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  state: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  retry: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12 },
  retryText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  transaction: {
    borderWidth: 1,
    borderRadius: 17,
    padding: 14,
    marginBottom: 11,
  },
  transactionTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  description: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  provider: { fontSize: 12, marginTop: 4 },
  status: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  amount: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  date: { fontSize: 12 },
  reference: { fontSize: 11, marginTop: 7 },
});
