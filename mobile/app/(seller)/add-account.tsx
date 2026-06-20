import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import api from '../../src/lib/api';

interface Account {
  id: string;
  email: string;
  password: string;
  status: string;
  subAccountCount: number;
  createdAt: string;
}

interface SubAccount {
  id: string;
  name: string;
  pin: string;
  status: string;
  createdAt: string;
}

export default function AddAccountScreen() {
  const { durationId, durationLabel, productType } = useLocalSearchParams<{
    durationId: string;
    durationLabel: string;
    productType: string;
  }>();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [subForm, setSubForm] = useState<{ [accountId: string]: { name: string; pin: string } }>({});

  const { data: accounts, isLoading } = useQuery<Account[]>({
    queryKey: ['seller-accounts', durationId],
    queryFn: () => api.get(`/seller/durations/${durationId}/accounts`).then((r) => r.data),
  });

  const addAccount = useMutation({
    mutationFn: () =>
      api.post(`/seller/durations/${durationId}/accounts`, { email, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      setEmail('');
      setPassword('');
      Alert.alert('Berhasil', 'Akun berhasil ditambahkan');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleAddAccount = () => {
    if (!email.trim()) { Alert.alert('Error', 'Email harus diisi'); return; }
    if (!password.trim()) { Alert.alert('Error', 'Password harus diisi'); return; }
    addAccount.mutate();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.header}>{durationLabel}</Text>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Tambah Akun Baru</Text>
        <TextInput style={styles.input} placeholder="Email" value={email}
          onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Password" value={password}
          onChangeText={setPassword} />
        <TouchableOpacity style={styles.button} onPress={handleAddAccount} disabled={addAccount.isPending}>
          <Text style={styles.buttonText}>{addAccount.isPending ? 'Menyimpan...' : 'Tambah Akun'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Daftar Akun ({accounts?.length ?? 0})</Text>

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AccountCard
            account={item}
            expanded={expandedAccount === item.id}
            onToggle={() => setExpandedAccount(expandedAccount === item.id ? null : item.id)}
            subForm={subForm[item.id] || { name: '', pin: '' }}
            onSubFormChange={(f) => setSubForm({ ...subForm, [item.id]: f })}
            durationId={durationId}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada akun'}</Text>
        }
      />
    </View>
  );
}

function AccountCard({
  account, expanded, onToggle, subForm, onSubFormChange, durationId,
}: {
  account: Account;
  expanded: boolean;
  onToggle: () => void;
  subForm: { name: string; pin: string };
  onSubFormChange: (f: { name: string; pin: string }) => void;
  durationId: string;
}) {
  const queryClient = useQueryClient();

  const { data: subAccounts, isLoading: subLoading } = useQuery<SubAccount[]>({
    queryKey: ['seller-sub-accounts', account.id],
    queryFn: () => api.get(`/seller/accounts/${account.id}/sub-accounts`).then((r) => r.data),
    enabled: expanded,
  });

  const addSubAccount = useMutation({
    mutationFn: () =>
      api.post(`/seller/accounts/${account.id}/sub-accounts`, { name: subForm.name, pin: subForm.pin }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', account.id] });
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      onSubFormChange({ name: '', pin: '' });
      Alert.alert('Berhasil', 'Sub-akun berhasil ditambahkan');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleAddSub = () => {
    if (!subForm.name.trim()) { Alert.alert('Error', 'Nama sub-akun harus diisi'); return; }
    if (!subForm.pin.trim()) { Alert.alert('Error', 'PIN harus diisi'); return; }
    addSubAccount.mutate();
  };

  const statusColor = account.status === 'AVAILABLE' ? '#16a34a' : account.status === 'SOLD' ? '#ef4444' : '#f59e0b';

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onToggle}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardEmail}>{account.email}</Text>
            <Text style={styles.cardPassword}>{account.password}</Text>
          </View>
          <View style={styles.cardRight}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{account.status}</Text>
            </View>
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>
          {account.subAccountCount} sub-akun | {new Date(account.createdAt).toLocaleDateString('id-ID')}
        </Text>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.subSection}>
          <View style={styles.subForm}>
            <Text style={styles.subFormTitle}>Tambah Sub-Akun</Text>
            <TextInput style={styles.subInput} placeholder="Nama profil / sub-akun"
              value={subForm.name} onChangeText={(v) => onSubFormChange({ ...subForm, name: v })} />
            <TextInput style={styles.subInput} placeholder="PIN"
              value={subForm.pin} onChangeText={(v) => onSubFormChange({ ...subForm, pin: v })} keyboardType="numeric" />
            <TouchableOpacity style={styles.subButton} onPress={handleAddSub} disabled={addSubAccount.isPending}>
              <Text style={styles.subButtonText}>{addSubAccount.isPending ? 'Menyimpan...' : 'Tambah Sub-Akun'}</Text>
            </TouchableOpacity>
          </View>

          {subLoading ? (
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
          ) : subAccounts && subAccounts.length > 0 ? (
            subAccounts.map((sub) => {
              const subStatusColor = sub.status === 'AVAILABLE' ? '#16a34a' : sub.status === 'SOLD' ? '#ef4444' : '#f59e0b';
              return (
                <View key={sub.id} style={styles.subItem}>
                  <View style={styles.subItemRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subItemName}>{sub.name}</Text>
                      <Text style={styles.subItemPin}>PIN: {sub.pin}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: subStatusColor }]}>
                      <Text style={styles.statusText}>{sub.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.subEmpty}>Belum ada sub-akun</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  backBtn: { marginBottom: 12 },
  backBtnText: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  header: { fontSize: 20, fontWeight: 'bold', marginBottom: 16 },
  formCard: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 16, elevation: 1 },
  formTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 10 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardEmail: { fontSize: 15, fontWeight: '600', color: '#111' },
  cardPassword: { fontSize: 13, color: '#666', marginTop: 2 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  expandIcon: { fontSize: 12, color: '#888' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 6 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  subSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  subForm: { marginBottom: 12 },
  subFormTitle: { fontSize: 13, fontWeight: '600', color: '#333', marginBottom: 8 },
  subInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 6, padding: 10, marginBottom: 8, fontSize: 13 },
  subButton: { backgroundColor: '#10b981', borderRadius: 6, padding: 10, alignItems: 'center' },
  subButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  subItem: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginTop: 6 },
  subItemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subItemName: { fontSize: 14, fontWeight: '600', color: '#111' },
  subItemPin: { fontSize: 12, color: '#666', marginTop: 2 },
  subEmpty: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 8 },
});
