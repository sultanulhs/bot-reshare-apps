import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { View, Text, FlatList, StyleSheet, RefreshControl, ScrollView, TouchableOpacity, Image, Modal, TextInput, Alert } from 'react-native';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import api from '../../src/lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const STATUS_FILTERS = [
  { key: null, letter: 'A', label: 'Semua', color: '#6b7280' },
  { key: 'PENDING', letter: 'P', label: 'Pending', color: '#f59e0b' },
  { key: 'FULFILLED', letter: 'F', label: 'Fulfilled', color: '#16a34a' },
  { key: 'EXPIRED', letter: 'E', label: 'Expired', color: '#ef4444' },
  { key: 'WAITING_SELLER', letter: 'W', label: 'Waiting', color: '#f59e0b' },
  { key: 'FAILED', letter: 'X', label: 'Failed', color: '#ef4444' },
] as const;

export default function BalanceScreen() {
  const queryClient = useQueryClient();
  const now = new Date();

  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.get('/seller/balance').then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ['seller-sales'],
    queryFn: () => api.get('/seller/sales').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const monthScrollRef = useRef<ScrollView>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoHistoryOrderId, setPhotoHistoryOrderId] = useState<string | null>(null);
  const [photoHistory, setPhotoHistory] = useState<any[]>([]);
  const [loginReportOrderId, setLoginReportOrderId] = useState<string | null>(null);
  const [loginReports, setLoginReports] = useState<any[]>([]);
  const [resolveReportId, setResolveReportId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [replaceOrderId, setReplaceOrderId] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<any[]>([]);

  const verifyWarranty = useMutation({
    mutationFn: ({ orderId, approved, reason }: { orderId: string; approved: boolean; reason?: string }) =>
      api.post(`/seller/orders/${orderId}/warranty-verify`, { approved, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] });
      setRejectOrderId(null);
      setRejectReason('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const viewWarrantyPhoto = async (photoId: string) => {
    try {
      const res = await api.get(`/seller/warranty-photos/${photoId}/image`);
      setPhotoUri(`data:${res.data.contentType};base64,${res.data.base64}`);
    } catch { Alert.alert('Error', 'Gagal memuat foto'); }
  };

  const openPhotoHistory = async (orderId: string) => {
    setPhotoHistoryOrderId(orderId);
    try {
      const res = await api.get(`/seller/orders/${orderId}/warranty-photos`);
      setPhotoHistory(res.data);
    } catch { Alert.alert('Error', 'Gagal memuat riwayat'); }
  };

  const openLoginReports = async (orderId: string) => {
    setLoginReportOrderId(orderId);
    try {
      const res = await api.get(`/seller/orders/${orderId}/login-reports`);
      setLoginReports(res.data);
    } catch { Alert.alert('Error', 'Gagal memuat komplain'); }
  };

  const viewLoginReportPhoto = async (photoId: string) => {
    try {
      const res = await api.get(`/seller/login-report-photos/${photoId}/image`);
      setPhotoUri(`data:${res.data.contentType};base64,${res.data.base64}`);
    } catch { Alert.alert('Error', 'Gagal memuat foto'); }
  };

  const openReplacements = async (orderId: string) => {
    try {
      const res = await api.get(`/seller/orders/${orderId}/available-replacements`);
      setReplacements(res.data);
      setReplaceOrderId(orderId);
    } catch { Alert.alert('Error', 'Gagal memuat stok pengganti'); }
  };

  const resolveReport = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/seller/login-reports/${id}/resolve`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] });
      setResolveReportId(null);
      setResolveNote('');
      if (loginReportOrderId) openLoginReports(loginReportOrderId);
      Alert.alert('Berhasil', 'Komplain berhasil diselesaikan');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const replaceStock = useMutation({
    mutationFn: ({ orderId, stockId, stockType }: { orderId: string; stockId: string; stockType: string }) =>
      api.post(`/seller/orders/${orderId}/replace-stock`, { stockId, stockType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] });
      setReplaceOrderId(null);
      setReplacements([]);
      setLoginReportOrderId(null);
      setLoginReports([]);
      Alert.alert('Berhasil', 'Akun berhasil diganti. Kredensial baru telah dikirim ke pembeli.');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  useEffect(() => {
    // Scroll so current month is visible near the right edge (before year picker)
    const chipWidth = 56 + 8; // minWidth + marginRight approx
    const scrollTo = Math.max(0, (selectedMonth - 2) * chipWidth);
    setTimeout(() => monthScrollRef.current?.scrollTo({ x: scrollTo, animated: false }), 100);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['seller-balance'] }),
      queryClient.invalidateQueries({ queryKey: ['seller-sales'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  const filteredSales = useMemo(() => {
    if (!sales) return [];
    return sales.filter((s: any) => {
      const d = new Date(s.createdAt);
      if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return false;
      if (selectedStatus && s.status !== selectedStatus) return false;
      return true;
    });
  }, [sales, selectedMonth, selectedYear, selectedStatus]);

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>Saldo Tersedia</Text>
        <Text style={styles.amount}>Rp{(balance?.available ?? 0).toLocaleString('id-ID')}</Text>
        <Text style={styles.note}>Pencairan manual (hubungi admin)</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Riwayat Transaksi</Text>
        <View style={styles.statusFilterRow}>
          {STATUS_FILTERS.map((sf) => (
            <TouchableOpacity key={sf.letter} onPress={() => setSelectedStatus(sf.key)}
              style={[styles.statusDot, { backgroundColor: selectedStatus === sf.key ? sf.color : '#e5e7eb' }]}>
              <Text style={[styles.statusDotText, { color: selectedStatus === sf.key ? '#fff' : sf.color }]}>{sf.letter}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.dateFilterRow}>
        <ScrollView ref={monthScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          {MONTHS.map((m, i) => (
            <TouchableOpacity key={i} onPress={() => setSelectedMonth(i)}
              style={[styles.monthChip, selectedMonth === i && styles.monthChipActive]}>
              <Text style={[styles.monthChipText, selectedMonth === i && styles.monthChipTextActive]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.yearPicker}>
          <TouchableOpacity onPress={() => setSelectedYear(y => y - 1)} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.yearText}>{selectedYear}</Text>
          <TouchableOpacity onPress={() => setSelectedYear(y => Math.min(y + 1, new Date().getFullYear()))} style={styles.yearArrow}>
            <Text style={styles.yearArrowText}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={filteredSales}
        keyExtractor={(item: any) => item.orderId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }: { item: any }) => {
          const statusColors: Record<string, string> = {
            FULFILLED: '#16a34a', PENDING: '#f59e0b', WAITING_SELLER: '#f59e0b',
            EXPIRED: '#ef4444', FAILED: '#ef4444', PAID: '#3b82f6',
          };
          const statusColor = statusColors[item.status] || '#999';
          const buyerLabel = item.buyerName
            ? `${item.buyerName}${item.buyerUsername ? ` (@${item.buyerUsername})` : ''}`
            : item.buyerUsername ? `@${item.buyerUsername}` : `@${item.buyerTgUserId}`;
          const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{item.productTitle}{item.durationLabel ? ` — ${item.durationLabel}` : ''}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
              <Text style={styles.cardBuyer}>👤 {buyerLabel}</Text>
              <Text style={styles.priceTotal}>💰 Rp{item.totalAmount.toLocaleString('id-ID')}</Text>
              <Text style={styles.cardDate}>📅 Pesan: {fmtDate(item.createdAt)}</Text>
              {(item.status === 'PENDING' || item.status === 'EXPIRED') && item.expiresAt && (
                <Text style={styles.cardDate}>{item.status === 'PENDING' ? '⏰' : '❌'} {item.status === 'PENDING' ? 'Batas bayar' : 'Expired'}: {fmtDate(item.expiresAt)}</Text>
              )}
              {item.fulfilledAt && <Text style={styles.cardDate}>✅ Selesai: {fmtDate(item.fulfilledAt)}</Text>}
              {item.accessExpiresAt && item.status === 'FULFILLED' && (
                <Text style={styles.cardDate}>⏰ Berlaku s/d: {fmtDate(item.accessExpiresAt)}</Text>
              )}
              {item.warrantyStatus && item.warrantyStatus === 'ACTIVE' ? (
                <TouchableOpacity onPress={() => openPhotoHistory(item.orderId)}>
                  <Text style={{ fontSize: 11, marginTop: 2, fontWeight: '600', color: '#16a34a' }}>
                    {'\u{1F6E1}\u{FE0F}'} Garansi Aktif {'\u{1F4F7}'}
                  </Text>
                </TouchableOpacity>
              ) : item.warrantyStatus ? (
                <Text style={{
                  fontSize: 11, marginTop: 2, fontWeight: '600',
                  color: item.warrantyStatus === 'SUBMITTED' ? '#3b82f6' : item.warrantyStatus === 'PENDING' ? '#f59e0b' : '#ef4444',
                }}>
                  {item.warrantyStatus === 'SUBMITTED' ? '\u{1F4F8} Menunggu Verifikasi' : item.warrantyStatus === 'PENDING' ? '\u{23F3} Garansi Menunggu' : '\u{274C} Garansi Hangus'}
                </Text>
              ) : null}
              {item.warrantyStatus === 'SUBMITTED' && (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: '#16a34a', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                      onPress={() => verifyWarranty.mutate({ orderId: item.orderId, approved: true })}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{2705}'} Setujui</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                      onPress={() => setRejectOrderId(item.orderId)}>
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{274C}'} Tolak</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => openPhotoHistory(item.orderId)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#2563eb', fontSize: 12 }}>{'\u{1F4F7}'} Foto Garansi</Text>
                  </TouchableOpacity>
                </>
              )}
              {(item.loginReportCount ?? 0) > 0 && (
                <TouchableOpacity onPress={() => openLoginReports(item.orderId)}>
                  <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                    {'\u{26A0}\u{FE0F}'} {item.loginReportCount} komplain
                  </Text>
                </TouchableOpacity>
              )}
              {(item.loginReportCount ?? 0) === 0 && (item.totalLoginReportCount ?? 0) > 0 && (
                <TouchableOpacity onPress={() => openLoginReports(item.orderId)}>
                  <Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                    {'\u{2705}'} Komplain Selesai
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada transaksi di {MONTHS[selectedMonth]} {selectedYear}</Text>}
      />

      {/* Reject Reason Modal */}
      <Modal visible={!!rejectOrderId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>Tolak Garansi</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 12 }}
              placeholder="Alasan penolakan..."
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <TouchableOpacity
              style={{ backgroundColor: '#ef4444', borderRadius: 8, padding: 12, alignItems: 'center' }}
              onPress={() => rejectOrderId && verifyWarranty.mutate({ orderId: rejectOrderId, approved: false, reason: rejectReason })}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Tolak Garansi</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRejectOrderId(null); setRejectReason(''); }}>
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 12 }}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo History Modal */}
      <Modal visible={!!photoHistoryOrderId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '80%' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>Riwayat Foto Garansi</Text>
            <FlatList
              data={photoHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item: photo }) => (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                  onPress={() => viewWarrantyPhoto(photo.id)}>
                  <View style={[{ width: 10, height: 10, borderRadius: 5, marginRight: 10 },
                    { backgroundColor: photo.status === 'SUBMITTED' ? '#3b82f6' : photo.status === 'APPROVED' ? '#16a34a' : '#ef4444' }]} />
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
            <TouchableOpacity onPress={() => { setPhotoHistoryOrderId(null); setPhotoHistory([]); }}>
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 16 }}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Login Reports Modal */}
      <Modal visible={!!loginReportOrderId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '80%' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>Komplain</Text>
            <FlatList
              data={loginReports}
              keyExtractor={(item) => item.id}
              renderItem={({ item: report }) => (
                <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: report.status === 'PENDING' ? '#f97316' : '#16a34a' }} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: report.status === 'PENDING' ? '#f97316' : '#16a34a' }}>
                        {report.status === 'PENDING' ? 'Menunggu' : 'Diselesaikan'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {new Date(report.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  </Text>
                  {report.photos?.map((photo: any) => (
                    <View key={photo.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <TouchableOpacity onPress={() => viewLoginReportPhoto(photo.id)}>
                        <Text style={{ color: '#2563eb', fontSize: 12 }}>{'\u{1F4F7}'} Foto</Text>
                      </TouchableOpacity>
                      {photo.caption && <Text style={{ fontSize: 11, color: '#666', marginLeft: 8, flex: 1 }}>{photo.caption}</Text>}
                      <Text style={{ fontSize: 10, color: '#999', marginLeft: 4 }}>
                        {new Date(photo.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                  ))}
                  {report.status === 'RESOLVED' && report.resolvedNote && (
                    <Text style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>Catatan: {report.resolvedNote}</Text>
                  )}
                  {report.status === 'RESOLVED' && report.resolvedAt && (
                    <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                      Diselesaikan: {new Date(report.resolvedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                    </Text>
                  )}
                  {report.status === 'PENDING' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: '#16a34a', borderRadius: 6, padding: 6, alignItems: 'center', flex: 1 }}
                        onPress={() => setResolveReportId(report.id)}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{2705}'} Selesaikan</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: '#2563eb', borderRadius: 6, padding: 6, alignItems: 'center', flex: 1 }}
                        onPress={() => openReplacements(loginReportOrderId!)}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{1F504}'} Ganti Akun</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
            <TouchableOpacity onPress={() => { setLoginReportOrderId(null); setLoginReports([]); }}>
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 16 }}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Replace Stock Modal */}
      <Modal visible={!!replaceOrderId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24, maxHeight: '80%' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>Pilih Akun Pengganti</Text>
            {replacements.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#999', marginVertical: 16 }}>Tidak ada stok tersedia</Text>
            ) : (
              <FlatList
                data={replacements}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}
                    onPress={() => Alert.alert('Ganti Akun', `Yakin ganti ke ${item.email}?`, [
                      { text: 'Batal', style: 'cancel' },
                      { text: 'Ganti', onPress: () => replaceStock.mutate({ orderId: replaceOrderId!, stockId: item.id, stockType: item.type }) },
                    ])}>
                    <Text style={{ fontSize: 14, fontWeight: '600' }}>{item.email}</Text>
                    {item.name && <Text style={{ fontSize: 12, color: '#666' }}>Profil: {item.name}</Text>}
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity onPress={() => { setReplaceOrderId(null); setReplacements([]); }}>
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 16 }}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Resolve Report Modal */}
      <Modal visible={!!resolveReportId} animationType="slide" transparent>
        <View style={{ flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>Selesaikan Komplain</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 12, minHeight: 80, textAlignVertical: 'top' }}
              placeholder="Catatan penyelesaian (opsional)"
              value={resolveNote}
              onChangeText={setResolveNote}
              multiline
            />
            <TouchableOpacity
              style={{ backgroundColor: '#16a34a', borderRadius: 8, padding: 12, alignItems: 'center' }}
              onPress={() => resolveReportId && resolveReport.mutate({ id: resolveReportId, note: resolveNote })}
              disabled={resolveReport.isPending}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{resolveReport.isPending ? 'Menyimpan...' : 'Selesaikan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setResolveReportId(null); setResolveNote(''); }}>
              <Text style={{ textAlign: 'center', color: '#666', marginTop: 12 }}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Viewer Modal */}
      <Modal visible={!!photoUri} animationType="fade" transparent>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setPhotoUri(null)}>
          {photoUri && <Image source={{ uri: photoUri }} style={{ width: '90%', height: '70%', resizeMode: 'contain' }} />}
          <Text style={{ color: '#fff', marginTop: 16 }}>Ketuk untuk tutup</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  balanceCard: { backgroundColor: '#2563eb', borderRadius: 12, padding: 24, marginBottom: 16 },
  label: { color: '#ddd', fontSize: 14 },
  amount: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  note: { color: '#bbb', fontSize: 12, marginTop: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  statusFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusDotText: { fontSize: 12, fontWeight: '800' },
  yearPicker: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, elevation: 1 },
  yearArrow: { paddingHorizontal: 10, paddingVertical: 4 },
  yearArrowText: { fontSize: 16, fontWeight: '700', color: '#2563eb' },
  yearText: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginHorizontal: 4 },
  dateFilterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  monthChip: { backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 8, minWidth: 48, alignItems: 'center' as const },
  monthChipActive: { backgroundColor: '#2563eb' },
  monthChipText: { fontSize: 15, color: '#1e293b', fontWeight: '600' },
  monthChipTextActive: { color: '#fff', fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardBuyer: { fontSize: 12, color: '#555', marginBottom: 4 },
  priceTotal: { fontSize: 13, fontWeight: '600', color: '#111', marginBottom: 4 },
  cardDate: { fontSize: 11, color: '#999', marginTop: 1 },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});
