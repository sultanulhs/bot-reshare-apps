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
  loginReportCount?: number;
  totalLoginReportCount?: number;
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
  loginReportCount?: number;
  totalLoginReportCount?: number;
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
  const [loginReportOrderId, setLoginReportOrderId] = useState<string | null>(null);
  const [loginReports, setLoginReports] = useState<any[]>([]);
  const [resolveReportId, setResolveReportId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');
  const [replaceOrderId, setReplaceOrderId] = useState<string | null>(null);
  const [replacements, setReplacements] = useState<any[]>([]);
  const [buyerInfoHistoryOrderId, setBuyerInfoHistoryOrderId] = useState<string | null>(null);
  const [buyerInfoHistory, setBuyerInfoHistory] = useState<Array<{ info: string; createdAt: string }>>([]);
  const [loadingBuyerInfoHistory, setLoadingBuyerInfoHistory] = useState(false);
  const [fulfillOrderId, setFulfillOrderId] = useState<string | null>(null);
  const [fulfillCredentials, setFulfillCredentials] = useState('');

  const viewWarrantyPhoto = async (photoId: string) => {
    try {
      const res = await api.get(`/seller/warranty-photos/${photoId}/image`);
      setPhotoUri(`data:${res.data.contentType};base64,${res.data.base64}`);
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

  const openBuyerInfoHistory = async (orderId: string) => {
    setBuyerInfoHistoryOrderId(orderId);
    setLoadingBuyerInfoHistory(true);
    try {
      const res = await api.get(`/seller/orders/${orderId}/buyer-info-history`);
      setBuyerInfoHistory(res.data);
    } catch { Alert.alert('Error', 'Gagal memuat riwayat info'); }
    setLoadingBuyerInfoHistory(false);
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

  const fulfillOrder = useMutation({
    mutationFn: ({ orderId, credentials }: { orderId: string; credentials: string }) =>
      api.post(`/seller/orders/${orderId}/fulfill`, { credentials }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setFulfillOrderId(null);
      setFulfillCredentials('');
      Alert.alert('Berhasil', 'Kredensial berhasil dikirim ke pembeli');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const resolveReport = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/seller/login-reports/${id}/resolve`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
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
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setReplaceOrderId(null);
      setReplacements([]);
      setLoginReportOrderId(null);
      setLoginReports([]);
      Alert.alert('Berhasil', 'Akun berhasil diganti. Kredensial baru telah dikirim ke pembeli.');
    },
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

  const statusColor = (s: string) => s === 'AVAILABLE' ? '#16a34a' : s === 'SOLD' ? '#ef4444' : s === 'NEEDS_REPAIR' ? '#f97316' : s === 'EXPIRED' ? '#ef4444' : '#f59e0b';
  const statusLabel = (s: string) => s === 'NEEDS_REPAIR' ? '\u{1F527} Perlu Diperbaiki' : s === 'EXPIRED' ? '\u{231B} Kadaluarsa' : s;

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
            style={[styles.card, {
              ...((item.expiredCount ?? 0) > 0 ? { borderLeftWidth: 3, borderLeftColor: '#ef4444' } : {}),
              ...((item.pendingWarrantyCount ?? 0) > 0 ? { borderRightWidth: 3, borderRightColor: '#3b82f6' } : {}),
              ...((item.loginReportCount ?? 0) > 0 ? { borderBottomWidth: 3, borderBottomColor: '#f97316' } : {}),
            }]}
            {...cardProps}
          >
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardEmail}>{item.email}</Text>
                <Text style={styles.cardPass}>{item.password}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) }]}>
                <Text style={styles.badgeText}>{statusLabel(item.status)}</Text>
              </View>
            </View>
            {/* Info for NEEDS_REPAIR / EXPIRED accounts */}
            {(item.status === 'NEEDS_REPAIR' || item.status === 'EXPIRED') && (
              <Text style={{ fontSize: 11, color: '#f97316', marginTop: 4 }}>Edit kredensial untuk mengaktifkan kembali</Text>
            )}
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
            {item.warrantyStatus && item.warrantyStatus === 'ACTIVE' && item.orderId ? (
              <TouchableOpacity onPress={() => openPhotoHistory(item.orderId!)}>
                <Text style={{ fontSize: 12, marginTop: 4, fontWeight: '600', color: '#16a34a' }}>
                  {'\u{1F6E1}\u{FE0F}'} Garansi Aktif {'\u{1F4F7}'}
                </Text>
              </TouchableOpacity>
            ) : item.warrantyStatus && item.warrantyStatus === 'SUBMITTED' && item.orderId ? (
              <TouchableOpacity onPress={() => openPhotoHistory(item.orderId!)}>
                <Text style={{ fontSize: 12, marginTop: 4, fontWeight: '600', color: '#3b82f6' }}>
                  {'\u{1F4F8}'} Menunggu Verifikasi {'\u{1F4F7}'}
                </Text>
              </TouchableOpacity>
            ) : item.warrantyStatus ? (
              <Text style={{
                fontSize: 12, marginTop: 4, fontWeight: '600',
                color: item.warrantyStatus === 'PENDING' ? '#f59e0b' : '#ef4444',
              }}>
                {item.warrantyStatus === 'PENDING' ? '\u{23F3} Garansi Menunggu Foto' : '\u{274C} Garansi Hangus'}
              </Text>
            ) : null}
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
            {(item.loginReportCount ?? 0) > 0 && (
              <TouchableOpacity onPress={() => {
                // For accounts without sub-accounts, open login reports directly
                if (!item.hasSubAccounts && item.orderId) openLoginReports(item.orderId);
              }}>
                <Text style={styles.loginReportBadge}>{'\u{26A0}\u{FE0F}'} {item.loginReportCount} komplain</Text>
              </TouchableOpacity>
            )}
            {(item.loginReportCount ?? 0) === 0 && (item.totalLoginReportCount ?? 0) > 0 && !item.hasSubAccounts && item.orderId && (
              <TouchableOpacity onPress={() => openLoginReports(item.orderId!)}>
                <Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '600', marginTop: 4 }}>{'\u{2705}'} Komplain Selesai</Text>
              </TouchableOpacity>
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
                <View style={[styles.card, {
                  borderLeftWidth: 3, borderLeftColor: cardBorderColor, backgroundColor: cardBg,
                  ...(order.warrantyStatus === 'SUBMITTED' ? { borderRightWidth: 3, borderRightColor: '#3b82f6' } : {}),
                  ...((order.loginReportCount ?? 0) > 0 ? { borderBottomWidth: 3, borderBottomColor: '#f97316' } : {}),
                }]}>
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
                  {order.status === 'WAITING_SELLER' && (
                    <TouchableOpacity
                      style={{ marginTop: 8, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
                      onPress={() => setFulfillOrderId(order.id)}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{'\u{26A1}'} Proses</Text>
                    </TouchableOpacity>
                  )}
                  {order.warrantyStatus && order.warrantyStatus === 'ACTIVE' ? (
                    <TouchableOpacity onPress={() => openPhotoHistory(order.id)}>
                      <Text style={{ fontSize: 12, marginTop: 4, fontWeight: '600', color: '#16a34a' }}>
                        {'\u{1F6E1}\u{FE0F}'} Garansi Aktif {'\u{1F4F7}'}
                      </Text>
                    </TouchableOpacity>
                  ) : order.warrantyStatus && order.warrantyStatus === 'SUBMITTED' ? (
                    <TouchableOpacity onPress={() => openPhotoHistory(order.id)}>
                      <Text style={{ fontSize: 12, marginTop: 4, fontWeight: '600', color: '#3b82f6' }}>
                        {'\u{1F4F8}'} Menunggu Verifikasi {'\u{1F4F7}'}
                      </Text>
                    </TouchableOpacity>
                  ) : order.warrantyStatus ? (
                    <Text style={{
                      fontSize: 12, marginTop: 4, fontWeight: '600',
                      color: order.warrantyStatus === 'PENDING' ? '#f59e0b' : '#ef4444',
                    }}>
                      {order.warrantyStatus === 'PENDING' ? '\u{23F3} Garansi Menunggu Foto' : '\u{274C} Garansi Hangus'}
                    </Text>
                  ) : null}
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
                  {(order.loginReportCount ?? 0) > 0 && (
                    <TouchableOpacity onPress={() => openLoginReports(order.id)}>
                      <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                        {'\u{26A0}\u{FE0F}'} {order.loginReportCount} komplain
                      </Text>
                    </TouchableOpacity>
                  )}
                  {(order.loginReportCount ?? 0) === 0 && (order.totalLoginReportCount ?? 0) > 0 && (
                    <TouchableOpacity onPress={() => openLoginReports(order.id)}>
                      <Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '600', marginTop: 4 }}>
                        {'\u{2705}'} Komplain Selesai
                      </Text>
                    </TouchableOpacity>
                  )}
                  {order.fulfilledAt && (
                    <TouchableOpacity
                      style={{ marginTop: 6, backgroundColor: '#f0f9ff', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                      onPress={() => openBuyerInfoHistory(order.id)}>
                      <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '600' }}>{'\u{1F4CB}'} Riwayat Info</Text>
                    </TouchableOpacity>
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

      {/* Login Reports Modal */}
      <Modal visible={!!loginReportOrderId} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Komplain</Text>
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
                        onPress={() => {
                          if (isManual) {
                            Alert.alert('Ganti Akun', 'Yakin ingin mengganti akun? Pembeli akan diminta kirim info baru.', [
                              { text: 'Batal', style: 'cancel' },
                              { text: 'Ganti', onPress: () => replaceStock.mutate({ orderId: loginReportOrderId!, stockId: '', stockType: 'manual' }) },
                            ]);
                          } else {
                            openReplacements(loginReportOrderId!);
                          }
                        }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{'\u{1F504}'} Ganti Akun</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            />
            <TouchableOpacity onPress={() => { setLoginReportOrderId(null); setLoginReports([]); }}>
              <Text style={[styles.cancel, { marginTop: 16 }]}>Tutup</Text>
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
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Selesaikan Komplain</Text>
            <TextInput
              style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              placeholder="Catatan penyelesaian (opsional)"
              value={resolveNote}
              onChangeText={setResolveNote}
              multiline
            />
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#16a34a' }]}
              onPress={() => resolveReportId && resolveReport.mutate({ id: resolveReportId, note: resolveNote })}
              disabled={resolveReport.isPending}>
              <Text style={styles.buttonText}>{resolveReport.isPending ? 'Menyimpan...' : 'Selesaikan'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setResolveReportId(null); setResolveNote(''); }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Buyer Info History Modal */}
      <Modal visible={!!buyerInfoHistoryOrderId} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={[styles.modalContent, { maxHeight: '80%' }]}>
            <Text style={styles.modalTitle}>Riwayat Info Pembeli</Text>
            {loadingBuyerInfoHistory ? (
              <Text style={{ textAlign: 'center', color: '#999', marginVertical: 16 }}>Memuat...</Text>
            ) : buyerInfoHistory.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#999', marginVertical: 16 }}>Belum ada riwayat info</Text>
            ) : (
              <FlatList
                data={buyerInfoHistory}
                keyExtractor={(_, i) => i.toString()}
                renderItem={({ item, index }) => (
                  <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: index === buyerInfoHistory.length - 1 ? '#2563eb' : '#d1d5db', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>{item.info}</Text>
                        <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                          {new Date(item.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => { Clipboard.setString(item.info); Alert.alert('Tersalin', 'Info telah disalin'); }}>
                        <Text style={{ fontSize: 16 }}>{'\u{1F4CB}'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            )}
            <TouchableOpacity onPress={() => { setBuyerInfoHistoryOrderId(null); setBuyerInfoHistory([]); }}>
              <Text style={[styles.cancel, { marginTop: 16 }]}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Fulfill Manual Order Modal */}
      <Modal visible={!!fulfillOrderId} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Proses Pesanan Manual</Text>
            {fulfillOrderId && (() => {
              const order = manualOrders.find(o => o.id === fulfillOrderId);
              return order?.buyerInfo ? (
                <View style={{ backgroundColor: '#f0f9ff', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>Info Pembeli:</Text>
                  <Text selectable style={{ fontSize: 14, color: '#333' }}>{order.buyerInfo}</Text>
                  <TouchableOpacity onPress={() => { Clipboard.setString(order.buyerInfo!); Alert.alert('Tersalin'); }} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#2563eb', fontSize: 12 }}>{'\u{1F4CB}'} Salin</Text>
                  </TouchableOpacity>
                </View>
              ) : null;
            })()}
            <TextInput
              style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Masukkan kredensial untuk pembeli"
              value={fulfillCredentials}
              onChangeText={setFulfillCredentials}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: '#16a34a' }]}
                onPress={() => {
                  if (!fulfillCredentials.trim()) { Alert.alert('Error', 'Kredensial tidak boleh kosong'); return; }
                  fulfillOrder.mutate({ orderId: fulfillOrderId!, credentials: fulfillCredentials.trim() });
                }}
                disabled={fulfillOrder.isPending}
              >
                <Text style={styles.buttonText}>{fulfillOrder.isPending ? 'Mengirim...' : 'Kirim Kredensial'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: '#6b7280' }]}
                onPress={() => { setFulfillOrderId(null); setFulfillCredentials(''); }}
              >
                <Text style={styles.buttonText}>Batal</Text>
              </TouchableOpacity>
            </View>
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
  warrantyBadge: { color: '#3b82f6', fontSize: 12, fontWeight: '600', marginTop: 4 },
  loginReportBadge: { color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 },
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
