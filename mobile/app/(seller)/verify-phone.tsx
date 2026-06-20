import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/lib/api';

export default function VerifyPhoneScreen() {
  const [code, setCode] = useState('');
  const [startLoading, setStartLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [started, setStarted] = useState(false);

  const handleOpenTelegram = async () => {
    setStartLoading(true);
    try {
      const { data } = await api.post('/seller/verify/phone/start');
      setStarted(true);
      await Linking.openURL(data.deepLink);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setStartLoading(false);
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Masukkan kode OTP 6 digit');
      return;
    }
    setVerifyLoading(true);
    try {
      await api.post('/seller/verify/phone', { code });
      Alert.alert('Berhasil', 'Nomor telepon berhasil diverifikasi', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setVerifyLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verifikasi HP</Text>
      <Text style={styles.description}>
        Buka Telegram untuk memulai verifikasi, lalu masukkan kode OTP yang diberikan bot.
      </Text>

      <TouchableOpacity
        style={styles.telegramButton}
        onPress={handleOpenTelegram}
        disabled={startLoading}
      >
        <Text style={styles.telegramButtonText}>
          {startLoading ? 'Memproses...' : 'Buka Telegram'}
        </Text>
      </TouchableOpacity>

      {started && (
        <>
          <Text style={styles.hint}>
            Setelah membuka Telegram dan mendapat kode OTP, masukkan di bawah:
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Masukkan kode OTP 6 digit"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          <TouchableOpacity
            style={styles.verifyButton}
            onPress={handleVerify}
            disabled={verifyLoading}
          >
            <Text style={styles.verifyButtonText}>
              {verifyLoading ? 'Memverifikasi...' : 'Verifikasi'}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8 },
  description: { fontSize: 14, color: '#666', marginBottom: 24 },
  telegramButton: { backgroundColor: '#0088cc', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 20 },
  telegramButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, color: '#666', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center', letterSpacing: 8, marginBottom: 16 },
  verifyButton: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center' },
  verifyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
