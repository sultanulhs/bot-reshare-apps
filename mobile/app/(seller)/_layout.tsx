import { Tabs } from 'expo-router';

export default function SellerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="products" options={{ title: 'Aplikasi', tabBarLabel: 'Aplikasi' }} />
      <Tabs.Screen name="pending-orders" options={{ title: 'Pesanan', tabBarLabel: 'Pesanan' }} />
      <Tabs.Screen name="balance" options={{ title: 'Saldo', tabBarLabel: 'Saldo' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarLabel: 'Profil' }} />
      <Tabs.Screen name="app-detail" options={{ href: null, title: 'Detail Aplikasi' }} />
      <Tabs.Screen name="add-account" options={{ href: null, title: 'Kelola Akun' }} />
      <Tabs.Screen name="submit-profile" options={{ href: null }} />
      <Tabs.Screen name="verify-email" options={{ href: null, title: 'Verifikasi Email' }} />
      <Tabs.Screen name="verify-phone" options={{ href: null, title: 'Verifikasi HP' }} />
      <Tabs.Screen name="subscription-payment" options={{ href: null, title: 'Pembayaran Langganan' }} />
    </Tabs>
  );
}
