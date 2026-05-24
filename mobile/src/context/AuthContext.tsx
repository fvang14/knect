import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '@/lib/constants';
import * as api from '@/api/client';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080';

function decodeJwtSub(token: string): string {
  const raw = token.split('.')[1];
  // Pad base64 if needed
  const padded = raw + '=='.slice((raw.length % 4) || 4);
  return JSON.parse(atob(padded)).sub as string;
}

interface AuthState {
  accessToken: string | null;
  userId: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stable ref so the api client can call logout without stale closure
  const logoutRef = useRef<() => void>(() => {});

  const logout = useCallback(() => {
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN);
    SecureStore.deleteItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
    setAccessToken(null);
    setUserId(null);
  }, []);

  logoutRef.current = logout;

  // Keep api client in sync whenever tokens change
  useEffect(() => {
    // We read refresh token directly from SecureStore inside the api client on retry;
    // pass null here — the client stores it internally after first setAuthState call.
    api.setAuthState(accessToken, null, () => logoutRef.current());
  }, [accessToken]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const refreshToken = await SecureStore.getItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN);
        if (!refreshToken) return;

        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return;

        const { access_token, refresh_token } = await res.json();
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, access_token);
        await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, refresh_token);
        api.setAuthState(access_token, refresh_token, () => logoutRef.current());
        setUserId(decodeJwtSub(access_token));
        setAccessToken(access_token);
      } catch {
        // silently drop to Login
      } finally {
        setIsLoading(false);
      }
    }
    bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.ACCESS_TOKEN, tokens.access_token);
    await SecureStore.setItemAsync(SECURE_STORE_KEYS.REFRESH_TOKEN, tokens.refresh_token);
    api.setAuthState(tokens.access_token, tokens.refresh_token, () => logoutRef.current());
    setUserId(decodeJwtSub(tokens.access_token));
    setAccessToken(tokens.access_token);
  }, []);

  return (
    <AuthContext.Provider value={{ accessToken, userId, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
