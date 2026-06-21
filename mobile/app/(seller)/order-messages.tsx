import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, BackHandler, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import api from '../../src/lib/api';

interface Message {
  id: string;
  message: string;
  createdAt: string;
}

export default function OrderMessagesScreen() {
  const { orderId, appName, durationLabel, buyerName, durationId, appId } = useLocalSearchParams<{
    orderId: string;
    appName: string;
    durationLabel: string;
    buyerName: string;
    durationId: string;
    appId: string;
  }>();

  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: messages, refetch } = useQuery<Message[]>({
    queryKey: ['order-messages', orderId],
    queryFn: () => api.get(`/seller/orders/${orderId}/messages`).then((r) => r.data),
  });

  const handleBack = useCallback(() => {
    router.push({
      pathname: '/(seller)/add-account',
      params: { durationId: durationId!, durationLabel: durationLabel!, appId: appId!, appName: appName || '', productType: 'MANUAL' },
    });
  }, [durationId, durationLabel, appId, appName]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const sendMessage = useMutation({
    mutationFn: () => api.post(`/seller/orders/${orderId}/message`, { message: messageText }),
    onSuccess: () => {
      setMessageText('');
      queryClient.invalidateQueries({ queryKey: ['order-messages', orderId] });
      Alert.alert('Berhasil', 'Pesan terkirim ke pembeli');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSend = () => {
    if (!messageText.trim()) { Alert.alert('Error', 'Pesan harus diisi'); return; }
    sendMessage.mutate();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity onPress={handleBack}>
        <Text style={styles.backBtn}>{'<-'} Kembali</Text>
      </TouchableOpacity>

      <Text style={styles.header}>Pesan ke Pembeli</Text>
      <Text style={styles.subHeader}>{appName} — {durationLabel}</Text>
      <Text style={styles.subHeader}>{buyerName}</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item, index }) => (
          <View style={[styles.msgCard, index === 0 && styles.firstMsg]}>
            {index === 0 && <Text style={styles.firstMsgLabel}>Pesan Pertama (Proses Pesanan)</Text>}
            <Text style={styles.msgText}>{item.message}</Text>
            <Text style={styles.msgDate}>{fmtDate(item.createdAt)}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada pesan</Text>}
      />

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Tulis pesan..."
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sendMessage.isPending}>
          <Text style={styles.sendBtnText}>{sendMessage.isPending ? '...' : 'Kirim'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  backBtn: { fontSize: 15, color: '#2563eb', fontWeight: '600', marginBottom: 8 },
  header: { fontSize: 20, fontWeight: 'bold' },
  subHeader: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 2 },
  msgCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6, elevation: 1 },
  firstMsg: { borderLeftWidth: 3, borderLeftColor: '#2563eb' },
  firstMsgLabel: { fontSize: 11, color: '#2563eb', fontWeight: '600', marginBottom: 4 },
  msgText: { fontSize: 14, color: '#111' },
  msgDate: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8, paddingBottom: 8 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff', maxHeight: 80 },
  sendBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { fontSize: 14, color: '#fff', fontWeight: '600' },
});
