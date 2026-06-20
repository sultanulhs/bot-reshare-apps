import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useAuth } from '../src/lib/auth';
import { router } from 'expo-router';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    ownerName: '',
    storeName: '',
    phone: '',
  });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.ownerName || !form.storeName || !form.phone) {
      Alert.alert('Error', 'Semua field harus diisi');
      return;
    }
    if (form.password.length < 8) {
      Alert.alert('Error', 'Password minimal 8 karakter');
      return;
    }
    setLoading(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        ownerName: form.ownerName,
        storeName: form.storeName,
        phone: form.phone,
      });
      Alert.alert('Berhasil', 'Pendaftaran berhasil. Silakan login.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Daftar Penjual</Text>
      <TextInput style={styles.input} placeholder="Nama Pemilik Toko" value={form.ownerName}
        onChangeText={(v) => setForm({ ...form, ownerName: v })} />
      <TextInput style={styles.input} placeholder="Nama Toko" value={form.storeName}
        onChangeText={(v) => setForm({ ...form, storeName: v })} />
      <TextInput style={styles.input} placeholder="Email" value={form.email}
        onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="No HP" value={form.phone}
        onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
      <TextInput style={styles.input} placeholder="Password (min 8 karakter)" value={form.password}
        onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Daftar'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  container: { justifyContent: 'center', padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
