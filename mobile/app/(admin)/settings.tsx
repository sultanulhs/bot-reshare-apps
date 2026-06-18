import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import api from '../../src/lib/api';

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

  const [markupForm, setMarkupForm] = useState({ markupMode: 'FIXED', markupValue: '0', markupMin: '0', markupMax: '0' });
  const [welcomeText, setWelcomeText] = useState('');

  useEffect(() => {
    if (markup) setMarkupForm({
      markupMode: markup.markupMode,
      markupValue: String(markup.markupValue ?? 0),
      markupMin: String(markup.markupMin ?? 0),
      markupMax: String(markup.markupMax ?? 0),
    });
    if (botconfig) setWelcomeText(botconfig.welcomeText || '');
  }, [markup, botconfig]);

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
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
