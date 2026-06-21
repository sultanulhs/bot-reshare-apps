import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, StyleSheet, RefreshControl, ScrollView, TouchableOpacity } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import api from '../../src/lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export default function BalanceScreen() {
  const queryClient = useQueryClient();
  const now = new Date();

  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.get('/seller/balance').then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ['seller-sales'],
    queryFn: () => api.get('/seller/sales').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['seller-balance'] }),
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s: any) => {
      const d = new Date(s.createdAt);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
  }, [sales, selectedMonth, selectedYear]);

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>Saldo Tersedia</Text>
        <Text style={styles.amount}>Rp{(balance?.available ?? 0).toLocaleString('id-ID')}</Text>
        <Text style={styles.note}>Pencairan manual (hubungi admin)</Text>
      </View>

      {/* Header: title + year picker inline */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
        <View style={styles.yearPicker}>
          <TouchableOpacity onPress={() => setSelectedYear(y => y - 1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.yearText}>{selectedYear}</Text>
          <TouchableOpacity onPress={() => setSelectedYear(y => Math.min(y + 1, new Date().getFullYear()))} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Month filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {MONTHS.map((m, i) => (
          <TouchableOpacity key={i} onPress={() => setSelectedMonth(i)}
            style={[styles.monthChip, selectedMonth === i && styles.monthChipActive]}>
            <Text style={[styles.monthChipText, selectedMonth === i && styles.monthChipTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filteredSales}
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
              <Text style={styles.priceTotal}>💰 Rp{item.totalAmount.toLocaleString('id-ID')}</Text>
              <Text style={styles.cardDate}>📅 Pesan: {fmtDate(item.createdAt)}</Text>
              {(item.status === 'PENDING' || item.status === 'EXPIRED') && item.expiresAt && (
                <Text style={styles.cardDate}>{item.status === 'PENDING' ? '⏰' : '❌'} {item.status === 'PENDING' ? 'Batas bayar' : 'Expired'}: {fmtDate(item.expiresAt)}</Text>
              )}
              {item.fulfilledAt && <Text style={styles.cardDate}>✅ Selesai: {fmtDate(item.fulfilledAt)}</Text>}
              {item.accessExpiresAt && item.status === 'FULFILLED' && (
                <Text style={styles.cardDate}>⏰ Berlaku s/d: {fmtDate(item.accessExpiresAt)}</Text>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada transaksi di {MONTHS[selectedMonth]} {selectedYear}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  balanceCard: { backgroundColor: '#2563eb', borderRadius: 12, padding: 24, marginBottom: 16 },
  label: { color: '#ddd', fontSize: 14 },
  amount: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  note: { color: '#bbb', fontSize: 12, marginTop: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  yearPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, elevation: 1 },
  yearArrow: { paddingHorizontal: 10, paddingVertical: 4 },
  yearArrowText: { fontSize: 16, fontWeight: '700', color: '#2563eb' },
  yearText: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginHorizontal: 4 },
  filterRow: { flexDirection: 'row', marginBottom: 10, flexGrow: 0 },
  monthChip: { backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, minWidth: 48, alignItems: 'center' as const },
  monthChipActive: { backgroundColor: '#2563eb' },
  monthChipText: { fontSize: 15, color: '#1e293b', fontWeight: '600' },
  monthChipTextActive: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardBuyer: { fontSize: 12, color: '#555', marginBottom: 4 },
  priceTotal: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardDate: { fontSize: 11, color: '#999', marginTop: 1 },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});
