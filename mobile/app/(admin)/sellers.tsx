import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Alert,
  Modal, ScrollView, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native';
import api from '../../src/lib/api';

const STATUSES = ['Semua', 'PENDING', 'APPROVED', 'PROFILE_SUBMITTED', 'ACTIVE', 'SUSPENDED'];
const STATUS_LABELS: Record<string, string> = {
  Semua: 'Semua',
  PENDING: 'Pending',
  APPROVED: 'Approved',
  PROFILE_SUBMITTED: 'Profil',
  ACTIVE: 'Aktif',
  SUSPENDED: 'Suspend',
};
const statusColor: Record<string, string> = {
  PENDING: '#f59e0b',
  APPROVED: '#3b82f6',
  PROFILE_SUBMITTED: '#8b5cf6',
  ACTIVE: '#16a34a',
  SUSPENDED: '#ef4444',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SellersScreen() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('Semua');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  const { data: sellers, isLoading, refetch } = useQuery({
    queryKey: ['admin-sellers', filter],
    queryFn: () => {
      const params = filter !== 'Semua' ? `?status=${filter}` : '';
      return api.get(`/admin/sellers${params}`).then((r) => r.data);
    },
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin-seller-detail', selectedId],
    queryFn: () => api.get(`/admin/sellers/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-sellers'] });
    queryClient.invalidateQueries({ queryKey: ['admin-seller-detail'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/approve`),
    onSuccess: () => { invalidate(); Alert.alert('Berhasil', 'Penjual di-approve'); },
    onError: (e: any) => Alert.alert('Gagal', e.response?.data?.message || 'Error'),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/verify-profile`),
    onSuccess: () => { invalidate(); Alert.alert('Berhasil', 'Profil diverifikasi'); },
    onError: (e: any) => Alert.alert('Gagal', e.response?.data?.message || 'Error'),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/suspend`, { reason: 'Admin action' }),
    onSuccess: () => { invalidate(); Alert.alert('Berhasil', 'Penjual di-suspend'); },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/admin/sellers/${id}/reject`, { reason }),
    onSuccess: () => {
      invalidate();
      setShowRejectModal(null);
      setRejectReason('');
      Alert.alert('Berhasil', 'Penjual ditolak');
    },
    onError: (e: any) => Alert.alert('Gagal', e.response?.data?.message || 'Error'),
  });

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, filter === s && styles.filterChipActive]}
            onPress={() => setFilter(s)}
          >
            <Text style={[styles.filterText, filter === s && styles.filterTextActive]}>
              {STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Seller list */}
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} size="large" />
      ) : (
        <FlatList
          data={sellers}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelectedId(item.id)}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeNameText}>{item.storeName || '-'}</Text>
                  <Text style={styles.ownerNameText}>{item.ownerName}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusColor[item.status] || '#999' }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Email:</Text>
                <Text style={styles.infoValue}>{item.email}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>HP:</Text>
                <Text style={styles.infoValue}>{item.phone}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Produk:</Text>
                <Text style={styles.infoValue}>{item.productCount}</Text>
              </View>
              <Text style={styles.dateText}>Daftar: {formatDate(item.createdAt)}</Text>

              <View style={styles.actions}>
                {item.status === 'PENDING' && (
                  <>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => approve.mutate(item.id)}>
                      <Text style={styles.actionText}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => setShowRejectModal(item.id)}>
                      <Text style={styles.rejectBtnText}>Tolak</Text>
                    </TouchableOpacity>
                  </>
                )}
                {item.status === 'PROFILE_SUBMITTED' && (
                  <>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => verify.mutate(item.id)}>
                      <Text style={styles.actionText}>Verifikasi</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => setShowRejectModal(item.id)}>
                      <Text style={styles.rejectBtnText}>Tolak</Text>
                    </TouchableOpacity>
                  </>
                )}
                {item.status !== 'SUSPENDED' && (
                  <TouchableOpacity
                    style={styles.suspendBtn}
                    onPress={() => Alert.alert('Suspend', `Suspend ${item.ownerName}?`, [
                      { text: 'Batal' },
                      { text: 'Ya', style: 'destructive', onPress: () => suspend.mutate(item.id) },
                    ])}
                  >
                    <Text style={styles.suspendBtnText}>Suspend</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Tidak ada penjual</Text>}
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selectedId} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ScrollView>
              {detailLoading ? (
                <ActivityIndicator size="large" style={{ marginVertical: 24 }} />
              ) : detail ? (
                <>
                  <Text style={styles.modalTitle}>{detail.storeName || 'Detail Penjual'}</Text>
                  <DetailRow label="Pemilik" value={detail.ownerName} />
                  <DetailRow label="Email" value={`${detail.email} ${detail.emailVerified ? '✅' : '❌'}`} />
                  <DetailRow label="No HP" value={`${detail.phone} ${detail.phoneVerified ? '✅' : '❌'}`} />
                  <DetailRow label="Status" value={detail.status} color={statusColor[detail.status]} />
                  {detail.storeCode && <DetailRow label="Kode Toko" value={detail.storeCode} />}
                  <DetailRow label="Produk" value={String(detail.productCount ?? 0)} />
                  <DetailRow label="Daftar" value={formatDate(detail.createdAt)} />

                  {detail.profile && (
                    <View style={styles.payoutCard}>
                      <Text style={styles.payoutTitle}>Rekening Pencairan</Text>
                      <Text style={styles.payoutField}>Bank: {detail.profile.bankName || '-'}</Text>
                      <Text style={styles.payoutField}>No Rek: {detail.profile.accountNumber || '-'}</Text>
                      <Text style={styles.payoutField}>Nama: {detail.profile.accountHolder || '-'}</Text>
                      {detail.profile.payoutAccount && (
                        <Text style={styles.payoutField}>Info: {detail.profile.payoutAccount}</Text>
                      )}
                    </View>
                  )}
                </>
              ) : null}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedId(null)}>
              <Text style={styles.closeBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reject Modal */}
      <Modal visible={!!showRejectModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.rejectModal}>
            <Text style={styles.modalTitle}>Alasan Penolakan</Text>
            <TextInput
              style={styles.rejectInput}
              placeholder="Masukkan alasan..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={styles.rejectActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowRejectModal(null); setRejectReason(''); }}>
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmRejectBtn}
                onPress={() => {
                  if (!rejectReason.trim()) { Alert.alert('Error', 'Masukkan alasan'); return; }
                  reject.mutate({ id: showRejectModal!, reason: rejectReason });
                }}
              >
                <Text style={styles.confirmRejectText}>Tolak</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  filterScroll: { paddingHorizontal: 12, paddingVertical: 12, maxHeight: 56 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#e5e7eb', marginRight: 8 },
  filterChipActive: { backgroundColor: '#2563eb' },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginHorizontal: 12, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  storeNameText: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  ownerNameText: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  infoRow: { flexDirection: 'row', marginBottom: 2 },
  infoLabel: { fontSize: 13, color: '#999', width: 55 },
  infoValue: { fontSize: 13, color: '#333', flex: 1 },
  dateText: { fontSize: 11, color: '#bbb', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  actionBtn: { backgroundColor: '#dbeafe', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  actionText: { fontSize: 13, fontWeight: '600', color: '#2563eb' },
  rejectBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },
  suspendBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  suspendBtnText: { fontSize: 13, fontWeight: '500', color: '#ef4444' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  // Detail Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  detailLabel: { fontSize: 14, color: '#999' },
  detailValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  payoutCard: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 12, marginTop: 12 },
  payoutTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#2563eb' },
  payoutField: { fontSize: 14, color: '#333', marginBottom: 4 },
  closeBtn: { backgroundColor: '#e5e7eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  closeBtnText: { fontSize: 15, fontWeight: '600', color: '#333' },
  // Reject Modal
  rejectModal: { backgroundColor: '#fff', margin: 24, borderRadius: 12, padding: 20, marginTop: 'auto', marginBottom: 'auto' },
  rejectInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, height: 80, textAlignVertical: 'top', marginBottom: 12 },
  rejectActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 8, padding: 12, alignItems: 'center' },
  cancelBtnText: { color: '#333', fontWeight: '600' },
  confirmRejectBtn: { flex: 1, backgroundColor: '#ef4444', borderRadius: 8, padding: 12, alignItems: 'center' },
  confirmRejectText: { color: '#fff', fontWeight: '600' },
});
