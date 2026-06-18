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
