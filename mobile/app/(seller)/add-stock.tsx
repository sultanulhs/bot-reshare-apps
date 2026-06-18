import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import api from '../../src/lib/api';

export default function AddStockScreen() {
  const { productId, title } = useLocalSearchParams<{ productId: string; title: string }>();
  const [credentials, setCredentials] = useState('');

  const addStock = useMutation({
    mutationFn: () => api.post(`/seller/products/${productId}/stock`, { credentials }),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Stok berhasil ditambahkan', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCredentials('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tambah Stok</Text>
      <Text style={styles.subtitle}>{title}</Text>
      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder="Kredensial (email:password atau format lain)"
        value={credentials}
        onChangeText={setCredentials}
        multiline
      />
      <Text style={styles.note}>Kredensial akan dienkripsi dan tidak bisa dilihat kembali.</Text>
      <TouchableOpacity style={styles.button} onPress={() => addStock.mutate()} disabled={!credentials || addStock.isPending}>
        <Text style={styles.buttonText}>{addStock.isPending ? 'Menyimpan...' : 'Simpan Stok'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 8, textAlignVertical: 'top' },
  note: { fontSize: 12, color: '#999', marginBottom: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
