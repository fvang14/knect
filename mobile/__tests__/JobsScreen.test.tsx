import React from 'react';
import { render } from '@testing-library/react-native';
import { JobsScreen } from '@/screens/jobs/JobsScreen';
import * as api from '@/api/client';
import type { JobQueueItem } from '@/lib/types';

jest.mock('@/api/client', () => ({ listJobs: jest.fn() }));
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
  useNavigation: () => ({ navigate: jest.fn() }),
}));

const mockJob: JobQueueItem = {
  id: 'job-1', customer_id: 'c-1', status: 'pending',
  description: 'Install light fixture', location_lat: 40, location_lng: -74,
  location_address: '123 Main St', created_at: '2026-05-23T10:00:00Z', updated_at: '2026-05-23T10:00:00Z',
};

beforeEach(() => (api.listJobs as jest.Mock).mockReset());

describe('JobsScreen', () => {
  it('renders a list of jobs', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([mockJob]);
    const { findByText } = render(<JobsScreen />);
    await findByText('Install light fixture');
  });

  it('renders empty state when no jobs', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([]);
    const { findByTestId } = render(<JobsScreen />);
    await findByTestId('empty-jobs');
  });

  it('shows status badge for each job', async () => {
    (api.listJobs as jest.Mock).mockResolvedValue([mockJob]);
    const { findByText } = render(<JobsScreen />);
    await findByText('Pending');
  });
});
