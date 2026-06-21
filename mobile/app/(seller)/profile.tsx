import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, RefreshControl, Clipboard } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

interface Plan {
  id: string;
  name: string;
  price: number;
  periodDays: number;
  active: boolean;
}

function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

export default function ProfileScreen() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [storeCodeInput, setStoreCodeInput] = useState('');
  const [storeCodeLoading, setStoreCodeLoading] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.replace('/login');
  };

  const { data: me, refetch: refetchMe } = useQuery({
    queryKey: ['seller-me'],
    queryFn: () => api.get('/seller/me').then((r) => r.data),
  });

  const { data: subscription, refetch: refetchSub } = useQuery({
    queryKey: ['seller-subscription'],
    queryFn: () => api.get('/seller/subscription').then((r) => r.data),
  });

  const { data: storeLink } = useQuery({
    queryKey: ['seller-store-link'],
    queryFn: () => api.get('/seller/store-link').then((r) => r.data).catch(() => null),
    enabled: !!me?.storeCode,
  });

  const { data: plans } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => api.get('/auth/verify/plans').then((r) => r.data.filter((p: Plan) => p.active)),
    enabled: !subscription || subscription.status !== 'ACTIVE',
  });

  const handleSetStoreCode = async () => {
    if (!storeCodeInput.trim()) {
      Alert.alert('Error', 'Kode toko harus diisi');
      return;
    }
    setStoreCodeLoading(true);
    try {
      await api.post('/seller/store-code', { storeCode: storeCodeInput.trim() });
      Alert.alert('Berhasil', 'Kode toko berhasil disimpan');
      refetchMe();
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setStoreCodeLoading(false);
  };

  const handleCheckout = () => {
    if (!selectedPlanId) {
      Alert.alert('Error', 'Pilih paket langganan terlebih dahulu');
      return;
    }
    const selectedPlan = plans?.find((p: Plan) => p.id === selectedPlanId);
    router.push({
      pathname: '/(seller)/subscription-payment',
      params: { planId: selectedPlanId, planName: selectedPlan?.name || 'Langganan' },
    });
  };

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetchMe(),
      refetchSub(),
      queryClient.invalidateQueries({ queryKey: ['seller-store-link'] }),
      queryClient.invalidateQueries({ queryKey: ['subscription-plans'] }),
    ]);
    setRefreshing(false);
  }, [refetchMe, refetchSub, queryClient]);

  const canSetStoreCode = me && ['APPROVED', 'PROFILE_SUBMITTED', 'ACTIVE'].includes(me.status);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Seller Info Card */}
      <View style={styles.card}>
        <Text style={styles.name}>{me?.ownerName}</Text>
        <Text style={styles.storeName}>{me?.storeName}</Text>
        <Text style={styles.email}>{me?.email}</Text>
        <Text style={styles.phone}>{me?.phone}</Text>
        <Text style={styles.status}>Status: {me?.status}</Text>
      </View>

      {/* Verifikasi Akun */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Verifikasi Akun</Text>
        <View style={styles.verifyRow}>
          <Text style={styles.verifyLabel}>Email:</Text>
          {me?.emailVerified ? (
            <Text style={styles.verified}>Terverifikasi</Text>
          ) : (
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => router.push('/(seller)/verify-email')}
            >
              <Text style={styles.verifyButtonText}>Verifikasi Email</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.verifyRow}>
          <Text style={styles.verifyLabel}>HP:</Text>
          {me?.phoneVerified ? (
            <Text style={styles.verified}>Terverifikasi</Text>
          ) : (
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={() => router.push('/(seller)/verify-phone')}
            >
              <Text style={styles.verifyButtonText}>Verifikasi HP</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Store Code */}
      {canSetStoreCode && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Kode Toko</Text>
          {me?.storeCode ? (
            <>
              <Text style={styles.storeCode} selectable>{me.storeCode}</Text>
              {storeLink && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[styles.link, { flex: 1 }]} selectable>{storeLink.url}</Text>
                  <TouchableOpacity onPress={() => { Clipboard.setString(storeLink.url); Alert.alert('Tersalin', 'Link toko telah disalin'); }}>
                    <Text style={{ fontSize: 18 }}>📋</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <View>
              <TextInput
                style={styles.input}
                placeholder="Masukkan kode toko (huruf, angka, _ -)"
                value={storeCodeInput}
                onChangeText={setStoreCodeInput}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSetStoreCode}
                disabled={storeCodeLoading}
              >
                <Text style={styles.saveButtonText}>
                  {storeCodeLoading ? 'Menyimpan...' : 'Simpan'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Profile Submission */}
      {me?.status === 'APPROVED' && (
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/(seller)/submit-profile')}
        >
          <Text style={styles.profileButtonText}>Lengkapi Profil</Text>
        </TouchableOpacity>
      )}

      {me?.status === 'PROFILE_SUBMITTED' && (
        <View style={styles.card}>
          <Text style={styles.waitingText}>Menunggu verifikasi admin</Text>
        </View>
      )}

      {/* Subscription */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Langganan</Text>
        {subscription?.status === 'ACTIVE' ? (
          <Text>Aktif sampai {new Date(subscription.expiresAt).toLocaleDateString('id-ID')}</Text>
        ) : (
          <View>
            <Text style={styles.noSub}>Tidak ada langganan aktif</Text>
            {plans && plans.length > 0 && (
              <>
                {plans.map((plan: Plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={[styles.planCard, selectedPlanId === plan.id && styles.planCardSelected]}
                    onPress={() => setSelectedPlanId(plan.id)}
                  >
                    <Text style={[styles.planName, selectedPlanId === plan.id && styles.planTextSelected]}>
                      {plan.name}
                    </Text>
                    <Text style={[styles.planPrice, selectedPlanId === plan.id && styles.planTextSelected]}>
                      {formatRupiah(plan.price)} / {plan.periodDays} hari
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.checkoutButton}
                  onPress={handleCheckout}
                  disabled={false}
                >
                  <Text style={styles.checkoutButtonText}>
                    {'Bayar Langganan'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f5f5f5' },
  container: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: 'bold' },
  storeName: { fontSize: 16, color: '#333', marginTop: 2 },
  email: { fontSize: 14, color: '#666' },
  phone: { fontSize: 14, color: '#666', marginTop: 2 },
  status: { fontSize: 14, color: '#2563eb', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  verifyLabel: { fontSize: 14, color: '#333' },
  verified: { fontSize: 14, color: '#16a34a', fontWeight: '600' },
  verifyButton: { backgroundColor: '#2563eb', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 },
  verifyButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  storeCode: { fontSize: 16, fontWeight: '600', color: '#333' },
  link: { fontSize: 14, color: '#2563eb', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 8 },
  saveButton: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
  profileButton: { backgroundColor: '#f59e0b', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 12 },
  profileButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  waitingText: { color: '#f59e0b', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  noSub: { color: '#999', marginBottom: 8 },
  planCard: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 8 },
  planCardSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  planName: { fontSize: 16, fontWeight: '600' },
  planPrice: { fontSize: 14, color: '#666', marginTop: 4 },
  planTextSelected: { color: '#2563eb' },
  checkoutButton: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  checkoutButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
