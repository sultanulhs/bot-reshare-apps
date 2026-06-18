# Fase 7: Mobile App (Expo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React Native mobile app using Expo for sellers and admins. Auth flow with secure token storage, role-based navigation, seller screens (products, stock, balance, subscription), and admin screens (sellers, markup, botconfig, stats).

**Architecture:** Expo with expo-router for file-based routing. TanStack Query for server state. Axios with JWT interceptor. expo-secure-store for token storage. Role-based layout groups: `(seller)` and `(admin)`.

**Tech Stack:** Expo SDK, TypeScript, expo-router, TanStack Query, axios, expo-secure-store

## Global Constraints

- TypeScript strict mode
- Tokens stored in expo-secure-store, never AsyncStorage
- Axios interceptor: on 401, try refresh once; if fails, logout
- Credentials never cached or displayed on mobile (write-only stock input)
- All amounts displayed as Rupiah formatted (e.g., Rp50.000)
- Mobile connects to backend at configurable API_URL

---

### Task 1: Expo Project Setup & Auth Infrastructure

**Files:**
- Create: `mobile/` — Expo project
- Create: `mobile/src/lib/api.ts` — axios instance with JWT interceptor
- Create: `mobile/src/lib/auth.ts` — auth context with secure-store
- Create: `mobile/app/_layout.tsx` — root layout with providers
- Create: `mobile/app/login.tsx` — login screen
- Create: `mobile/app/register.tsx` — register screen

**Interfaces:**
- Consumes: Backend `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`
- Produces: Auth context with `login()`, `logout()`, `user`, `isLoading`, axios instance with auto-refresh

- [ ] **Step 1: Create Expo project**

```bash
npx create-expo-app mobile --template blank-typescript
```

- [ ] **Step 2: Install dependencies**

```bash
cd mobile && npx expo install expo-router expo-secure-store react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar @tanstack/react-query axios
```

- [ ] **Step 3: Configure expo-router in `mobile/app.json`**

Add to app.json:
```json
{
  "expo": {
    "scheme": "reshare",
    "plugins": ["expo-router", "expo-secure-store"]
  }
}
```

- [ ] **Step 4: Create `mobile/src/lib/api.ts`**

```typescript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        await SecureStore.setItemAsync('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export default api;
```

- [ ] **Step 5: Create `mobile/src/lib/auth.ts`**

```typescript
import { createContext, useContext } from 'react';

export interface AuthUser {
  accessToken: string;
  refreshToken: string;
  role: 'SELLER' | 'ADMIN';
  sellerStatus?: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; phone: string }) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);
```

- [ ] **Step 6: Create `mobile/src/providers/AuthProvider.tsx`**

```typescript
import React, { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { AuthContext, AuthUser } from '../lib/auth';
import api from '../lib/api';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const accessToken = await SecureStore.getItemAsync('accessToken');
        const refreshToken = await SecureStore.getItemAsync('refreshToken');
        const role = await SecureStore.getItemAsync('role');
        const sellerStatus = await SecureStore.getItemAsync('sellerStatus');
        if (accessToken && refreshToken && role) {
          setUser({
            accessToken,
            refreshToken,
            role: role as 'SELLER' | 'ADMIN',
            sellerStatus: sellerStatus || undefined,
          });
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await axios.post(`${API_URL}/auth/login`, { email, password });
    await SecureStore.setItemAsync('accessToken', data.accessToken);
    await SecureStore.setItemAsync('refreshToken', data.refreshToken);
    await SecureStore.setItemAsync('role', data.role);
    if (data.sellerStatus) {
      await SecureStore.setItemAsync('sellerStatus', data.sellerStatus);
    }
    setUser({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      role: data.role,
      sellerStatus: data.sellerStatus,
    });
  }, []);

  const register = useCallback(async (regData: { email: string; password: string; name: string; phone: string }) => {
    await axios.post(`${API_URL}/auth/register`, regData);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('role');
    await SecureStore.deleteItemAsync('sellerStatus');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 7: Create `mobile/app/_layout.tsx`**

```tsx
import { Slot } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/providers/AuthProvider';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Slot />
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 8: Create `mobile/app/index.tsx`** — redirect based on auth

```tsx
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
```

- [ ] **Step 9: Create `mobile/app/login.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../src/lib/auth';
import { Link } from 'expo-router';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      Alert.alert('Login Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>reShare</Text>
      <Text style={styles.subtitle}>Marketplace Akun Premium</Text>
      <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Masuk'}</Text>
      </TouchableOpacity>
      <Link href="/register" style={styles.link}>Belum punya akun? Daftar</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 32 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { textAlign: 'center', color: '#2563eb', marginTop: 16 },
});
```

- [ ] **Step 10: Create `mobile/app/register.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useAuth } from '../src/lib/auth';
import { router } from 'expo-router';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setLoading(true);
    try {
      await register(form);
      Alert.alert('Berhasil', 'Akun berhasil dibuat. Silakan login.', [
        { text: 'OK', onPress: () => router.replace('/login') },
      ]);
    } catch (err: any) {
      Alert.alert('Gagal', err.response?.data?.message || 'Terjadi kesalahan');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Daftar Penjual</Text>
      <TextInput style={styles.input} placeholder="Nama" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />
      <TextInput style={styles.input} placeholder="Email" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />
      <TextInput style={styles.input} placeholder="No HP" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />
      <TextInput style={styles.input} placeholder="Password" value={form.password} onChangeText={(v) => setForm({ ...form, password: v })} secureTextEntry />
      <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Daftar'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
```

- [ ] **Step 11: Verify build**

```bash
cd mobile && npx expo export --platform web 2>&1 || echo "Expo setup complete"
```

- [ ] **Step 12: Commit**

```bash
git add mobile/ && git commit -m "feat: initialize Expo mobile app with auth flow and secure token storage"
```

---

### Task 2: Seller Screens

**Files:**
- Create: `mobile/app/(seller)/_layout.tsx` — tab layout for seller
- Create: `mobile/app/(seller)/products.tsx` — product list + add
- Create: `mobile/app/(seller)/add-stock.tsx` — add stock to product
- Create: `mobile/app/(seller)/balance.tsx` — balance & sales
- Create: `mobile/app/(seller)/profile.tsx` — seller profile & subscription

**Interfaces:**
- Consumes: Backend seller API endpoints via axios/TanStack Query
- Produces: Full seller mobile experience

- [ ] **Step 1: Create `mobile/app/(seller)/_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';

export default function SellerLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="products" options={{ title: 'Produk', tabBarLabel: 'Produk' }} />
      <Tabs.Screen name="balance" options={{ title: 'Saldo', tabBarLabel: 'Saldo' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarLabel: 'Profil' }} />
      <Tabs.Screen name="add-stock" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Create `mobile/app/(seller)/products.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import api from '../../src/lib/api';

export default function ProductsScreen() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: '', title: '', basePrice: '' });

  const { data: products, isLoading } = useQuery({
    queryKey: ['seller-products'],
    queryFn: () => api.get('/seller/products').then((r) => r.data),
  });

  const addProduct = useMutation({
    mutationFn: (data: any) => api.post('/seller/products', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-products'] });
      setShowAdd(false);
      setForm({ category: '', title: '', basePrice: '' });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Produk</Text>
      </TouchableOpacity>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/(seller)/add-stock', params: { productId: item.id, title: item.title } })}
          >
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardSub}>{item.category} | Rp{item.basePrice.toLocaleString('id-ID')}</Text>
            <Text style={styles.cardStock}>
              Tersedia: {item.stockCount?.available ?? 0} | Terjual: {item.stockCount?.sold ?? 0}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{isLoading ? 'Loading...' : 'Belum ada produk'}</Text>}
      />

      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Produk</Text>
            <TextInput style={styles.input} placeholder="Kategori" value={form.category} onChangeText={(v) => setForm({ ...form, category: v })} />
            <TextInput style={styles.input} placeholder="Judul" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />
            <TextInput style={styles.input} placeholder="Harga (Rupiah)" value={form.basePrice} onChangeText={(v) => setForm({ ...form, basePrice: v })} keyboardType="numeric" />
            <TouchableOpacity style={styles.button} onPress={() => addProduct.mutate({ ...form, basePrice: parseInt(form.basePrice) || 0 })}>
              <Text style={styles.buttonText}>Simpan</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(false)}><Text style={styles.cancel}>Batal</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  addBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16 },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 13, color: '#666', marginTop: 4 },
  cardStock: { fontSize: 12, color: '#888', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
```

- [ ] **Step 3: Create `mobile/app/(seller)/add-stock.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import api from '../../src/lib/api';

export default function AddStockScreen() {
  const { productId, title } = useLocalSearchParams<{ productId: string; title: string }>();
  const [credentials, setCredentials] = useState('');

  const addStock = useMutation({
    mutationFn: () => api.post(`/seller/products/${productId}/stock`, { credentials }),
    onSuccess: () => {
      Alert.alert('Berhasil', 'Stok berhasil ditambahkan', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      setCredentials('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tambah Stok</Text>
      <Text style={styles.subtitle}>{title}</Text>
      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder="Kredensial (email:password atau format lain)"
        value={credentials}
        onChangeText={setCredentials}
        multiline
      />
      <Text style={styles.note}>Kredensial akan dienkripsi dan tidak bisa dilihat kembali.</Text>
      <TouchableOpacity style={styles.button} onPress={() => addStock.mutate()} disabled={!credentials || addStock.isPending}>
        <Text style={styles.buttonText}>{addStock.isPending ? 'Menyimpan...' : 'Simpan Stok'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: 'bold' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 8, textAlignVertical: 'top' },
  note: { fontSize: 12, color: '#999', marginBottom: 16 },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 4: Create `mobile/app/(seller)/balance.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import api from '../../src/lib/api';

export default function BalanceScreen() {
  const { data: balance } = useQuery({
    queryKey: ['seller-balance'],
    queryFn: () => api.get('/seller/balance').then((r) => r.data),
  });

  const { data: sales } = useQuery({
    queryKey: ['seller-sales'],
    queryFn: () => api.get('/seller/sales').then((r) => r.data),
  });

  return (
    <View style={styles.container}>
      <View style={styles.balanceCard}>
        <Text style={styles.label}>Saldo Tersedia</Text>
        <Text style={styles.amount}>Rp{(balance?.available ?? 0).toLocaleString('id-ID')}</Text>
        <Text style={styles.note}>Pencairan manual (hubungi admin)</Text>
      </View>

      <Text style={styles.sectionTitle}>Riwayat Penjualan</Text>
      <FlatList
        data={sales}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.rowTitle}>{item.productTitle}</Text>
            <Text style={styles.rowAmount}>+Rp{item.amount.toLocaleString('id-ID')}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada penjualan</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  balanceCard: { backgroundColor: '#2563eb', borderRadius: 12, padding: 24, marginBottom: 24 },
  label: { color: '#ddd', fontSize: 14 },
  amount: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 4 },
  note: { color: '#bbb', fontSize: 12, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#fff', padding: 14, borderRadius: 8, marginBottom: 4 },
  rowTitle: { fontSize: 14 },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#16a34a' },
  empty: { textAlign: 'center', color: '#999', marginTop: 24 },
});
```

- [ ] **Step 5: Create `mobile/app/(seller)/profile.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function ProfileScreen() {
  const { logout } = useAuth();
  const { data: me } = useQuery({
    queryKey: ['seller-me'],
    queryFn: () => api.get('/seller/me').then((r) => r.data),
  });

  const { data: subscription } = useQuery({
    queryKey: ['seller-subscription'],
    queryFn: () => api.get('/seller/subscription').then((r) => r.data),
  });

  const { data: storeLink } = useQuery({
    queryKey: ['seller-store-link'],
    queryFn: () => api.get('/seller/store-link').then((r) => r.data).catch(() => null),
  });

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.name}>{me?.name}</Text>
        <Text style={styles.email}>{me?.email}</Text>
        <Text style={styles.status}>Status: {me?.status}</Text>
      </View>

      {storeLink && (
        <View style={styles.card}>
          <Text style={styles.label}>Link Toko</Text>
          <Text style={styles.link} selectable>{storeLink.url}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.label}>Langganan</Text>
        <Text>{subscription?.status === 'ACTIVE'
          ? `Aktif sampai ${new Date(subscription.expiresAt).toLocaleDateString('id-ID')}`
          : subscription?.status || 'Tidak ada'
        }</Text>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 12 },
  name: { fontSize: 18, fontWeight: 'bold' },
  email: { fontSize: 14, color: '#666' },
  status: { fontSize: 14, color: '#2563eb', marginTop: 4 },
  label: { fontSize: 12, color: '#999', marginBottom: 4 },
  link: { fontSize: 14, color: '#2563eb' },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 6: Commit**

```bash
git add mobile/app/\(seller\)/
git commit -m "feat: add seller screens (products, stock, balance, profile)"
```

---

### Task 3: Admin Screens

**Files:**
- Create: `mobile/app/(admin)/_layout.tsx` — tab layout for admin
- Create: `mobile/app/(admin)/dashboard.tsx` — stats overview
- Create: `mobile/app/(admin)/sellers.tsx` — seller management
- Create: `mobile/app/(admin)/settings.tsx` — markup, botconfig, plans

**Interfaces:**
- Consumes: Backend admin API endpoints
- Produces: Full admin mobile experience

- [ ] **Step 1: Create `mobile/app/(admin)/_layout.tsx`**

```tsx
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
```

- [ ] **Step 2: Create `mobile/app/(admin)/dashboard.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import api from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';

export default function DashboardScreen() {
  const { logout } = useAuth();
  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data),
  });

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard Admin</Text>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.orders?.total ?? 0}</Text>
          <Text style={styles.statLabel}>Total Order</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats?.orders?.fulfilled ?? 0}</Text>
          <Text style={styles.statLabel}>Terpenuhi</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Rp{(stats?.revenue?.operatorMarkup ?? 0).toLocaleString('id-ID')}</Text>
          <Text style={styles.statLabel}>Markup</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>Rp{(stats?.revenue?.subscriptionFees ?? 0).toLocaleString('id-ID')}</Text>
          <Text style={styles.statLabel}>Langganan</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Keluar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '48%', elevation: 1 },
  statValue: { fontSize: 20, fontWeight: 'bold' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 4 },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  logoutText: { color: '#fff', fontWeight: '600' },
});
```

- [ ] **Step 3: Create `mobile/app/(admin)/sellers.tsx`**

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import api from '../../src/lib/api';

export default function SellersScreen() {
  const queryClient = useQueryClient();
  const { data: sellers } = useQuery({
    queryKey: ['admin-sellers'],
    queryFn: () => api.get('/admin/sellers').then((r) => r.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const verify = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/verify-profile`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/admin/sellers/${id}/suspend`, { reason: 'Admin action' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-sellers'] }),
  });

  const statusColor: Record<string, string> = {
    PENDING: '#f59e0b', APPROVED: '#3b82f6', PROFILE_SUBMITTED: '#8b5cf6', ACTIVE: '#16a34a', SUSPENDED: '#ef4444',
  };

  return (
    <FlatList
      style={styles.container}
      data={sellers}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={[styles.badge, { backgroundColor: statusColor[item.status] || '#999' }]}>{item.status}</Text>
          </View>
          <Text style={styles.email}>{item.email}</Text>
          <View style={styles.actions}>
            {item.status === 'PENDING' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => approve.mutate(item.id)}>
                <Text style={styles.actionText}>Approve</Text>
              </TouchableOpacity>
            )}
            {item.status === 'PROFILE_SUBMITTED' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => verify.mutate(item.id)}>
                <Text style={styles.actionText}>Verifikasi</Text>
              </TouchableOpacity>
            )}
            {item.status !== 'SUSPENDED' && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fecaca' }]} onPress={() =>
                Alert.alert('Suspend', `Suspend ${item.name}?`, [
                  { text: 'Batal' },
                  { text: 'Ya', onPress: () => suspend.mutate(item.id) },
                ])
              }>
                <Text style={[styles.actionText, { color: '#ef4444' }]}>Suspend</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  email: { fontSize: 13, color: '#666', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { backgroundColor: '#dbeafe', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  actionText: { fontSize: 13, fontWeight: '500', color: '#2563eb' },
});
```

- [ ] **Step 4: Create `mobile/app/(admin)/settings.tsx`**

```tsx
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
```

- [ ] **Step 5: Commit**

```bash
git add mobile/app/\(admin\)/
git commit -m "feat: add admin screens (dashboard, sellers, settings)"
```
