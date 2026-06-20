import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import axios from 'axios';

const API_URL = 'http://192.168.1.3:3000/api';

export default function VerifyPhoneScreen() {
  const { verifyToken, planId } = useLocalSearchParams<{ verifyToken: string; planId?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [openingTelegram, setOpeningTelegram] = useState(false);

  const handleOpenTelegram = async () => {
    setOpeningTelegram(true);
    try {
      const { data } = await axios.post(`${API_URL}/auth/verify/phone/start`, { verifyToken });
      await Linking.openURL(data.deepLink);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal membuka Telegram');
    }
    setOpeningTelegram(false);
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Masukkan kode 6 digit');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/verify/phone`, { verifyToken, code });
      router.push({
        pathname: '/(onboarding)/subscription-payment',
        params: { verifyToken, planId: planId || '' },
      });
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Kode tidak valid');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verifikasi No HP</Text>
      <Text style={styles.subtitle}>Buka Telegram untuk menerima kode OTP</Text>

      <TouchableOpacity style={styles.telegramButton} onPress={handleOpenTelegram} disabled={openingTelegram}>
        <Text style={styles.telegramText}>{openingTelegram ? 'Membuka...' : 'Buka Telegram'}</Text>
      </TouchableOpacity>

      <Text style={styles.divider}>Masukkan kode OTP dari Telegram</Text>

      <TextInput
        style={styles.input}
        placeholder="000000"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        textAlign="center"
      />
      <TouchableOpacity style={styles.button} onPress={handleVerify} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Verifikasi'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  telegramButton: { backgroundColor: '#0088cc', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 24 },
  telegramText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  divider: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 24, letterSpacing: 8, marginBottom: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
