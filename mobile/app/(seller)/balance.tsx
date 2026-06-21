import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import api from '../../src/lib/api';

export default function BalanceScreen() {
  const queryClient = useQueryClient();

  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.get('/seller/balance').then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ['seller-sales'],
    queryFn: () => api.get('/seller/sales').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['seller-balance'] }),
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>Saldo Tersedia</Text>
        <Text style={styles.amount}>Rp{(balance?.available ?? 0).toLocaleString('id-ID')}</Text>
        <Text style={styles.note}>Pencairan manual (hubungi admin)</Text>
      </View>

      <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
      <FlatList
        data={sales}
        keyExtractor={(item: any) => item.orderId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }: { item: any }) => {
          const statusColors: Record<string, string> = {
            FULFILLED: '#16a34a', PENDING: '#f59e0b', WAITING_SELLER: '#f59e0b',
            EXPIRED: '#ef4444', FAILED: '#ef4444', PAID: '#3b82f6',
          };
          const statusColor = statusColors[item.status] || '#999';
          const buyerLabel = item.buyerName
            ? `${item.buyerName}${item.buyerUsername ? ` (@${item.buyerUsername})` : ''}`
            : item.buyerUsername ? `@${item.buyerUsername}` : `@${item.buyerTgUserId}`;
          const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.productTitle}{item.durationLabel ? ` — ${item.durationLabel}` : ''}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.cardBuyer}>👤 {buyerLabel}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.priceDetail}>Harga Rp{item.basePrice.toLocaleString('id-ID')}</Text>
                <Text style={styles.priceDetail}> + Markup Rp{item.markup.toLocaleString('id-ID')}</Text>
                <Text style={styles.priceTotal}> = Rp{item.totalAmount.toLocaleString('id-ID')}</Text>
              </View>
              <Text style={styles.cardDate}>📅 Pesan: {fmtDate(item.createdAt)}</Text>
              {item.fulfilledAt && <Text style={styles.cardDate}>✅ Selesai: {fmtDate(item.fulfilledAt)}</Text>}
              {item.accessExpiresAt && <Text style={styles.cardDate}>⏰ Berlaku s/d: {fmtDate(item.accessExpiresAt)}</Text>}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada transaksi</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  balanceCard: { backgroundColor: '#2563eb', borderRadius: 12, padding: 24, marginBottom: 24 },
  label: { color: '#ddd', fontSize: 14 },
  amount: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  note: { color: '#bbb', fontSize: 12, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardBuyer: { fontSize: 12, color: '#555', marginBottom: 4 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  priceDetail: { fontSize: 12, color: '#888' },
  priceTotal: { fontSize: 12, fontWeight: '600', color: '#111' },
  cardDate: { fontSize: 11, color: '#999', marginTop: 1 },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});
