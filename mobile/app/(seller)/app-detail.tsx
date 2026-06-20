import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { useState, useMemo } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../src/lib/api';

type ProductType = 'AKUN_READY' | 'MANUAL';

interface Duration {
  id: string;
  label: string;
  days: number;
  basePrice: number;
  productType: ProductType;
  buyerInfoLabel?: string;
  stockCount?: number;
}

interface AppDetail {
  id: string;
  template: { id: string; name: string; category?: { id: string; name: string; icon?: string } };
  notes?: string;
  durations: Duration[];
}

function getPrefix(label: string): string {
  const match = label.match(/^([A-Za-z]+)\s/);
  return match ? match[1] : 'Durasi';
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  AKUN_READY: 'Akun Ready',
  MANUAL: 'Manual',
};

function formatNumber(val: number | string): string {
  const num = typeof val === 'string' ? parseInt(String(val).replace(/\./g, '')) : val;
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString('id-ID');
}

function parseNumber(str: string): number {
  return parseInt(str.replace(/\./g, '')) || 0;
}

function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

export default function AppDetailScreen() {
  const { appId, appName } = useLocalSearchParams<{ appId: string; appName: string }>();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    label: '',
    days: '',
    basePrice: '',
    productType: 'AKUN_READY' as ProductType,
    buyerInfoLabel: '',
  });

  const { data: appDetail, isLoading } = useQuery<AppDetail>({
    queryKey: ['seller-app', appId],
    queryFn: () => api.get(`/seller/apps/${appId}`).then((r) => r.data),
  });

  const addDuration = useMutation({
    mutationFn: (data: {
      label: string;
      days: number;
      basePrice: number;
      productType: ProductType;
      buyerInfoLabel?: string;
    }) => api.post(`/seller/apps/${appId}/durations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-app', appId] });
      setShowAdd(false);
      setForm({ label: '', days: '', basePrice: '', productType: 'AKUN_READY', buyerInfoLabel: '' });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSubmit = () => {
    if (!form.label.trim()) {
      Alert.alert('Error', 'Label harus diisi');
      return;
    }
    if (!form.days || parseInt(form.days) <= 0) {
      Alert.alert('Error', 'Jumlah hari harus valid');
      return;
    }
    if (!form.basePrice || parseNumber(form.basePrice) <= 0) {
      Alert.alert('Error', 'Harga harus valid');
      return;
    }
    addDuration.mutate({
      label: form.label.trim(),
      days: parseInt(form.days),
      basePrice: parseNumber(form.basePrice),
      productType: form.productType,
      ...(form.productType === 'MANUAL' && form.buyerInfoLabel.trim()
        ? { buyerInfoLabel: form.buyerInfoLabel.trim() }
        : {}),
    });
  };

  const durations = appDetail?.durations ?? [];

  const sections = useMemo(() => {
    if (!durations.length) return [];
    const groups: Record<string, Duration[]> = {};
    durations.forEach((d) => {
      const prefix = getPrefix(d.label);
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(d);
    });
    return Object.entries(groups).map(([title, data]) => ({ title, data }));
  }, [durations]);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/(seller)/products')}>
        <Text style={styles.backBtnText}>← Kembali</Text>
      </TouchableOpacity>
      <Text style={styles.header}>{appName || appDetail?.template?.name || 'Detail Aplikasi'}</Text>

      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Durasi</Text>
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push({
                pathname: '/(seller)/add-account',
                params: {
                  durationId: item.id,
                  durationLabel: item.label,
                  productType: item.productType,
                  appId: appId!,
                  appName: appName || appDetail?.template?.name || '',
                },
              })
            }
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.label}</Text>
            </View>
            <Text style={styles.cardPrice}>{formatRupiah(item.basePrice)}</Text>
            <Text style={styles.cardMeta}>
              {item.days} hari | {item.stockCount ?? 0} stok
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada durasi'}</Text>
        }
      />

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Durasi</Text>

            <TextInput
              style={styles.input}
              placeholder='Label (contoh: "5 Hari", "1 Bulan")'
              value={form.label}
              onChangeText={(v) => setForm({ ...form, label: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Jumlah hari"
              value={form.days}
              onChangeText={(v) => setForm({ ...form, days: v })}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Harga dasar (Rupiah)"
              value={formatNumber(form.basePrice)}
              onChangeText={(v) => setForm({ ...form, basePrice: v.replace(/\./g, '') })}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Tipe Produk</Text>
            <View style={styles.typeRow}>
              {([['AKUN_READY', 'Akun Ready'], ['MANUAL', 'Manual']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.typeChip, form.productType === val && styles.typeChipSelected]}
                  onPress={() => setForm({ ...form, productType: val as ProductType })}
                >
                  <Text style={[styles.typeChipText, form.productType === val && styles.typeChipTextSelected]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {form.productType === 'MANUAL' && (
              <TextInput
                style={styles.input}
                placeholder="Apa yang harus dikirim pembeli?"
                value={form.buyerInfoLabel}
                onChangeText={(v) => setForm({ ...form, buyerInfoLabel: v })}
              />
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              disabled={addDuration.isPending}
            >
              <Text style={styles.buttonText}>
                {addDuration.isPending ? 'Menyimpan...' : 'Simpan'}
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
  backBtn: { marginBottom: 12 },
  backBtnText: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  addBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  sectionHeader: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  badge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: { fontSize: 11, color: '#3730a3', fontWeight: '600' },
  cardPrice: { fontSize: 14, color: '#2563eb', fontWeight: '600', marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '500' },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0' },
  typeChipSelected: { backgroundColor: '#2563eb' },
  typeChipText: { fontSize: 14, color: '#666' },
  typeChipTextSelected: { color: '#fff', fontWeight: '600' },
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
