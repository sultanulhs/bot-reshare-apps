import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import api from '../../src/lib/api';

export default function SellersScreen() {
  const queryClient = useQueryClient();
  const { data: sellers } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => api.get('/admin/sellers').then((r) => r.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/verify-profile`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/suspend`, { reason: 'Admin action' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const statusColor: Record<string, string> = {
    PENDING: '#f59e0b', APPROVED: '#3b82f6', PROFILE_SUBMITTED: '#8b5cf6', ACTIVE: '#16a34a', SUSPENDED: '#ef4444',
  };

  return (
    <FlatList
      style={styles.container}
      data={sellers}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={[styles.badge, { backgroundColor: statusColor[item.status] || '#999' }]}>{item.status}</Text>
          </View>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.actions}>
            {item.status === 'PENDING' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => approve.mutate(item.id)}>
                <Text style={styles.actionText}>Approve</Text>
              </TouchableOpacity>
            )}
            {item.status === 'PROFILE_SUBMITTED' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => verify.mutate(item.id)}>
                <Text style={styles.actionText}>Verifikasi</Text>
              </TouchableOpacity>
            )}
            {item.status !== 'SUSPENDED' && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fecaca' }]} onPress={() =>
                Alert.alert('Suspend', `Suspend ${item.name}?`, [
                  { text: 'Batal' },
                  { text: 'Ya', onPress: () => suspend.mutate(item.id) },
                ])
              }>
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Suspend</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  email: { fontSize: 13, color: '#666', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { backgroundColor: '#dbeafe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionText: { fontSize: 13, fontWeight: '500', color: '#2563eb' },
});
