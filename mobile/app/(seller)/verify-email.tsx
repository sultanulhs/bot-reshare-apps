import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import api from '../../src/lib/api';

export default function VerifyEmailScreen() {
  const [code, setCode] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const handleSendOtp = async () => {
    setSendLoading(true);
    try {
      await api.post('/seller/verify/email/send');
      setOtpSent(true);
      Alert.alert('Berhasil', 'Kode OTP telah dikirim ke email Anda');
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setSendLoading(false);
  };

  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      Alert.alert('Error', 'Masukkan kode OTP 6 digit');
      return;
    }
    setVerifyLoading(true);
    try {
      await api.post('/seller/verify/email', { code });
      Alert.alert('Berhasil', 'Email berhasil diverifikasi', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setVerifyLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verifikasi Email</Text>
      <Text style={styles.description}>
        Kirim kode OTP ke email Anda, lalu masukkan kode yang diterima.
      </Text>

      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSendOtp}
        disabled={sendLoading}
      >
        <Text style={styles.sendButtonText}>
          {sendLoading ? 'Mengirim...' : otpSent ? 'Kirim Ulang Kode OTP' : 'Kirim Kode OTP'}
        </Text>
      </TouchableOpacity>

      {otpSent && (
        <>
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
  sendButton: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 20 },
  sendButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 18, textAlign: 'center', letterSpacing: 8, marginBottom: 16 },
  verifyButton: { backgroundColor: '#16a34a', borderRadius: 8, padding: 14, alignItems: 'center' },
  verifyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
