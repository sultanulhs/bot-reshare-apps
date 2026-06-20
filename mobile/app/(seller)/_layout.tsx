import { Tabs } from 'expo-router';

export default function SellerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="products" options={{ title: 'Produk', tabBarLabel: 'Produk' }} />
      <Tabs.Screen name="balance" options={{ title: 'Saldo', tabBarLabel: 'Saldo' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarLabel: 'Profil' }} />
      <Tabs.Screen name="add-stock" options={{ href: null }} />
      <Tabs.Screen name="submit-profile" options={{ href: null }} />
      <Tabs.Screen name="verify-email" options={{ href: null, title: 'Verifikasi Email' }} />
      <Tabs.Screen name="verify-phone" options={{ href: null, title: 'Verifikasi HP' }} />
    </Tabs>
  );
}
