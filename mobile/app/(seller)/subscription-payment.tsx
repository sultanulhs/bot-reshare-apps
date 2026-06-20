import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-native-qrcode-svg';
import api from '../../src/lib/api';

export default function SubscriptionPaymentScreen() {
  const { planId, planName } = useLocalSearchParams<{ planId: string; planName: string }>();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [qrContent, setQrContent] = useState('');
  const [refNo, setRefNo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!planId) return;
    (async () => {
      try {
        const { data } = await api.post('/seller/subscription/checkout', { planId });
        setQrContent(data.qrContent);
        setRefNo(data.partnerReferenceNo);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Gagal membuat pembayaran');
      }
      setLoading(false);
    })();
  }, [planId]);

  const handleDone = () => {
    queryClient.invalidateQueries({ queryKey: ['seller-subscription'] });
    Alert.alert('Info', 'Setelah pembayaran berhasil, status langganan akan otomatis aktif.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Membuat pembayaran...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pembayaran Langganan</Text>
      <Text style={styles.planName}>{planName}</Text>

      <View style={styles.qrContainer}>
        <QRCode value={qrContent} size={250} />
      </View>

      <Text style={styles.instruction}>Scan QR di atas menggunakan aplikasi DANA untuk membayar</Text>

      <View style={styles.refContainer}>
        <Text style={styles.refLabel}>Referensi:</Text>
        <Text style={styles.refValue} selectable>{refNo}</Text>
      </View>

      <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
        <Text style={styles.doneButtonText}>Sudah Bayar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff', alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  planName: { fontSize: 16, color: '#2563eb', marginBottom: 24 },
  qrContainer: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    marginBottom: 24,
  },
  instruction: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24, paddingHorizontal: 16 },
  refContainer: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, width: '100%', marginBottom: 24 },
  refLabel: { fontSize: 12, color: '#999' },
  refValue: { fontSize: 13, color: '#333', marginTop: 2 },
  doneButton: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, width: '100%', alignItems: 'center' },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loadingText: { marginTop: 12, color: '#666' },
  errorText: { color: '#ef4444', fontSize: 16, marginBottom: 16 },
  backButton: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, paddingHorizontal: 24 },
  backButtonText: { color: '#fff', fontWeight: '600' },
});
