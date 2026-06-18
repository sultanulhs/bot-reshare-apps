import { Tabs } from 'expo-router';

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarLabel: 'Dashboard' }} />
      <Tabs.Screen name="sellers" options={{ title: 'Penjual', tabBarLabel: 'Penjual' }} />
      <Tabs.Screen name="settings" options={{ title: 'Pengaturan', tabBarLabel: 'Settings' }} />
    </Tabs>
  );
}
