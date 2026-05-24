import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { JobRequestDetailScreen } from '@/screens/home/JobRequestDetailScreen';
import * as api from '@/api/client';

jest.mock('@/api/client', () => {
  class MockApiError extends Error {
    code: string;
    status: number;
    constructor(c: string, s: number, m: string) {
      super(m);
      this.code = c;
      this.status = s;
    }
  }
  return {
    respondToJob: jest.fn(),
    ApiError: MockApiError,
  };
});

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({
    params: {
      request: {
        job_id: 'job-abc',
        description: 'Fix leaky faucet',
        location_lat: 40.71,
        location_lng: -74.0,
        received_at: new Date().toISOString(),
      },
    },
  }),
}));

beforeEach(() => {
  (api.respondToJob as jest.Mock).mockReset();
  mockGoBack.mockReset();
});

describe('JobRequestDetailScreen', () => {
  it('displays job description', () => {
    const { getByText } = render(<JobRequestDetailScreen />);
    expect(getByText('Fix leaky faucet')).toBeTruthy();
  });

  it('calls respondToJob(accept) and goBack on Accept press', async () => {
    (api.respondToJob as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('accept-button'));
    await waitFor(() => {
      expect(api.respondToJob).toHaveBeenCalledWith('job-abc', 'accept');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('calls respondToJob(deny) and goBack on Deny press', async () => {
    (api.respondToJob as jest.Mock).mockResolvedValue(undefined);
    const { getByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('deny-button'));
    await waitFor(() => {
      expect(api.respondToJob).toHaveBeenCalledWith('job-abc', 'deny');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('shows error toast and goes back on 409 conflict', async () => {
    const { ApiError } = require('@/api/client');
    (api.respondToJob as jest.Mock).mockRejectedValue(
      new ApiError('conflict', 409, 'Job is no longer available')
    );
    jest.useFakeTimers();
    const { getByTestId, findByTestId } = render(<JobRequestDetailScreen />);
    fireEvent.press(getByTestId('accept-button'));
    await findByTestId('conflict-message');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    jest.useRealTimers();
  });
});
