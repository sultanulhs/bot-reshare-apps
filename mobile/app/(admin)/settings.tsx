import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { useState, useEffect } from 'react';
import api from '../../src/lib/api';

interface Plan {
  id?: string;
  name: string;
  price: number;
  periodDays: number;
  active: boolean;
}

function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID');
}

export default function SettingsScreen() {
  const queryClient = useQueryClient();

  const { data: markup } = useQuery({
    queryKey: ['admin-markup'],
    queryFn: () => api.get('/admin/markup').then((r) => r.data),
  });

  const { data: botconfig } = useQuery({
    queryKey: ['admin-botconfig'],
    queryFn: () => api.get('/admin/botconfig').then((r) => r.data),
  });

  const { data: plansData } = useQuery({
    queryKey: ['admin-subscription-plans'],
    queryFn: () => api.get('/admin/subscription-plans').then((r) => r.data),
  });

  const [markupForm, setMarkupForm] = useState({ markupMode: 'FIXED', markupValue: '0', markupMin: '0', markupMax: '0' });
  const [welcomeText, setWelcomeText] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);

  useEffect(() => {
    if (markup) setMarkupForm({
      markupMode: markup.markupMode,
      markupValue: String(markup.markupValue ?? 0),
      markupMin: String(markup.markupMin ?? 0),
      markupMax: String(markup.markupMax ?? 0),
    });
    if (botconfig) setWelcomeText(botconfig.welcomeText || '');
  }, [markup, botconfig]);

  useEffect(() => {
    if (plansData && Array.isArray(plansData)) {
      setPlans(plansData);
    }
  }, [plansData]);

  const saveMarkup = useMutation({
    mutationFn: () => api.put('/admin/markup', {
      markupMode: markupForm.markupMode,
      markupValue: parseInt(markupForm.markupValue) || 0,
      markupMin: parseInt(markupForm.markupMin) || 0,
      markupMax: parseInt(markupForm.markupMax) || 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-markup'] }); Alert.alert('Tersimpan'); },
  });

  const saveBotConfig = useMutation({
    mutationFn: () => api.put('/admin/botconfig', { welcomeText }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-botconfig'] }); Alert.alert('Tersimpan'); },
  });

  const savePlans = useMutation({
    mutationFn: () => api.put('/admin/subscription-plans', { plans }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-subscription-plans'] }); Alert.alert('Tersimpan'); },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Gagal menyimpan paket'),
  });

  const addPlan = () => {
    setPlans([...plans, { name: '', price: 0, periodDays: 30, active: true }]);
  };

  const updatePlan = (index: number, field: keyof Plan, value: string | number | boolean) => {
    const updated = [...plans];
    (updated[index] as any)[field] = value;
    setPlans(updated);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.section}>Markup Operator</Text>
      <View style={styles.card}>
        <View style={styles.modeRow}>
          {['FIXED', 'RANDOM'].map((m) => (
            <TouchableOpacity key={m} style={[styles.modeBtn, markupForm.markupMode === m && styles.modeBtnActive]}
              onPress={() => setMarkupForm({ ...markupForm, markupMode: m })}>
              <Text style={markupForm.markupMode === m ? styles.modeTxtActive : styles.modeTxt}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {markupForm.markupMode === 'FIXED' ? (
          <TextInput style={styles.input} placeholder="Nilai markup (Rp)" value={markupForm.markupValue}
            onChangeText={(v) => setMarkupForm({ ...markupForm, markupValue: v })} keyboardType="numeric" />
        ) : (
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Min" value={markupForm.markupMin}
              onChangeText={(v) => setMarkupForm({ ...markupForm, markupMin: v })} keyboardType="numeric" />
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Max" value={markupForm.markupMax}
              onChangeText={(v) => setMarkupForm({ ...markupForm, markupMax: v })} keyboardType="numeric" />
          </View>
        )}
        <TouchableOpacity style={styles.button} onPress={() => saveMarkup.mutate()}>
          <Text style={styles.buttonText}>Simpan Markup</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Konfigurasi Bot</Text>
      <View style={styles.card}>
        <TextInput style={[styles.input, { height: 80 }]} placeholder="Teks sambutan" value={welcomeText}
          onChangeText={setWelcomeText} multiline />
        <TouchableOpacity style={styles.button} onPress={() => saveBotConfig.mutate()}>
          <Text style={styles.buttonText}>Simpan Bot Config</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.section}>Paket Langganan</Text>
      {plans.map((plan, index) => (
        <View key={index} style={styles.card}>
          <TextInput style={styles.input} placeholder="Nama paket" value={plan.name}
            onChangeText={(v) => updatePlan(index, 'name', v)} />
          <TextInput style={styles.input} placeholder="Harga (Rp)" value={String(plan.price)}
            onChangeText={(v) => updatePlan(index, 'price', parseInt(v) || 0)} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Periode (hari)" value={String(plan.periodDays)}
            onChangeText={(v) => updatePlan(index, 'periodDays', parseInt(v) || 0)} keyboardType="numeric" />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Aktif</Text>
            <Switch value={plan.active} onValueChange={(v) => updatePlan(index, 'active', v)} />
          </View>
          {plan.price > 0 && (
            <Text style={styles.pricePreview}>{formatRupiah(plan.price)} / {plan.periodDays} hari</Text>
          )}
        </View>
      ))}
      <TouchableOpacity style={styles.addButton} onPress={addPlan}>
        <Text style={styles.addButtonText}>+ Tambah Paket</Text>
      </TouchableOpacity>
      {plans.length > 0 && (
        <TouchableOpacity style={styles.button} onPress={() => savePlans.mutate()}>
          <Text style={styles.buttonText}>Simpan Paket</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 48 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6, backgroundColor: '#f0f0f0' },
  modeBtnActive: { backgroundColor: '#2563eb' },
  modeTxt: { color: '#666' },
  modeTxtActive: { color: '#fff', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  switchLabel: { fontSize: 14, color: '#333' },
  addButton: { borderWidth: 1, borderColor: '#2563eb', borderStyle: 'dashed', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 8 },
  addButtonText: { color: '#2563eb', fontWeight: '600' },
  pricePreview: { fontSize: 12, color: '#999', fontStyle: 'italic' },
});
