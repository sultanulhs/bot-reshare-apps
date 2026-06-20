import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const API_URL = 'http://192.168.1.3:3000/api';

export default function SubscriptionPaymentScreen() {
  const { verifyToken, planId } = useLocalSearchParams<{ verifyToken: string; planId?: string }>();
  const [qrContent, setQrContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!verifyToken || !planId) {
      setError('Data tidak lengkap');
      setLoading(false);
      return;
    }
    axios.post(`${API_URL}/auth/verify/subscription`, { verifyToken, planId })
      .then((res) => {
        setQrContent(res.data.qrContent);
      })
      .catch((err) => {
        setError(err.response?.data?.message || 'Gagal membuat pembayaran');
      })
      .finally(() => setLoading(false));
  }, [verifyToken, planId]);

  const handleDone = () => {
    Alert.alert('Pendaftaran selesai', 'Silakan login setelah pembayaran dikonfirmasi', [
      { text: 'OK', onPress: () => router.replace('/login') },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Membuat pembayaran...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
          <Text style={styles.buttonText}>Kembali ke Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pembayaran Langganan</Text>
      <Text style={styles.subtitle}>Scan QR untuk membayar langganan</Text>

      <View style={styles.qrBox}>
        <Text style={styles.qrContent} selectable>{qrContent}</Text>
      </View>
      <Text style={styles.hint}>Gunakan aplikasi bank/e-wallet untuk scan QR di atas</Text>

      <TouchableOpacity style={styles.button} onPress={handleDone}>
        <Text style={styles.buttonText}>Sudah Bayar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  qrBox: {
    backgroundColor: '#f5f5f5', borderRadius: 12, padding: 24, alignItems: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: '#ddd',
  },
  qrContent: { fontSize: 12, color: '#333', textAlign: 'center', fontFamily: 'monospace' },
  hint: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  loadingText: { textAlign: 'center', marginTop: 16, color: '#666' },
  errorText: { textAlign: 'center', color: '#ef4444', fontSize: 16, marginBottom: 16 },
});
