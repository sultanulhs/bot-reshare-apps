import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, Modal, BackHandler, RefreshControl, Image,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../src/lib/api';

interface SubAccount {
  id: string;
  name: string;
  pin: string;
  status: string;
  isExpired?: boolean;
  buyerTgUserId?: string | null;
  buyerName?: string | null;
  buyerUsername?: string | null;
  buyerInfo?: string | null;
  orderStatus?: string | null;
  orderId?: string | null;
  expiresAt?: string | null;
  accessExpiresAt?: string | null;
  warrantyStatus?: string | null;
  warrantyPhoto?: boolean;
  warrantyAt?: string | null;
  warrantyDeadline?: string | null;
  createdAt: string;
}

export default function SubAccountsScreen() {
  const { accountId, accountEmail, durationId, durationLabel, appId, appName } = useLocalSearchParams<{
    accountId: string;
    accountEmail: string;
    durationId: string;
    durationLabel: string;
    appId: string;
    appName: string;
  }>();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [editingSubAccount, setEditingSubAccount] = useState<SubAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editPin, setEditPin] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [photoHistoryOrderId, setPhotoHistoryOrderId] = useState<string | null>(null);
  const [photoHistory, setPhotoHistory] = useState<Array<{ id: string; fileId: string; status: string; reason: string | null; createdAt: string }>>([]);
  const [loadingPhotoHistory, setLoadingPhotoHistory] = useState(false);

  const viewWarrantyPhoto = async (photoId: string) => {
    try {
      const res = await api.get(`/seller/warranty-photos/${photoId}/image`, { responseType: 'arraybuffer' });
      const base64 = btoa(String.fromCharCode(...new Uint8Array(res.data)));
      const contentType = res.headers['content-type'] || 'image/jpeg';
      setPhotoUri(`data:${contentType};base64,${base64}`);
    } catch { Alert.alert('Error', 'Gagal memuat foto'); }
  };

  const openPhotoHistory = async (orderId: string) => {
    setPhotoHistoryOrderId(orderId);
    setLoadingPhotoHistory(true);
    try {
      const res = await api.get(`/seller/orders/${orderId}/warranty-photos`);
      setPhotoHistory(res.data);
    } catch { Alert.alert('Error', 'Gagal memuat riwayat foto'); }
    setLoadingPhotoHistory(false);
  };

  const { data: subAccounts, isLoading, refetch } = useQuery<SubAccount[]>({
    queryKey: ['seller-sub-accounts', accountId],
    queryFn: () => api.get(`/seller/accounts/${accountId}/sub-accounts`).then((r) => r.data),
  });

  const handleBack = useCallback(() => {
    router.push({ pathname: '/(seller)/add-account', params: { durationId: durationId!, durationLabel: durationLabel || '', appId: appId!, appName: appName || '' } });
  }, [durationId, durationLabel, appId, appName]);

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

  const addSubAccount = useMutation({
    mutationFn: () => api.post(`/seller/accounts/${accountId}/sub-accounts`, { name, pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', accountId] });
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setShowAdd(false);
      setName('');
      setPin('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const updateSubAccount = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; pin?: string } }) =>
      api.patch(`/seller/sub-accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', accountId] });
      setEditingSubAccount(null);
      setEditName('');
      setEditPin('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const verifyWarranty = useMutation({
    mutationFn: ({ orderId, approved, reason }: { orderId: string; approved: boolean; reason?: string }) =>
      api.post(`/seller/orders/${orderId}/warranty-verify`, { approved, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', accountId] });
      setRejectOrderId(null);
      setRejectReason('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const deleteSubAccount = useMutation({
    mutationFn: (id: string) => api.delete(`/seller/sub-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', accountId] });
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSubmit = () => {
    if (!name.trim()) { Alert.alert('Error', 'Nama sub-akun harus diisi'); return; }
    if (!pin.trim()) { Alert.alert('Error', 'PIN harus diisi'); return; }
    addSubAccount.mutate();
  };

  const handleEditSubAccount = (subAccount: SubAccount) => {
    setEditingSubAccount(subAccount);
    setEditName(subAccount.name);
    setEditPin(subAccount.pin);
  };

  const handleEditSubmit = () => {
    if (!editingSubAccount) return;
    if (!editName.trim()) { Alert.alert('Error', 'Nama sub-akun harus diisi'); return; }
    if (!editPin.trim()) { Alert.alert('Error', 'PIN harus diisi'); return; }
    updateSubAccount.mutate({
      id: editingSubAccount.id,
      data: { name: editName.trim(), pin: editPin.trim() },
    });
  };

  const handleDeleteSubAccount = (subAccount: SubAccount) => {
    Alert.alert('Hapus Sub-Akun', `Yakin ingin menghapus ${subAccount.name}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteSubAccount.mutate(subAccount.id) },
    ]);
  };

  const statusColor = (s: string) => s === 'AVAILABLE' ? '#16a34a' : s === 'SOLD' ? '#ef4444' : '#f59e0b';

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.backBtn}>{'<-'} Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.header}>Sub-Akun</Text>
      <Text style={styles.subHeader}>{accountEmail}</Text>

      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Sub-Akun</Text>
      </TouchableOpacity>

      <FlatList
        data={subAccounts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={[styles.card, item.isExpired && styles.cardExpired, {
            ...(item.warrantyStatus === 'SUBMITTED' ? { borderRightWidth: 3, borderRightColor: '#3b82f6' } : {}),
          }]}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardPin}>PIN: {item.pin}</Text>
                {item.buyerTgUserId && (item.status === 'SOLD' || item.status === 'LOCKED') && (
                  <Text style={item.isExpired ? styles.buyerExpired : item.status === 'LOCKED' ? styles.buyerLocked : styles.buyerActive}>
                    {item.status === 'LOCKED' ? '🔒 Menunggu Bayar' : item.isExpired ? '⚠️ Kadaluarsa' : '👤 Aktif'} — Pembeli: {
                      item.buyerName
                        ? `${item.buyerName}${item.buyerUsername ? ` (@${item.buyerUsername})` : ''}`
                        : item.buyerInfo || (item.buyerUsername ? `@${item.buyerUsername}` : `@${item.buyerTgUserId}`)
                    }
                  </Text>
                )}
                {item.status === 'LOCKED' && item.expiresAt && (
                  <Text style={styles.expiryDate}>
                    ⏰ Batas bayar: {new Date(item.expiresAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                )}
                {item.accessExpiresAt && item.status === 'SOLD' && (
                  <Text style={styles.expiryDate}>
                    Berlaku sampai: {new Date(item.accessExpiresAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                )}
                {item.warrantyStatus && (
                  <Text style={{
                    fontSize: 12, marginTop: 4, fontWeight: '600',
                    color: item.warrantyStatus === 'ACTIVE' ? '#16a34a' : item.warrantyStatus === 'SUBMITTED' ? '#3b82f6' : item.warrantyStatus === 'PENDING' ? '#f59e0b' : '#ef4444',
                  }}>
                    {item.warrantyStatus === 'ACTIVE' ? '\u{1F6E1}\u{FE0F} Garansi Aktif' : item.warrantyStatus === 'SUBMITTED' ? '\u{1F4F8} Menunggu Verifikasi' : item.warrantyStatus === 'PENDING' ? '\u{23F3} Garansi Menunggu Foto' : '\u{274C} Garansi Hangus'}
                    {item.orderId && (
                      <Text onPress={() => openPhotoHistory(item.orderId!)} style={{ color: '#2563eb' }}> {'\u{1F4F7}'} Riwayat</Text>
                    )}
                  </Text>
                )}
                {item.warrantyStatus === 'SUBMITTED' && item.orderId && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: '#16a34a', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                      onPress={() => verifyWarranty.mutate({ orderId: item.orderId!, approved: true })}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{2705}'} Setujui</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                      onPress={() => setRejectOrderId(item.orderId!)}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{274C}'} Tolak</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
            </View>
            <View style={styles.cardFooter}>
              <Text style={styles.cardMeta}>
                {new Date(item.createdAt).toLocaleDateString('id-ID')}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => handleEditSubAccount(item)} style={styles.actionBtn}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteSubAccount(item)} style={styles.actionBtn}>
                  <Text style={styles.deleteBtnText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada sub-akun'}</Text>
        }
      />

      {/* Modal Edit Sub-Akun */}
      <Modal visible={!!editingSubAccount} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Sub-Akun</Text>
            <TextInput style={styles.input} placeholder="Nama profil / sub-akun"
              value={editName} onChangeText={setEditName} />
            <TextInput style={styles.input} placeholder="PIN"
              value={editPin} onChangeText={setEditPin} keyboardType="numeric" />
            <TouchableOpacity style={styles.button} onPress={handleEditSubmit} disabled={updateSubAccount.isPending}>
              <Text style={styles.buttonText}>{updateSubAccount.isPending ? 'Menyimpan...' : 'Simpan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingSubAccount(null); setEditName(''); setEditPin(''); }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Tambah Sub-Akun */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Sub-Akun</Text>
            <TextInput style={styles.input} placeholder="Nama profil / sub-akun"
              value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="PIN"
              value={pin} onChangeText={setPin} keyboardType="numeric" />
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={addSubAccount.isPending}>
              <Text style={styles.buttonText}>{addSubAccount.isPending ? 'Menyimpan...' : 'Simpan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal visible={!!rejectOrderId} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tolak Garansi</Text>
            <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>Berikan alasan penolakan (opsional):</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Alasan penolakan..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#ef4444' }]}
              onPress={() => { if (rejectOrderId) verifyWarranty.mutate({ orderId: rejectOrderId, approved: false, reason: rejectReason.trim() || undefined }); }}
              disabled={verifyWarranty.isPending}>
              <Text style={styles.buttonText}>{verifyWarranty.isPending ? 'Menolak...' : 'Tolak Garansi'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRejectOrderId(null); setRejectReason(''); }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo History Modal */}
      <Modal visible={!!photoHistoryOrderId} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Riwayat Foto Garansi</Text>
            {loadingPhotoHistory ? (
              <Text style={{ textAlign: 'center', color: '#999', marginVertical: 16 }}>Memuat...</Text>
            ) : photoHistory.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#999', marginVertical: 16 }}>Belum ada foto</Text>
            ) : (
              <FlatList
                data={photoHistory}
                keyExtractor={(item) => item.id}
                renderItem={({ item: photo }) => (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                    onPress={() => viewWarrantyPhoto(photo.id)}>
                    <View style={[
                      { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
                      { backgroundColor: photo.status === 'SUBMITTED' ? '#3b82f6' : photo.status === 'APPROVED' ? '#16a34a' : '#ef4444' },
                    ]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: photo.status === 'APPROVED' ? '#16a34a' : photo.status === 'REJECTED' ? '#ef4444' : '#3b82f6' }}>
                        {photo.status === 'SUBMITTED' ? 'Menunggu' : photo.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
                      </Text>
                      {photo.status === 'REJECTED' && photo.reason && (
                        <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>Alasan: {photo.reason}</Text>
                      )}
                      <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                        {new Date(photo.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                    <Text style={{ color: '#2563eb', fontSize: 12 }}>{'\u{1F4F7}'} Lihat</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity onPress={() => { setPhotoHistoryOrderId(null); setPhotoHistory([]); }}>
              <Text style={[styles.cancel, { marginTop: 16 }]}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal visible={!!photoUri} animationType="fade" transparent>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPhotoUri(null)}>
          {photoUri && <Image source={{ uri: photoUri }} style={{ width: '90%', height: '70%', resizeMode: 'contain' }} />}
          <Text style={{ color: '#fff', marginTop: 16, fontSize: 14 }}>Ketuk untuk tutup</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  backBtn: { fontSize: 15, color: '#2563eb', fontWeight: '600', marginBottom: 12 },
  header: { fontSize: 20, fontWeight: 'bold' },
  subHeader: { fontSize: 14, color: '#666', marginBottom: 16 },
  addBtn: { backgroundColor: '#10b981', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardExpired: { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  buyerActive: { color: '#16a34a', fontSize: 12, marginTop: 4 },
  buyerLocked: { color: '#f59e0b', fontSize: 12, marginTop: 4 },
  buyerExpired: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  expiryDate: { color: '#999', fontSize: 11, marginTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardPin: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#10b981', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
