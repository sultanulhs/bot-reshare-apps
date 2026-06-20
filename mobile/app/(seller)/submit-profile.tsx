import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/lib/api';

export default function SubmitProfileScreen() {
  const [payoutAccount, setPayoutAccount] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!payoutAccount.trim()) {
      Alert.alert('Error', 'Rekening pencairan harus diisi');
      return;
    }
    setLoading(true);
    try {
      await api.post('/seller/profile', { payoutAccount });
      Alert.alert('Berhasil', 'Profil terkirim, menunggu verifikasi admin', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lengkapi Profil Pembayaran</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Rekening Pencairan</Text>
        <TextInput
          style={styles.input}
          placeholder="Contoh: BCA 1234567890 a.n. Nama"
          value={payoutAccount}
          onChangeText={setPayoutAccount}
        />
        <Text style={styles.note}>Data akan dienkripsi dan aman</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Kirim'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 8 },
  note: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
