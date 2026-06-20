import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, ScrollView } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import api from '../../src/lib/api';

interface Category {
  id: string;
  name: string;
  icon?: string;
  isDefault?: boolean;
}

interface App {
  id: string;
  name: string;
  categoryId: string;
  category?: { name: string };
  description?: string;
  active: boolean;
  _count?: { durations: number };
  stockCount?: number;
}

export default function ProductsScreen() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ categoryId: '', name: '', description: '' });

  const { data: apps, isLoading } = useQuery<App[]>({
    queryKey: ['seller-apps'],
    queryFn: () => api.get('/seller/apps').then((r) => r.data),
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['seller-categories'],
    queryFn: () => api.get('/seller/categories').then((r) => r.data),
    enabled: showAdd,
  });

  const addApp = useMutation({
    mutationFn: (data: { categoryId: string; name: string; description?: string }) =>
      api.post('/seller/apps', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-apps'] });
      setShowAdd(false);
      setForm({ categoryId: '', name: '', description: '' });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSubmit = () => {
    if (!form.categoryId) {
      Alert.alert('Error', 'Pilih kategori terlebih dahulu');
      return;
    }
    if (!form.name.trim()) {
      Alert.alert('Error', 'Nama aplikasi harus diisi');
      return;
    }
    addApp.mutate({
      categoryId: form.categoryId,
      name: form.name.trim(),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Aplikasi</Text>
      </TouchableOpacity>

      <FlatList
        data={apps}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const categoryName = item.category?.name || '-';
          const durationCount = item._count?.durations ?? 0;
          const stockCount = item.stockCount ?? 0;
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/(seller)/app-detail',
                  params: { appId: item.id, appName: item.name },
                })
              }
            >
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSub}>{categoryName}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardMeta}>{durationCount} durasi</Text>
                <Text style={styles.cardMeta}>{stockCount} stok</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada aplikasi'}</Text>
        }
      />

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Aplikasi</Text>

            <Text style={styles.label}>Kategori</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
              {categories?.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, form.categoryId === cat.id && styles.chipSelected]}
                  onPress={() => setForm({ ...form, categoryId: cat.id })}
                >
                  <Text style={[styles.chipText, form.categoryId === cat.id && styles.chipTextSelected]}>
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TextInput
              style={styles.input}
              placeholder="Nama aplikasi"
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Deskripsi (opsional)"
              value={form.description}
              onChangeText={(v) => setForm({ ...form, description: v })}
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              disabled={addApp.isPending}
            >
              <Text style={styles.buttonText}>
                {addApp.isPending ? 'Menyimpan...' : 'Simpan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
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
  addBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
  cardRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '500' },
  chipScroll: { marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  chipSelected: { backgroundColor: '#2563eb' },
  chipText: { fontSize: 14, color: '#666' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
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
