import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import axios from 'axios';

const API_URL = 'http://192.168.1.3:3000/api';

export default function VerifyEmailScreen() {
  const { verifyToken, planId } = useLocalSearchParams<{ verifyToken: string; planId?: string }>();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Masukkan kode 6 digit');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/auth/verify/email`, { verifyToken, code });
      router.push({
        pathname: '/(onboarding)/verify-phone',
        params: { verifyToken, planId: planId || '' },
      });
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Kode tidak valid');
    }
    setLoading(false);
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await axios.post(`${API_URL}/auth/verify/email/resend`, { verifyToken });
      Alert.alert('Berhasil', 'Kode OTP telah dikirim ulang');
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Gagal mengirim ulang');
    }
    setResending(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verifikasi Email</Text>
      <Text style={styles.subtitle}>Masukkan kode OTP yang dikirim ke email Anda</Text>
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
      <TouchableOpacity style={styles.resendButton} onPress={handleResend} disabled={resending}>
        <Text style={styles.resendText}>{resending ? 'Mengirim...' : 'Kirim Ulang'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, fontSize: 24, letterSpacing: 8, marginBottom: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resendButton: { alignItems: 'center', padding: 8 },
  resendText: { color: '#2563eb', fontSize: 14 },
});
