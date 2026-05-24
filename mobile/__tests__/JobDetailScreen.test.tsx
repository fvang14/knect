import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { JobDetailScreen } from '@/screens/jobs/JobDetailScreen';
import * as api from '@/api/client';
import type { JobDetail } from '@/lib/types';

jest.mock('@/api/client', () => ({
  getJob: jest.fn(),
  submitQuote: jest.fn(),
  completeJob: jest.fn(),
}));

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack }),
  useRoute: () => ({ params: { jobId: 'job-xyz' } }),
}));

const acceptedJob: JobDetail = {
  id: 'job-xyz', customer_id: 'c-1', contractor_id: 'con-1',
  status: 'accepted', description: 'Paint bedroom', location_lat: 40, location_lng: -74,
  location_address: '456 Elm St', created_at: '2026-05-23T09:00:00Z', updated_at: '2026-05-23T09:00:00Z',
  quote: null,
};

beforeEach(() => {
  (api.getJob as jest.Mock).mockReset().mockResolvedValue(acceptedJob);
  (api.submitQuote as jest.Mock).mockReset().mockResolvedValue(undefined);
  (api.completeJob as jest.Mock).mockReset().mockResolvedValue(undefined);
  mockGoBack.mockReset();
});

describe('JobDetailScreen', () => {
  it('displays job description and status', async () => {
    const { findByText } = render(<JobDetailScreen />);
    await findByText('Paint bedroom');
    await findByText('Accepted');
  });

  it('shows quote form for accepted job', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    await findByTestId('quote-submit-button');
  });

  it('calls submitQuote with entered values', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    const amountInput = await findByTestId('quote-amount-input');
    const noteInput = await findByTestId('quote-note-input');
    fireEvent.changeText(amountInput, '150');
    fireEvent.changeText(noteInput, 'Parts included');
    fireEvent.press(await findByTestId('quote-submit-button'));
    await waitFor(() =>
      expect(api.submitQuote).toHaveBeenCalledWith('job-xyz', {
        custom_amount: 150,
        custom_note: 'Parts included',
      })
    );
  });

  it('calls completeJob and goBack on complete press', async () => {
    const { findByTestId } = render(<JobDetailScreen />);
    fireEvent.press(await findByTestId('complete-button'));
    await waitFor(() => {
      expect(api.completeJob).toHaveBeenCalledWith('job-xyz');
      expect(mockGoBack).toHaveBeenCalled();
    });
  });

  it('hides actions for completed job', async () => {
    (api.getJob as jest.Mock).mockResolvedValue({ ...acceptedJob, status: 'completed' });
    const { queryByTestId } = render(<JobDetailScreen />);
    await waitFor(() => expect(queryByTestId('complete-button')).toBeNull());
  });
});
