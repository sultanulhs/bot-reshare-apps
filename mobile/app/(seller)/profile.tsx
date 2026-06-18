import { useQuery } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function ProfileScreen() {
  const { logout } = useAuth();
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
        <Text style={styles.name}>{me?.name}</Text>
        <Text style={styles.email}>{me?.email}</Text>
        <Text style={styles.status}>Status: {me?.status}</Text>
      </View>

      {storeLink && (
        <View style={styles.card}>
          <Text style={styles.label}>Link Toko</Text>
          <Text style={styles.link} selectable>{storeLink.url}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Langganan</Text>
        <Text>{subscription?.status === 'ACTIVE'
          ? `Aktif sampai ${new Date(subscription.expiresAt).toLocaleDateString('id-ID')}`
          : subscription?.status || 'Tidak ada'
        }</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: 'bold' },
  email: { fontSize: 14, color: '#666' },
  status: { fontSize: 14, color: '#2563eb', marginTop: 4 },
  label: { fontSize: 12, color: '#999', marginBottom: 4 },
  link: { fontSize: 14, color: '#2563eb' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
