import { Redirect } from 'expo-router';
import { useAuth } from '../src/lib/auth';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (user.role === 'ADMIN') return <Redirect href="/(admin)/dashboard" />;
  return <Redirect href="/(seller)/products" />;
}
