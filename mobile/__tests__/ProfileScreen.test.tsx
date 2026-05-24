import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import * as api from '@/api/client';
import type { ContractorProfile } from '@/lib/types';

jest.mock('@/api/client', () => ({
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const react = require('react');
    react.useEffect(() => {
      cb();
    }, [cb]);
  },
}));

const mockProfile: ContractorProfile = {
  user_id: 'con-1', display_name: 'Bob the Builder', bio: 'I build things.',
  base_rate: 75, base_rate_unit: 'per_hour', is_available: false, is_busy: false,
  current_lat: null, current_lng: null, avg_rating: 4.5, rating_count: 12,
  trade_categories: [{ id: '1', name: 'Carpentry', icon_slug: 'hammer' }],
};

beforeEach(() => {
  (api.getProfile as jest.Mock).mockReset().mockResolvedValue(mockProfile);
  (api.updateProfile as jest.Mock).mockReset().mockResolvedValue(undefined);
});

describe('ProfileScreen', () => {
  it('pre-populates form fields from profile', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    await waitFor(async () => {
      const nameInput = await findByTestId('display-name-input');
      expect(nameInput.props.value).toBe('Bob the Builder');
    });
    const rateInput = await findByTestId('base-rate-input');
    expect(rateInput.props.value).toBe('75');
  });

  it('calls updateProfile with edited values on save', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    const nameInput = await findByTestId('display-name-input');
    
    // Wait for the asynchronous profile load to settle first
    await waitFor(() => expect(nameInput.props.value).toBe('Bob the Builder'));

    // Re-query display-name-input to get the fresh reference after re-render
    const freshNameInput = await findByTestId('display-name-input');
    fireEvent.changeText(freshNameInput, 'Bob Updated');
    fireEvent.press(await findByTestId('save-button'));
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ display_name: 'Bob Updated' })
      )
    );
  });

  it('shows success message after save', async () => {
    const { findByTestId, findByText } = render(<ProfileScreen />);
    
    // Wait for profile load to settle to avoid state update warnings
    const nameInput = await findByTestId('display-name-input');
    await waitFor(() => expect(nameInput.props.value).toBe('Bob the Builder'));

    fireEvent.press(await findByTestId('save-button'));
    await findByText('Saved!');
  });
});
