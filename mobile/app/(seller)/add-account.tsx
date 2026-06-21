import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, Modal, BackHandler, RefreshControl, Switch,
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
  isExpired?: boolean;
  buyerTgUserId?: string | null;
  buyerName?: string | null;
  buyerUsername?: string | null;
  buyerInfo?: string | null;
  orderStatus?: string | null;
  expiresAt?: string | null;
  accessExpiresAt?: string | null;
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

  const handleSubmit = () => {
    if (!email.trim()) { Alert.alert('Error', 'Email harus diisi'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Password harus diisi'); return; }
    addAccount.mutate();
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    setEditEmail(account.email);
    setEditPassword(account.password);
  };

  const handleEditSubmit = () => {
    if (!editingAccount) return;
    if (!editEmail.trim()) { Alert.alert('Error', 'Email harus diisi'); return; }
    if (!editPassword.trim()) { Alert.alert('Error', 'Password harus diisi'); return; }
    updateAccount.mutate({
      id: editingAccount.id,
      data: { email: editEmail.trim(), password: editPassword.trim() },
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
            style={[styles.card, (item.expiredCount ?? 0) > 0 && styles.cardExpired]}
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
            {(item.expiredCount ?? 0) > 0 && (
              <Text style={styles.expiredBadge}>{item.expiredCount} kadaluarsa</Text>
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
      {manualOrders.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Pesanan Manual</Text>
          {manualOrders.map((order) => {
            const statusColors: Record<string, string> = {
              FULFILLED: '#16a34a', PENDING: '#f59e0b', WAITING_SELLER: '#f59e0b',
              EXPIRED: '#ef4444', FAILED: '#ef4444',
            };
            const buyerLabel = order.buyerName
              ? `${order.buyerName}${order.buyerUsername ? ` (@${order.buyerUsername})` : ''}`
              : `@${order.buyerTgUserId}`;
            const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
            return (
              <View key={order.id} style={[styles.card, { borderLeftWidth: 3, borderLeftColor: statusColors[order.status] || '#999' }]}>
                <View style={styles.cardRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardEmail}>👤 {buyerLabel}</Text>
                    {order.buyerInfo && <Text style={styles.cardPass}>📋 {order.buyerInfo}</Text>}
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
              </View>
            );
          })}
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
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
