import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, Modal, BackHandler, RefreshControl, Switch, Clipboard, Image,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../src/lib/api';

interface Account {
  id: string;
  email: string;
  password: string;
  status: string;
  hasSubAccounts: boolean;
  subAvailable: number;
  subLocked: number;
  subSold: number;
  expiredCount?: number;
  pendingWarrantyCount?: number;
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

interface ManualOrder {
  id: string;
  status: string;
  buyerName?: string | null;
  buyerUsername?: string | null;
  buyerTgUserId: string;
  buyerInfo?: string | null;
  totalAmount: number;
  createdAt: string;
  fulfilledAt?: string | null;
  accessExpiresAt?: string | null;
  expiresAt?: string | null;
  reminderEnabled: boolean;
  warrantyStatus?: string | null;
  warrantyPhoto?: boolean;
  warrantyAt?: string | null;
  warrantyDeadline?: string | null;
}

export default function AddAccountScreen() {
  const { durationId, durationLabel, appId, appName, productType } = useLocalSearchParams<{
    durationId: string;
    durationLabel: string;
    appId: string;
    appName: string;
    productType: string;
  }>();
  const isManual = productType === 'MANUAL';
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newHasSubAccounts, setNewHasSubAccounts] = useState(true);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editHasSubAccounts, setEditHasSubAccounts] = useState(true);
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

  const { data: accountData, isLoading, refetch } = useQuery<{ accounts: Account[]; manualOrders: ManualOrder[] }>({
    queryKey: ['seller-accounts', durationId],
    queryFn: () => api.get(`/seller/durations/${durationId}/accounts`).then((r) => r.data),
  });
  const accounts = accountData?.accounts ?? [];
  const manualOrders = accountData?.manualOrders ?? [];

  const handleBack = useCallback(() => {
    router.push({ pathname: '/(seller)/app-detail', params: { appId: appId!, appName: appName || '' } });
  }, [appId, appName]);

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

  const addAccount = useMutation({
    mutationFn: () => api.post(`/seller/durations/${durationId}/accounts`, { email, password, hasSubAccounts: newHasSubAccounts }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setShowAdd(false);
      setEmail('');
      setPassword('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const updateAccount = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { email?: string; password?: string } }) =>
      api.patch(`/seller/accounts/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setEditingAccount(null);
      setEditEmail('');
      setEditPassword('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const deleteAccount = useMutation({
    mutationFn: (id: string) => api.delete(`/seller/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const verifyWarranty = useMutation({
    mutationFn: ({ orderId, approved, reason }: { orderId: string; approved: boolean; reason?: string }) =>
      api.post(`/seller/orders/${orderId}/warranty-verify`, { approved, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setRejectOrderId(null);
      setRejectReason('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const toggleReminder = useMutation({
    mutationFn: ({ orderId, enabled }: { orderId: string; enabled: boolean }) =>
      api.patch(`/seller/orders/${orderId}/reminder`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] }),
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSubmit = () => {
    if (!email.trim()) { Alert.alert('Error', 'Email harus diisi'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Password harus diisi'); return; }
    addAccount.mutate();
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    setEditEmail(account.email);
    setEditPassword(account.password);
    setEditHasSubAccounts(account.hasSubAccounts);
  };

  const handleEditSubmit = () => {
    if (!editingAccount) return;
    if (!editEmail.trim()) { Alert.alert('Error', 'Email harus diisi'); return; }
    if (!editPassword.trim()) { Alert.alert('Error', 'Password harus diisi'); return; }
    updateAccount.mutate({
      id: editingAccount.id,
      data: { email: editEmail.trim(), password: editPassword.trim(), hasSubAccounts: editHasSubAccounts },
    });
  };

  const handleDeleteAccount = (account: Account) => {
    Alert.alert('Hapus Akun', `Yakin ingin menghapus akun ${account.email}? Semua sub-akun juga akan dihapus.`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteAccount.mutate(account.id) },
    ]);
  };

  const statusColor = (s: string) => s === 'AVAILABLE' ? '#16a34a' : s === 'SOLD' ? '#ef4444' : '#f59e0b';

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.backBtn}>{'<-'} Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.header}>{durationLabel}</Text>

      {!isManual && (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
          <Text style={styles.addBtnText}>+ Tambah Akun</Text>
        </TouchableOpacity>
      )}

      {!isManual && (
      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const canNavigate = item.hasSubAccounts;
          const CardWrapper = canNavigate ? TouchableOpacity : View;
          const cardProps = canNavigate ? {
            onPress: () => router.push({
              pathname: '/(seller)/sub-accounts',
              params: { accountId: item.id, accountEmail: item.email, durationId, durationLabel, appId: appId!, appName: appName || '' },
            }),
          } : {};
          return (
          <CardWrapper
            style={[styles.card, (item.expiredCount ?? 0) > 0 ? styles.cardExpired : (item.pendingWarrantyCount ?? 0) > 0 && styles.cardWarrantyPending]}
            {...cardProps}
          >
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardEmail}>{item.email}</Text>
                <Text style={styles.cardPass}>{item.password}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
                <Text style={styles.badgeText}>{item.status}</Text>
              </View>
            </View>
            {/* Buyer info for accounts without sub-accounts */}
            {item.buyerTgUserId && (item.subAvailable + item.subLocked + item.subSold === 0) && (item.status === 'SOLD' || item.status === 'LOCKED') && (
              <Text style={item.isExpired ? styles.buyerExpired : item.status === 'LOCKED' ? styles.buyerLocked : styles.buyerActive}>
                {item.status === 'LOCKED' ? '🔒 Menunggu Bayar' : item.isExpired ? '⚠️ Kadaluarsa' : '👤 Aktif'} — Pembeli: {
                  item.buyerName ? `${item.buyerName}${item.buyerUsername ? ` (@${item.buyerUsername})` : ''}` : `@${item.buyerTgUserId}`
                }
              </Text>
            )}
            {item.status === 'LOCKED' && item.expiresAt && (item.subAvailable + item.subLocked + item.subSold === 0) && (
              <Text style={styles.expiryDate}>⏰ Batas bayar: {new Date(item.expiresAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</Text>
            )}
            {item.accessExpiresAt && item.status === 'SOLD' && (item.subAvailable + item.subLocked + item.subSold === 0) && (
              <Text style={styles.expiryDate}>Berlaku sampai: {new Date(item.accessExpiresAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</Text>
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
            {(item.expiredCount ?? 0) > 0 && (
              <Text style={styles.expiredBadge}>{item.expiredCount} kadaluarsa</Text>
            )}
            {(item.pendingWarrantyCount ?? 0) > 0 && (
              <Text style={styles.warrantyBadge}>{item.pendingWarrantyCount} verifikasi</Text>
            )}
            <View style={styles.cardFooter}>
              {item.hasSubAccounts ? (
                <Text style={styles.cardMeta}>
                  Sub-akun: {item.subAvailable} tersedia | {item.subLocked} terkunci | {item.subSold} terjual
                </Text>
              ) : (
                <Text style={styles.cardMeta}>Akun tanpa sub-akun</Text>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity onPress={() => handleEditAccount(item)} style={styles.actionBtn}>
                  <Text style={styles.editBtnText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteAccount(item)} style={styles.actionBtn}>
                  <Text style={styles.deleteBtnText}>Hapus</Text>
                </TouchableOpacity>
              </View>
            </View>
          </CardWrapper>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada akun'}</Text>
        }
      />
      )}

      {/* Manual Orders Section */}
      {isManual && (
        <>
          <Text style={styles.sectionTitle}>Pesanan Manual</Text>
          <FlatList
            data={manualOrders}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            renderItem={({ item: order }) => {
              const statusColors: Record<string, string> = {
                FULFILLED: '#16a34a', PENDING: '#f59e0b', WAITING_SELLER: '#f59e0b',
                EXPIRED: '#ef4444', FAILED: '#ef4444',
              };
              const buyerLabel = order.buyerName
                ? `${order.buyerName}${order.buyerUsername ? ` (@${order.buyerUsername})` : ''}`
                : `@${order.buyerTgUserId}`;
              const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });

              // Calculate next reminder and check if overdue
              const now = new Date();
              let nextReminder: Date | null = null;
              let isReminderOverdue = false;
              if (order.fulfilledAt && order.reminderEnabled) {
                const d = new Date(order.fulfilledAt);
                d.setMonth(d.getMonth() + 1);
                d.setDate(1); d.setHours(9, 0, 0, 0);
                // Find the next future reminder
                const overdue = new Date(d);
                if (overdue <= now) {
                  isReminderOverdue = true;
                }
                while (d <= now) { d.setMonth(d.getMonth() + 1); }
                nextReminder = d;
              }

              const cardBorderColor = isReminderOverdue ? '#ef4444' : (statusColors[order.status] || '#999');
              const cardBg = isReminderOverdue ? '#fef2f2' : '#fff';

              return (
                <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: cardBorderColor, backgroundColor: cardBg }]}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardEmail}>👤 {buyerLabel}</Text>
                      {order.buyerInfo && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={[styles.cardPass, { flex: 1 }]}>📋 {order.buyerInfo}</Text>
                        <TouchableOpacity onPress={() => { Clipboard.setString(order.buyerInfo!); Alert.alert('Tersalin', 'Info pembeli telah disalin'); }}>
                          <Text style={{ fontSize: 16 }}>📋</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    </View>
                    <View style={[styles.badge, { backgroundColor: statusColors[order.status] || '#999' }]}>
                      <Text style={styles.badgeText}>{order.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>💰 Rp{order.totalAmount.toLocaleString('id-ID')}</Text>
                  <Text style={styles.cardMeta}>📅 {fmtDate(order.createdAt)}</Text>
                  {order.fulfilledAt && <Text style={styles.cardMeta}>✅ Selesai: {fmtDate(order.fulfilledAt)}</Text>}
                  {order.accessExpiresAt && <Text style={styles.cardMeta}>⏰ Berlaku s/d: {fmtDate(order.accessExpiresAt)}</Text>}
                  {(order.status === 'PENDING' || order.status === 'EXPIRED') && order.expiresAt && (
                    <Text style={styles.cardMeta}>{order.status === 'PENDING' ? '⏰ Batas bayar' : '❌ Expired'}: {fmtDate(order.expiresAt)}</Text>
                  )}
                  {(order.status === 'FULFILLED' || order.status === 'WAITING_SELLER') && (
                    <>
                      <View style={styles.actionInlineRow}>
                        <TouchableOpacity style={styles.sendMsgBtn} onPress={() => router.push({
                          pathname: '/(seller)/order-messages',
                          params: { orderId: order.id, appName: appName || '', durationLabel: durationLabel || '', buyerName: buyerLabel, durationId: durationId!, appId: appId! },
                        })}>
                          <Text style={styles.sendMsgBtnText}>📨 Kirim Pesan</Text>
                        </TouchableOpacity>
                        <View style={styles.reminderInline}>
                          <Text style={styles.reminderLabel}>🔔 Reminder</Text>
                          <Switch
                            value={order.reminderEnabled}
                            onValueChange={(val) => toggleReminder.mutate({ orderId: order.id, enabled: val })}
                          />
                        </View>
                      </View>
                      {order.reminderEnabled && nextReminder && (
                        <Text style={isReminderOverdue ? styles.reminderOverdue : styles.reminderDate}>
                          {isReminderOverdue ? '⚠️' : '🔔'} Reminder: {nextReminder.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      )}
                    </>
                  )}
                  {order.warrantyStatus && (
                    <Text style={{
                      fontSize: 12, marginTop: 4, fontWeight: '600',
                      color: order.warrantyStatus === 'ACTIVE' ? '#16a34a' : order.warrantyStatus === 'SUBMITTED' ? '#3b82f6' : order.warrantyStatus === 'PENDING' ? '#f59e0b' : '#ef4444',
                    }}>
                      {order.warrantyStatus === 'ACTIVE' ? '\u{1F6E1}\u{FE0F} Garansi Aktif' : order.warrantyStatus === 'SUBMITTED' ? '\u{1F4F8} Menunggu Verifikasi' : order.warrantyStatus === 'PENDING' ? '\u{23F3} Garansi Menunggu Foto' : '\u{274C} Garansi Hangus'}
                      <Text onPress={() => openPhotoHistory(order.id)} style={{ color: '#2563eb' }}> {'\u{1F4F7}'} Riwayat</Text>
                    </Text>
                  )}
                  {order.warrantyStatus === 'SUBMITTED' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <TouchableOpacity
                        style={{ backgroundColor: '#16a34a', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                        onPress={() => verifyWarranty.mutate({ orderId: order.id, approved: true })}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{2705}'} Setujui</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, flex: 1, alignItems: 'center' }}
                        onPress={() => setRejectOrderId(order.id)}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{274C}'} Tolak</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>Belum ada pesanan manual</Text>}
          />
        </>
      )}

      {/* Modal Edit Akun */}
      <Modal visible={!!editingAccount} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Akun</Text>
            <TextInput style={styles.input} placeholder="Email" value={editEmail}
              onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" value={editPassword}
              onChangeText={setEditPassword} />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Memiliki Sub-Akun</Text>
              <Switch value={editHasSubAccounts} onValueChange={setEditHasSubAccounts} />
            </View>
            <TouchableOpacity style={styles.button} onPress={handleEditSubmit} disabled={updateAccount.isPending}>
              <Text style={styles.buttonText}>{updateAccount.isPending ? 'Menyimpan...' : 'Simpan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingAccount(null); setEditEmail(''); setEditPassword(''); }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Tambah Akun */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Akun</Text>
            <TextInput style={styles.input} placeholder="Email" value={email}
              onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" value={password}
              onChangeText={setPassword} />
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Memiliki Sub-Akun</Text>
              <Switch value={newHasSubAccounts} onValueChange={setNewHasSubAccounts} />
            </View>
            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={addAccount.isPending}>
              <Text style={styles.buttonText}>{addAccount.isPending ? 'Menyimpan...' : 'Simpan'}</Text>
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
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardExpired: { borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  cardWarrantyPending: { borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  warrantyBadge: { color: '#3b82f6', fontSize: 12, fontWeight: '600', marginTop: 4 },
  buyerActive: { color: '#16a34a', fontSize: 12, marginTop: 4 },
  buyerLocked: { color: '#f59e0b', fontSize: 12, marginTop: 4 },
  buyerExpired: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  expiryDate: { color: '#999', fontSize: 11, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  toggleLabel: { fontSize: 14, color: '#333' },
  expiredBadge: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEmail: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardPass: { fontSize: 13, color: '#666', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888' },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  actionInlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  sendMsgBtn: { backgroundColor: '#2563eb', borderRadius: 6, paddingVertical: 8, flex: 1, alignItems: 'center' },
  sendMsgBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  reminderInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, flex: 1 },
  reminderLabel: { fontSize: 16 },
  reminderDate: { fontSize: 11, color: '#2563eb', marginTop: 4 },
  reminderOverdue: { fontSize: 11, color: '#ef4444', fontWeight: '600', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
