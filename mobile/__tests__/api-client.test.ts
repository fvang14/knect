import * as SecureStore from 'expo-secure-store';
import * as client from '@/api/client';
import { SECURE_STORE_KEYS } from '@/lib/constants';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  client.setAuthState(null, null, jest.fn());
});

describe('apiFetch', () => {
  it('sends Authorization header when access token is set', async () => {
    client.setAuthState('tok-123', 'ref-123', jest.fn());
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ data: 1 }),
    });

    await client.listJobs();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/contractor/jobs'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-123' }),
      })
    );
  });

  it('retries with refreshed token on 401', async () => {
    client.setAuthState('expired', 'ref-abc', jest.fn());
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'new-tok', refresh_token: 'new-ref' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => [],
      });

    const result = await client.listJobs();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SECURE_STORE_KEYS.ACCESS_TOKEN, 'new-tok');
    expect(result).toEqual([]);
  });

  it('calls onUnauthorized when refresh fails', async () => {
    const onUnauthorized = jest.fn();
    client.setAuthState('expired', 'bad-ref', onUnauthorized);
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(client.listJobs()).rejects.toThrow();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('throws ApiError with code and status on non-2xx', async () => {
    client.setAuthState('tok', 'ref', jest.fn());
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: async () => ({ error: 'job_not_found', message: 'Not found', status: 404 }),
    });

    await expect(client.getJob('bad-id')).rejects.toMatchObject({
      code: 'job_not_found',
      status: 404,
    });
  });
});
