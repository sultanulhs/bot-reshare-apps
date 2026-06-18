import { useQuery } from '@tanstack/react-query';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import api from '../../src/lib/api';

export default function BalanceScreen() {
  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.get('/seller/balance').then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ['seller-sales'],
    queryFn: () => api.get('/seller/sales').then((r) => r.data),
  });

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>Saldo Tersedia</Text>
        <Text style={styles.amount}>Rp{(balance?.available ?? 0).toLocaleString('id-ID')}</Text>
        <Text style={styles.note}>Pencairan manual (hubungi admin)</Text>
      </View>

      <Text style={styles.sectionTitle}>Riwayat Penjualan</Text>
      <FlatList
        data={sales}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.productTitle}</Text>
            <Text style={styles.rowAmount}>+Rp{item.amount.toLocaleString('id-ID')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada penjualan</Text>}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 4 },
  rowTitle: { fontSize: 14 },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});
