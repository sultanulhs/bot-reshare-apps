import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/lib/auth';
import { router } from 'expo-router';
import axios from 'axios';

const API_URL = 'http://192.168.1.3:3000/api';

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

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    email: '',
    password: '',
    ownerName: '',
    storeName: '',
    phone: '',
    planId: '' as string | undefined,
  });
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API_URL}/auth/verify/plans`)
      .then((res) => setPlans(res.data.filter((p: Plan) => p.active)))
      .catch(() => {})
      .finally(() => setPlansLoading(false));
  }, []);

  const handleRegister = async () => {
    if (!form.email || !form.password || !form.ownerName || !form.storeName || !form.phone) {
      Alert.alert('Error', 'Semua field harus diisi');
      return;
    }
    setLoading(true);
    try {
      const result = await register({
        email: form.email,
        password: form.password,
        ownerName: form.ownerName,
        storeName: form.storeName,
        phone: form.phone,
        planId: form.planId || undefined,
      });
      router.push({
        pathname: '/(onboarding)/verify-email',
        params: { verifyToken: result.verifyToken, planId: form.planId || '' },
      });
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Daftar Penjual</Text>
      <TextInput style={styles.input} placeholder="Nama Pemilik Toko" value={form.ownerName}
        onChangeText={(v) => setForm({ ...form, ownerName: v })} />
      <TextInput style={styles.input} placeholder="Nama Toko" value={form.storeName}
        onChangeText={(v) => setForm({ ...form, storeName: v })} />
      <TextInput style={styles.input} placeholder="Email" value={form.email}
        onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="No HP" value={form.phone}
        onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
      <TextInput style={styles.input} placeholder="Password" value={form.password}
        onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />

      <Text style={styles.sectionTitle}>Pilih Paket Langganan</Text>
      {plansLoading ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : plans.length === 0 ? (
        <Text style={styles.noPlan}>Tidak ada paket tersedia</Text>
      ) : (
        plans.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[styles.planCard, form.planId === plan.id && styles.planCardSelected]}
            onPress={() => setForm({ ...form, planId: plan.id })}
          >
            <Text style={[styles.planName, form.planId === plan.id && styles.planTextSelected]}>{plan.name}</Text>
            <Text style={[styles.planPrice, form.planId === plan.id && styles.planTextSelected]}>
              {formatRupiah(plan.price)} / {plan.periodDays} hari
            </Text>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Daftar'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  container: { justifyContent: 'center', padding: 24, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  noPlan: { color: '#999', marginBottom: 12 },
  planCard: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 8,
  },
  planCardSelected: {
    borderColor: '#2563eb', backgroundColor: '#eff6ff',
  },
  planName: { fontSize: 16, fontWeight: '600' },
  planPrice: { fontSize: 14, color: '#666', marginTop: 4 },
  planTextSelected: { color: '#2563eb' },
});
