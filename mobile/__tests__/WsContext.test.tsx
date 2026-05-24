import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Text } from 'react-native';
import { WsProvider, useWs } from '@/context/WsContext';
import type { WsEvent } from '@/lib/types';

// Mock AuthContext
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'test-token' }),
}));

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = jest.fn(() => { this.onclose?.(); });
  static instances: MockWebSocket[] = [];
  constructor(public url: string) { MockWebSocket.instances.push(this); }
}
(global as any).WebSocket = MockWebSocket;

beforeEach(() => { MockWebSocket.instances = []; });

function Probe({ eventType, onEvent }: { eventType: WsEvent['type']; onEvent: (e: WsEvent) => void }) {
  const { connected, subscribe } = useWs();
  React.useEffect(() => subscribe(eventType, onEvent), [eventType, onEvent, subscribe]);
  return <Text testID="connected">{connected ? 'yes' : 'no'}</Text>;
}

describe('WsContext', () => {
  it('opens WebSocket with token in URL', () => {
    render(<WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>);
    expect(MockWebSocket.instances[0].url).toContain('token=test-token');
  });

  it('sets connected=true on open', async () => {
    const { getByTestId } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>
    );
    expect(getByTestId('connected').props.children).toBe('no');
    await act(async () => { MockWebSocket.instances[0].onopen?.(); });
    expect(getByTestId('connected').props.children).toBe('yes');
  });

  it('dispatches events to subscribers', async () => {
    const handler = jest.fn();
    render(<WsProvider><Probe eventType="job_requested" onEvent={handler} /></WsProvider>);
    const ws = MockWebSocket.instances[0];
    const event: WsEvent = { type: 'job_requested', job_id: 'j1', description: 'Fix sink', location_lat: 1, location_lng: 2 };
    await act(async () => { ws.onmessage?.({ data: JSON.stringify(event) }); });
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not dispatch to unsubscribed handlers', async () => {
    const handler = jest.fn();
    const { unmount } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={handler} /></WsProvider>
    );
    unmount();
    const ws = MockWebSocket.instances[0];
    const event: WsEvent = { type: 'job_requested', job_id: 'j1', description: 'x', location_lat: 0, location_lng: 0 };
    await act(async () => { ws.onmessage?.({ data: JSON.stringify(event) }); });
    expect(handler).not.toHaveBeenCalled();
  });

  it('sets connected=false on close', async () => {
    const { getByTestId } = render(
      <WsProvider><Probe eventType="job_requested" onEvent={jest.fn()} /></WsProvider>
    );
    const ws = MockWebSocket.instances[0];
    await act(async () => { ws.onopen?.(); });
    expect(getByTestId('connected').props.children).toBe('yes');
    // Prevent reconnect timer from firing
    jest.useFakeTimers();
    await act(async () => { ws.onclose?.(); });
    expect(getByTestId('connected').props.children).toBe('no');
    jest.useRealTimers();
  });
});
