import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  FlatList,
  SectionList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
  RefreshControl,
} from 'react-native';
import { useState, useCallback } from 'react';
import api from '../../src/lib/api';

interface PendingOrder {
  id: string;
  durationLabel?: string;
  appName?: string;
  buyerInfo?: string;
  productType?: string;
  createdAt: string;
}

interface ExpiredAccount {
  id: string;
  accessExpiresAt: string;
  duration?: {
    label: string;
    app: { template: { name: string } };
  };
  account?: {
    id: string;
  };
}

export default function PendingOrdersScreen() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [credentials, setCredentials] = useState('');

  const { data: orders, isLoading, refetch } = useQuery<PendingOrder[]>({
    queryKey: ['seller-pending-orders'],
    queryFn: () => api.get('/seller/pending-orders').then((r) => r.data),
  });

  const { data: expiredAccounts, refetch: refetchExpired } = useQuery<ExpiredAccount[]>({
    queryKey: ['seller-expired-accounts'],
    queryFn: () => api.get('/seller/expired-accounts').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchExpired()]);
    setRefreshing(false);
  }, [refetch, refetchExpired]);

  const fulfillOrder = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/seller/orders/${orderId}/fulfill`, { credentials }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-pending-orders'] });
      setSelectedOrder(null);
      setCredentials('');
      Alert.alert('Berhasil', 'Pesanan berhasil diproses');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleFulfill = () => {
    if (!credentials.trim()) {
      Alert.alert('Error', 'Kredensial harus diisi');
      return;
    }
    if (selectedOrder) {
      fulfillOrder.mutate(selectedOrder.id);
    }
  };

  return (
    <View style={styles.container}>
      <SectionList
        sections={([
          { title: 'Pesanan Menunggu', data: orders || [], type: 'pending' },
          { title: 'Akun Kadaluarsa', data: expiredAccounts || [], type: 'expired' },
        ] as any[]).filter((s: any) => s.data.length > 0)}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item, section }) => {
          if (section.type === 'expired') {
            const expired = item as unknown as ExpiredAccount;
            const appName = expired.duration?.app?.template?.name || '-';
            const durationLabel = expired.duration?.label || '-';
            const expiresDate = new Date(expired.accessExpiresAt).toLocaleDateString('id-ID', {
              day: 'numeric', month: 'short', year: 'numeric',
            });
            return (
              <View style={[styles.card, styles.expiredCard]}>
                <Text style={styles.cardTitle}>{appName}</Text>
                <Text style={styles.cardSub}>{durationLabel}</Text>
                <Text style={styles.expiredDate}>Kadaluarsa: {expiresDate}</Text>
              </View>
            );
          }
          const pending = item as unknown as PendingOrder;
          const createdDate = new Date(pending.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{pending.appName || 'Pesanan'}</Text>
              <Text style={styles.cardSub}>{pending.durationLabel || '-'}</Text>
              {pending.buyerInfo && (
                <View style={styles.buyerInfoBox}>
                  <Text style={styles.buyerInfoLabel}>Info Pembeli:</Text>
                  <Text style={styles.buyerInfoText}>{pending.buyerInfo}</Text>
                </View>
              )}
              <Text style={styles.cardDate}>{createdDate}</Text>
              <TouchableOpacity style={styles.processBtn} onPress={() => setSelectedOrder(pending)}>
                <Text style={styles.processBtnText}>Proses</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLoading ? 'Memuat...' : 'Tidak ada pesanan menunggu'}
          </Text>
        }
      />

      <Modal visible={!!selectedOrder} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Proses Pesanan</Text>
            {selectedOrder && (
              <>
                <Text style={styles.modalInfo}>
                  {selectedOrder.appName} - {selectedOrder.durationLabel}
                </Text>
                <TextInput
                  style={[styles.input, { height: 100 }]}
                  placeholder="Masukkan kredensial untuk pembeli"
                  value={credentials}
                  onChangeText={setCredentials}
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={styles.button}
                  onPress={handleFulfill}
                  disabled={fulfillOrder.isPending}
                >
                  <Text style={styles.buttonText}>
                    {fulfillOrder.isPending ? 'Memproses...' : 'Kirim Kredensial'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              onPress={() => {
                setSelectedOrder(null);
                setCredentials('');
              }}
            >
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
  },
  sectionHeader: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
  expiredCard: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  expiredDate: { fontSize: 12, color: '#ef4444', marginTop: 6, fontWeight: '500' },
  buyerInfoBox: {
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  buyerInfoLabel: { fontSize: 11, color: '#92400e', fontWeight: '600' },
  buyerInfoText: { fontSize: 13, color: '#78350f', marginTop: 2 },
  cardDate: { fontSize: 11, color: '#999', marginTop: 8 },
  processBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  processBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  modalInfo: { fontSize: 14, color: '#666', marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
