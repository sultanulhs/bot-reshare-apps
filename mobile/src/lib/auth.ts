import { createContext, useContext } from 'react';

export interface AuthUser {
  accessToken: string;
  refreshToken: string;
  role: 'SELLER' | 'ADMIN';
  sellerStatus?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  ownerName: string;
  storeName: string;
  phone: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser | undefined>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => undefined,
  register: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);
