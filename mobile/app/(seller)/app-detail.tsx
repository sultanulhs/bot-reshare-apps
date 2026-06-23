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
  BackHandler,
  RefreshControl,
  Switch,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../src/lib/api';

type ProductType = 'AKUN_READY' | 'MANUAL';

interface Duration {
  id: string;
  label: string;
  days: number;
  basePrice: number;
  productType: ProductType;
  buyerInfoLabel?: string;
  manualStock?: number | null;
  accountCount?: number;
  stockAvailable?: number;
  stockLocked?: number;
  stockSold?: number;
  expiredCount?: number;
  pendingWarrantyCount?: number;
  loginReportCount?: number;
  totalLoginReportCount?: number;
  needsRepairCount?: number;
  waitingSellerCount?: number;
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
    manualStockUnlimited: true,
    manualStock: '',
  });
  const [editingDuration, setEditingDuration] = useState<Duration | null>(null);
  const [editForm, setEditForm] = useState({
    label: '',
    days: '',
    basePrice: '',
    productType: 'AKUN_READY' as ProductType,
    buyerInfoLabel: '',
    manualStockUnlimited: true,
    manualStock: '',
  });

  const { data: appDetail, isLoading, refetch } = useQuery<AppDetail>({
    queryKey: ['seller-app', appId],
    queryFn: () => api.get(`/seller/apps/${appId}`).then((r) => r.data),
  });

  const handleBack = useCallback(() => {
    router.push('/(seller)/products');
  }, []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
      setForm({ label: '', days: '', basePrice: '', productType: 'AKUN_READY', buyerInfoLabel: '', manualStockUnlimited: true, manualStock: '' });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const updateDuration = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.patch(`/seller/durations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-app', appId] });
      setEditingDuration(null);
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const deleteDuration = useMutation({
    mutationFn: (id: string) => api.delete(`/seller/durations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-app', appId] });
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
      ...(form.productType === 'MANUAL'
        ? { manualStock: form.manualStockUnlimited ? null : (parseInt(form.manualStock) || 0) }
        : {}),
    });
  };

  const handleEditDuration = (duration: Duration) => {
    setEditingDuration(duration);
    setEditForm({
      label: duration.label,
      days: String(duration.days),
      basePrice: String(duration.basePrice),
      productType: duration.productType,
      buyerInfoLabel: duration.buyerInfoLabel || '',
      manualStockUnlimited: duration.manualStock === null || duration.manualStock === undefined,
      manualStock: duration.manualStock != null ? String(duration.manualStock) : '',
    });
  };

  const handleEditSubmit = () => {
    if (!editingDuration) return;
    if (!editForm.label.trim()) { Alert.alert('Error', 'Label harus diisi'); return; }
    if (!editForm.days || parseInt(editForm.days) <= 0) { Alert.alert('Error', 'Jumlah hari harus valid'); return; }
    if (!editForm.basePrice || parseNumber(editForm.basePrice) <= 0) { Alert.alert('Error', 'Harga harus valid'); return; }

    updateDuration.mutate({
      id: editingDuration.id,
      data: {
        label: editForm.label.trim(),
        days: parseInt(editForm.days),
        basePrice: parseNumber(editForm.basePrice),
        productType: editForm.productType,
        ...(editForm.productType === 'MANUAL' && editForm.buyerInfoLabel.trim()
          ? { buyerInfoLabel: editForm.buyerInfoLabel.trim() }
          : { buyerInfoLabel: undefined }),
        ...(editForm.productType === 'MANUAL'
          ? { manualStock: editForm.manualStockUnlimited ? null : (parseInt(editForm.manualStock) || 0) }
          : { manualStock: null }),
      },
    });
  };

  const handleDeleteDuration = (duration: Duration) => {
    Alert.alert('Hapus Durasi', `Yakin ingin menghapus ${duration.label}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteDuration.mutate(duration.id) },
    ]);
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
      <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
        <Text style={styles.backBtnText}>{'<-'} Kembali</Text>
      </TouchableOpacity>
      <Text style={styles.header}>{appName || appDetail?.template?.name || 'Detail Aplikasi'}</Text>

      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Durasi</Text>
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item }) => {
          const loginReportCount = item.loginReportCount ?? 0;
          const totalLoginReportCount = item.totalLoginReportCount ?? 0;
          const needsRepairCount = item.needsRepairCount ?? 0;
          const cardBorderStyle = {
            ...((item.expiredCount ?? 0) > 0 ? { borderLeftWidth: 3, borderLeftColor: '#ef4444' } : {}),
            ...((item.pendingWarrantyCount ?? 0) > 0 ? { borderRightWidth: 3, borderRightColor: '#3b82f6' } : {}),
            ...(loginReportCount > 0 ? { borderBottomWidth: 3, borderBottomColor: '#f97316' } : {}),
            ...(needsRepairCount > 0 ? { borderTopWidth: 3, borderTopColor: '#f97316' } : (item.waitingSellerCount ?? 0) > 0 ? { borderTopWidth: 3, borderTopColor: '#eab308' } : {}),
          };
          return (
          <TouchableOpacity
            style={[styles.card, cardBorderStyle]}
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
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => handleEditDuration(item)} style={styles.actionBtn}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteDuration(item)} style={styles.actionBtn}>
                  <Text style={styles.deleteBtnText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.cardPrice}>{formatRupiah(item.basePrice)}</Text>
            {item.productType === 'MANUAL' ? (
              <Text style={styles.cardMeta}>
                Stok: {item.manualStock === null || item.manualStock === undefined ? 'Unlimited' : item.manualStock}
              </Text>
            ) : (
              <Text style={styles.cardMeta}>{item.accountCount ?? 0} akun</Text>
            )}
            <Text style={styles.cardStock}>
              Tersedia: {item.stockAvailable === -1 ? '∞' : (item.stockAvailable ?? 0)} | Terkunci: {item.stockLocked ?? 0} | Terjual: {item.stockSold ?? 0}
            </Text>
            {(item.expiredCount ?? 0) > 0 && (
              <Text style={styles.expiredBadge}>{item.expiredCount} kadaluarsa</Text>
            )}
            {(item.pendingWarrantyCount ?? 0) > 0 && (
              <Text style={styles.warrantyBadge}>{item.pendingWarrantyCount} verifikasi</Text>
            )}
            {loginReportCount > 0 && (
              <Text style={styles.loginReportBadge}>{loginReportCount} komplain</Text>
            )}
            {needsRepairCount > 0 && (
              <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 }}>{'\u{1F527}'} {needsRepairCount} perlu diperbaiki</Text>
            )}
            {(item.waitingSellerCount ?? 0) > 0 && (
              <Text style={{ color: '#eab308', fontSize: 12, fontWeight: '600', marginTop: 4 }}>{'\u{23F0}'} {item.waitingSellerCount} menunggu proses</Text>
            )}
          </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada durasi'}</Text>
        }
      />

      {/* Modal Edit Durasi */}
      <Modal visible={!!editingDuration} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Durasi</Text>

            <TextInput
              style={styles.input}
              placeholder='Label (contoh: "5 Hari", "1 Bulan")'
              value={editForm.label}
              onChangeText={(v) => setEditForm({ ...editForm, label: v })}
            />
            <TextInput
              style={styles.input}
              placeholder="Jumlah hari"
              value={editForm.days}
              onChangeText={(v) => setEditForm({ ...editForm, days: v })}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder="Harga dasar (Rupiah)"
              value={formatNumber(editForm.basePrice)}
              onChangeText={(v) => setEditForm({ ...editForm, basePrice: v.replace(/\./g, '') })}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Tipe Produk</Text>
            <View style={styles.typeRow}>
              {([['AKUN_READY', 'Akun Ready'], ['MANUAL', 'Manual']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  style={[styles.typeChip, editForm.productType === val && styles.typeChipSelected]}
                  onPress={() => setEditForm({ ...editForm, productType: val as ProductType })}
                >
                  <Text style={[styles.typeChipText, editForm.productType === val && styles.typeChipTextSelected]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {editForm.productType === 'MANUAL' && (
              <TextInput
                style={styles.input}
                placeholder="Apa yang harus dikirim pembeli?"
                value={editForm.buyerInfoLabel}
                onChangeText={(v) => setEditForm({ ...editForm, buyerInfoLabel: v })}
              />
            )}

            {editForm.productType === 'MANUAL' && (
              <>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Stok Unlimited</Text>
                  <Switch
                    value={editForm.manualStockUnlimited}
                    onValueChange={(v) => setEditForm({ ...editForm, manualStockUnlimited: v, manualStock: v ? '' : editForm.manualStock })}
                  />
                </View>
                {!editForm.manualStockUnlimited && (
                  <TextInput
                    style={styles.input}
                    placeholder="Jumlah stok"
                    value={editForm.manualStock}
                    onChangeText={(v) => setEditForm({ ...editForm, manualStock: v })}
                    keyboardType="numeric"
                  />
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.button}
              onPress={handleEditSubmit}
              disabled={updateDuration.isPending}
            >
              <Text style={styles.buttonText}>
                {updateDuration.isPending ? 'Menyimpan...' : 'Simpan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingDuration(null)}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Tambah Durasi */}
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

            {form.productType === 'MANUAL' && (
              <>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Stok Unlimited</Text>
                  <Switch
                    value={form.manualStockUnlimited}
                    onValueChange={(v) => setForm({ ...form, manualStockUnlimited: v, manualStock: v ? '' : form.manualStock })}
                  />
                </View>
                {!form.manualStockUnlimited && (
                  <TextInput
                    style={styles.input}
                    placeholder="Jumlah stok"
                    value={form.manualStock}
                    onChangeText={(v) => setForm({ ...form, manualStock: v })}
                    keyboardType="numeric"
                  />
                )}
              </>
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
  expiredBadge: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  warrantyBadge: { color: '#3b82f6', fontSize: 12, fontWeight: '600', marginTop: 4 },
  loginReportBadge: { color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  badge: {
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: { fontSize: 11, color: '#3730a3', fontWeight: '600' },
  cardPrice: { fontSize: 14, color: '#2563eb', fontWeight: '600', marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 4 },
  cardStock: { fontSize: 11, color: '#666', marginTop: 2 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '500' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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
