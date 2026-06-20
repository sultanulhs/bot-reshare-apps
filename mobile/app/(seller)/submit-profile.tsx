import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import api from '../../src/lib/api';

const BANKS = ['BCA', 'BNI', 'BRI', 'Mandiri', 'BSI', 'CIMB Niaga', 'Danamon', 'Permata', 'OCBC NISP', 'BTN', 'Mega', 'Lainnya'];

export default function SubmitProfileScreen() {
  const queryClient = useQueryClient();
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!bankName.trim() || !accountNumber.trim() || !accountHolder.trim()) {
      Alert.alert('Error', 'Semua field harus diisi');
      return;
    }
    setLoading(true);
    try {
      await api.post('/seller/profile', { bankName, accountNumber, accountHolder });
      queryClient.invalidateQueries({ queryKey: ['seller-me'] });
      Alert.alert('Berhasil', 'Profil terkirim, menunggu verifikasi admin', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Rekening Pencairan</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Nama Bank</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
          {BANKS.map((bank) => (
            <TouchableOpacity
              key={bank}
              style={[styles.bankChip, bankName === bank && styles.bankChipSelected]}
              onPress={() => setBankName(bank)}
            >
              <Text style={[styles.bankChipText, bankName === bank && styles.bankChipTextSelected]}>
                {bank}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Nomor Rekening</Text>
        <TextInput
          style={styles.input}
          placeholder="Contoh: 1234567890"
          value={accountNumber}
          onChangeText={setAccountNumber}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Nama Pemilik Rekening</Text>
        <TextInput
          style={styles.input}
          placeholder="Sesuai buku tabungan"
          value={accountHolder}
          onChangeText={setAccountHolder}
          autoCapitalize="words"
        />

        <Text style={styles.note}>Data akan dienkripsi dan aman. Pastikan nama sesuai dengan buku tabungan.</Text>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Mengirim...' : 'Kirim'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  note: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bankScroll: { marginBottom: 8 },
  bankChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  bankChipSelected: { backgroundColor: '#2563eb' },
  bankChipText: { fontSize: 14, color: '#666' },
  bankChipTextSelected: { color: '#fff', fontWeight: '600' },
});
