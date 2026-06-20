import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import api from '../../src/lib/api';

interface Account {
  id: string;
  status: string;
  subAccountCount: number;
  createdAt: string;
}

interface SubAccount {
  id: string;
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
    if (!email.trim()) {
      Alert.alert('Error', 'Email harus diisi');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Error', 'Password harus diisi');
      return;
    }
    addAccount.mutate();
  };

  const showSubAkun = productType === 'AKUN_READY';

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{durationLabel}</Text>
      <Text style={styles.subHeader}>Tambah Akun</Text>

      <View style={styles.formCard}>
        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <Text style={styles.note}>Kredensial akan dienkripsi dan tidak bisa dilihat kembali.</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handleAddAccount}
          disabled={addAccount.isPending}
        >
          <Text style={styles.buttonText}>
            {addAccount.isPending ? 'Menyimpan...' : 'Tambah Akun'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Daftar Akun</Text>

      <FlatList
        data={accounts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AccountCard
            account={item}
            showSubAkun={showSubAkun}
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
  account,
  showSubAkun,
  expanded,
  onToggle,
  subForm,
  onSubFormChange,
  durationId,
}: {
  account: Account;
  showSubAkun: boolean;
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
    enabled: expanded && showSubAkun,
  });

  const addSubAccount = useMutation({
    mutationFn: () =>
      api.post(`/seller/accounts/${account.id}/sub-accounts`, {
        name: subForm.name,
        pin: subForm.pin,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-sub-accounts', account.id] });
      queryClient.invalidateQueries({ queryKey: ['seller-accounts', durationId] });
      onSubFormChange({ name: '', pin: '' });
      Alert.alert('Berhasil', 'Sub-akun berhasil ditambahkan');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleAddSub = () => {
    if (!subForm.name.trim()) {
      Alert.alert('Error', 'Nama sub-akun harus diisi');
      return;
    }
    if (!subForm.pin.trim()) {
      Alert.alert('Error', 'PIN harus diisi');
      return;
    }
    addSubAccount.mutate();
  };

  const createdDate = new Date(account.createdAt).toLocaleDateString('id-ID');

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={showSubAkun ? onToggle : undefined}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Akun #{account.id.slice(-6)}</Text>
            <Text style={styles.cardMeta}>
              Status: {account.status} | {createdDate}
            </Text>
            {showSubAkun && (
              <Text style={styles.cardMeta}>{account.subAccountCount} sub-akun</Text>
            )}
          </View>
          {showSubAkun && (
            <Text style={styles.expandIcon}>{expanded ? '▲' : '▼'}</Text>
          )}
        </View>
      </TouchableOpacity>

      {expanded && showSubAkun && (
        <View style={styles.subSection}>
          <View style={styles.subForm}>
            <TextInput
              style={styles.subInput}
              placeholder="Nama sub-akun"
              value={subForm.name}
              onChangeText={(v) => onSubFormChange({ ...subForm, name: v })}
            />
            <TextInput
              style={styles.subInput}
              placeholder="PIN"
              value={subForm.pin}
              onChangeText={(v) => onSubFormChange({ ...subForm, pin: v })}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.subButton}
              onPress={handleAddSub}
              disabled={addSubAccount.isPending}
            >
              <Text style={styles.subButtonText}>
                {addSubAccount.isPending ? 'Menyimpan...' : 'Tambah Sub-Akun'}
              </Text>
            </TouchableOpacity>
          </View>

          {subLoading ? (
            <ActivityIndicator size="small" style={{ marginTop: 8 }} />
          ) : (
            subAccounts?.map((sub) => (
              <View key={sub.id} style={styles.subItem}>
                <Text style={styles.subItemText}>Sub-akun #{sub.id.slice(-6)}</Text>
                <Text style={styles.subItemMeta}>
                  {sub.status} | {new Date(sub.createdAt).toLocaleDateString('id-ID')}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  header: { fontSize: 20, fontWeight: 'bold' },
  subHeader: { fontSize: 14, color: '#666', marginBottom: 16 },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  note: { fontSize: 12, color: '#999', marginBottom: 12 },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  expandIcon: { fontSize: 12, color: '#888' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  subSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  subForm: { marginBottom: 8 },
  subInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
    fontSize: 13,
  },
  subButton: {
    backgroundColor: '#10b981',
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  subButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  subItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    padding: 10,
    marginTop: 6,
  },
  subItemText: { fontSize: 13, fontWeight: '500' },
  subItemMeta: { fontSize: 11, color: '#888', marginTop: 2 },
});
