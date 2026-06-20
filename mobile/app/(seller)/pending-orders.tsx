import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useState } from 'react';
import api from '../../src/lib/api';

interface PendingOrder {
  id: string;
  durationLabel?: string;
  appName?: string;
  buyerInfo?: string;
  productType?: string;
  createdAt: string;
}

export default function PendingOrdersScreen() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [credentials, setCredentials] = useState('');

  const { data: orders, isLoading } = useQuery<PendingOrder[]>({
    queryKey: ['seller-pending-orders'],
    queryFn: () => api.get('/seller/pending-orders').then((r) => r.data),
  });

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
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const createdDate = new Date(item.createdAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.appName || 'Pesanan'}</Text>
              <Text style={styles.cardSub}>{item.durationLabel || '-'}</Text>
              {item.buyerInfo && (
                <View style={styles.buyerInfoBox}>
                  <Text style={styles.buyerInfoLabel}>Info Pembeli:</Text>
                  <Text style={styles.buyerInfoText}>{item.buyerInfo}</Text>
                </View>
              )}
              <Text style={styles.cardDate}>{createdDate}</Text>
              <TouchableOpacity style={styles.processBtn} onPress={() => setSelectedOrder(item)}>
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
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
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
