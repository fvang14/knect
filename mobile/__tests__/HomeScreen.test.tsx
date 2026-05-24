import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { HomeScreen } from '@/screens/home/HomeScreen';
import * as api from '@/api/client';
import * as Location from 'expo-location';
import type { WsEvent } from '@/lib/types';

let wsSubscriptions: Map<string, ((e: WsEvent) => void)[]> = new Map();
const mockSubscribe = jest.fn((type: string, cb: (e: WsEvent) => void) => {
  if (!wsSubscriptions.has(type)) wsSubscriptions.set(type, []);
  wsSubscriptions.get(type)!.push(cb);
  return () => {};
});

let mockConnected = true;
jest.mock('@/context/WsContext', () => ({
  useWs: () => ({ connected: mockConnected, subscribe: mockSubscribe }),
}));
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'tok' }),
}));
jest.mock('@/api/client', () => ({
  getProfile: jest.fn(),
  setAvailability: jest.fn(),
  updateLocation: jest.fn(),
}));
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
  useNavigation: () => ({ navigate: jest.fn() }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  wsSubscriptions = new Map();
  mockConnected = true;
  (api.getProfile as jest.Mock).mockResolvedValue({ is_available: false });
  (api.setAvailability as jest.Mock).mockResolvedValue(undefined);
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: 40.71, longitude: -74.0 },
  });
});

describe('HomeScreen', () => {
  it('shows availability toggle', async () => {
    const { getByTestId } = render(<HomeScreen />);
    await waitFor(() => expect(getByTestId('availability-toggle')).toBeTruthy());
  });

  it('calls setAvailability(true) and requests location permission on toggle on', async () => {
    const { getByTestId } = render(<HomeScreen />);
    await waitFor(() => getByTestId('availability-toggle'));
    await act(async () => {
      fireEvent(getByTestId('availability-toggle'), 'valueChange', true);
    });
    await waitFor(() => {
      expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
      expect(api.setAvailability).toHaveBeenCalledWith(true);
    });
  });

  it('shows location error and does not toggle when permission denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    const { getByTestId, findByTestId } = render(<HomeScreen />);
    await waitFor(() => getByTestId('availability-toggle'));
    await act(async () => {
      fireEvent(getByTestId('availability-toggle'), 'valueChange', true);
    });
    await findByTestId('location-error');
    expect(api.setAvailability).not.toHaveBeenCalled();
  });

  it('adds a card when job_requested WS event arrives', async () => {
    const { findByTestId } = render(<HomeScreen />);
    await waitFor(() => wsSubscriptions.has('job_requested'));
    const event: WsEvent = {
      type: 'job_requested',
      job_id: 'job-1',
      description: 'Fix the sink',
      location_lat: 40,
      location_lng: -74,
    };
    await act(async () => {
      wsSubscriptions.get('job_requested')?.forEach(cb => cb(event));
    });
    await findByTestId('request-card-job-1');
  });

  it('removes card when job_cancelled WS event arrives', async () => {
    const { findByTestId, queryByTestId } = render(<HomeScreen />);
    await waitFor(() => wsSubscriptions.has('job_requested'));
    const requested: WsEvent = {
      type: 'job_requested', job_id: 'job-2',
      description: 'Paint wall', location_lat: 40, location_lng: -74,
    };
    await act(async () => {
      wsSubscriptions.get('job_requested')?.forEach(cb => cb(requested));
    });
    await findByTestId('request-card-job-2');
    const cancelled: WsEvent = { type: 'job_cancelled', job_id: 'job-2' };
    await act(async () => {
      wsSubscriptions.get('job_cancelled')?.forEach(cb => cb(cancelled));
    });
    await waitFor(() => expect(queryByTestId('request-card-job-2')).toBeNull());
  });

  it('shows reconnecting banner when disconnected', () => {
    mockConnected = false;
    const { getByTestId } = render(<HomeScreen />);
    expect(getByTestId('reconnecting-banner')).toBeTruthy();
  });
});
