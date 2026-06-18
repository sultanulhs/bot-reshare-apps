import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import api from '../../src/lib/api';

export default function ProductsScreen() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: '', title: '', basePrice: '' });

  const { data: products, isLoading } = useQuery({
    queryKey: ['seller-products'],
    queryFn: () => api.get('/seller/products').then((r) => r.data),
  });

  const addProduct = useMutation({
    mutationFn: (data: any) => api.post('/seller/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      setShowAdd(false);
      setForm({ category: '', title: '', basePrice: '' });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Produk</Text>
      </TouchableOpacity>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/(seller)/add-stock', params: { productId: item.id, title: item.title } })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>{item.category} | Rp{item.basePrice.toLocaleString('id-ID')}</Text>
            <Text style={styles.cardStock}>
              Tersedia: {item.stockCount?.available ?? 0} | Terjual: {item.stockCount?.sold ?? 0}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{isLoading ? 'Loading...' : 'Belum ada produk'}</Text>}
      />

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Produk</Text>
            <TextInput style={styles.input} placeholder="Kategori" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
            <TextInput style={styles.input} placeholder="Judul" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
            <TextInput style={styles.input} placeholder="Harga (Rupiah)" value={form.basePrice} onChangeText={(v) => setForm({ ...form, basePrice: v })} keyboardType="numeric" />
            <TouchableOpacity style={styles.button} onPress={() => addProduct.mutate({ ...form, basePrice: parseInt(form.basePrice) || 0 })}>
              <Text style={styles.buttonText}>Simpan</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={styles.cancel}>Batal</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
  cardStock: { fontSize: 12, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
