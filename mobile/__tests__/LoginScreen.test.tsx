import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '@/screens/auth/LoginScreen';

const mockLogin = jest.fn();
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

beforeEach(() => mockLogin.mockReset());

describe('LoginScreen', () => {
  it('renders email and password fields and sign-in button', () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId('email-input')).toBeTruthy();
    expect(getByTestId('password-input')).toBeTruthy();
    expect(getByTestId('login-button')).toBeTruthy();
  });

  it('calls login with entered credentials on submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('email-input'), 'contractor@example.com');
    fireEvent.changeText(getByTestId('password-input'), 'secret');
    fireEvent.press(getByTestId('login-button'));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('contractor@example.com', 'secret')
    );
  });

  it('shows error message when login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const { getByTestId, findByTestId } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId('email-input'), 'a@b.com');
    fireEvent.changeText(getByTestId('password-input'), 'wrong');
    fireEvent.press(getByTestId('login-button'));
    const err = await findByTestId('error-message');
    expect(err.props.children).toBe('Invalid credentials');
  });
});
