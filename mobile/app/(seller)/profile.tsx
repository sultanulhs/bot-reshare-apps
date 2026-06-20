import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.replace('/login');
  };
  const { data: me } = useQuery({
    queryKey: ['seller-me'],
    queryFn: () => api.get('/seller/me').then((r) => r.data),
  });

  const { data: subscription } = useQuery({
    queryKey: ['seller-subscription'],
    queryFn: () => api.get('/seller/subscription').then((r) => r.data),
  });

  const { data: storeLink } = useQuery({
    queryKey: ['seller-store-link'],
    queryFn: () => api.get('/seller/store-link').then((r) => r.data).catch(() => null),
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{me?.ownerName || me?.name}</Text>
        <Text style={styles.storeName}>{me?.storeName}</Text>
        <Text style={styles.email}>{me?.email}</Text>
        <Text style={styles.status}>Status: {me?.status}</Text>
      </View>

      {me?.status === 'APPROVED' && (
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => router.push('/(seller)/submit-profile')}
        >
          <Text style={styles.profileButtonText}>Lengkapi Profil Pembayaran</Text>
        </TouchableOpacity>
      )}

      {me?.status === 'PROFILE_SUBMITTED' && (
        <View style={styles.card}>
          <Text style={styles.waitingText}>Menunggu verifikasi admin</Text>
        </View>
      )}

      {me?.status === 'ACTIVE' && storeLink && (
        <View style={styles.card}>
          <Text style={styles.label}>Link Toko</Text>
          <Text style={styles.link} selectable>{storeLink.url}</Text>
        </View>
      )}

      {me?.status === 'ACTIVE' && (
        <View style={styles.card}>
          <Text style={styles.label}>Kode Toko</Text>
          <Text style={styles.storeCode} selectable>{me?.storeCode}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Langganan</Text>
        <Text>{subscription?.status === 'ACTIVE'
          ? `Aktif sampai ${new Date(subscription.expiresAt).toLocaleDateString('id-ID')}`
          : subscription?.status || 'Tidak ada'
        }</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: 'bold' },
  storeName: { fontSize: 16, color: '#333', marginTop: 2 },
  email: { fontSize: 14, color: '#666' },
  status: { fontSize: 14, color: '#2563eb', marginTop: 4 },
  label: { fontSize: 12, color: '#999', marginBottom: 4 },
  link: { fontSize: 14, color: '#2563eb' },
  storeCode: { fontSize: 16, fontWeight: '600', color: '#333' },
  profileButton: { backgroundColor: '#f59e0b', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 12 },
  profileButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  waitingText: { color: '#f59e0b', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
