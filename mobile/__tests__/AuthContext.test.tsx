import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import * as api from '@/api/client';
import { SECURE_STORE_KEYS } from '@/lib/constants';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@/api/client', () => ({
  login: jest.fn(),
  setAuthState: jest.fn(),
}));

// A minimal consumer that surfaces auth state as text
function Probe() {
  const { accessToken, isLoading } = useAuth();
  if (isLoading) return <Text testID="loading">loading</Text>;
  return <Text testID="token">{accessToken ?? 'null'}</Text>;
}

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
});

describe('AuthContext', () => {
  it('shows loading then null when no stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const { getByTestId } = render(
      <AuthProvider><Probe /></AuthProvider>
    );
    expect(getByTestId('loading')).toBeTruthy();
    await waitFor(() => expect(getByTestId('token').props.children).toBe('null'));
  });

  it('auto-logs in when valid refresh token stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-refresh');
    // JWT with sub "user-42" — payload is base64({"sub":"user-42","role":"contractor"})
    const payload = btoa(JSON.stringify({ sub: 'user-42', role: 'contractor' }));
    const fakeJwt = `header.${payload}.sig`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: fakeJwt, refresh_token: 'new-ref' }),
    });

    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('token').props.children).toBe(fakeJwt));
    expect(api.setAuthState).toHaveBeenCalledWith(fakeJwt, 'new-ref', expect.any(Function));
  });

  it('stays unauthenticated when refresh call fails', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('bad-refresh');
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const { getByTestId } = render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(getByTestId('token').props.children).toBe('null'));
  });

  it('login() stores tokens and sets accessToken', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const payload = btoa(JSON.stringify({ sub: 'user-1', role: 'contractor' }));
    const fakeJwt = `h.${payload}.s`;
    (api.login as jest.Mock).mockResolvedValue({
      access_token: fakeJwt,
      refresh_token: 'ref-1',
    });
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

    function Consumer() {
      const { login, accessToken, isLoading } = useAuth();
      if (isLoading) return <Text testID="loading" />;
      return (
        <>
          <Text testID="token">{accessToken ?? 'null'}</Text>
          <Text testID="trigger" onPress={() => login('a@b.com', 'pw')} />
        </>
      );
    }

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => getByTestId('token'));
    await act(async () => { getByTestId('trigger').props.onPress(); });

    await waitFor(() => expect(getByTestId('token').props.children).toBe(fakeJwt));
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN, fakeJwt);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.REFRESH_TOKEN, 'ref-1');
  });

  it('logout() clears token and calls SecureStore.deleteItemAsync', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

    function Consumer() {
      const { logout, accessToken, isLoading } = useAuth();
      if (isLoading) return <Text testID="loading" />;
      return (
        <>
          <Text testID="token">{accessToken ?? 'null'}</Text>
          <Text testID="trigger" onPress={logout} />
        </>
      );
    }

    const { getByTestId } = render(<AuthProvider><Consumer /></AuthProvider>);
    await waitFor(() => getByTestId('token'));
    await act(async () => { getByTestId('trigger').props.onPress(); });

    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.REFRESH_TOKEN);
  });
});
