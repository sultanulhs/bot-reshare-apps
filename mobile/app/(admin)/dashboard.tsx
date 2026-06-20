import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function DashboardScreen() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    router.replace('/login');
  };
  const { data: stats, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <Text style={styles.title}>Dashboard Admin</Text>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.orders?.total ?? 0}</Text>
          <Text style={styles.statLabel}>Total Order</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.orders?.fulfilled ?? 0}</Text>
          <Text style={styles.statLabel}>Terpenuhi</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Rp{(stats?.revenue?.operatorMarkup ?? 0).toLocaleString('id-ID')}</Text>
          <Text style={styles.statLabel}>Markup</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Rp{(stats?.revenue?.subscriptionFees ?? 0).toLocaleString('id-ID')}</Text>
          <Text style={styles.statLabel}>Langganan</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '48%', elevation: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
