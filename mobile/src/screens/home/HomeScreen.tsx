import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as api from '@/api/client';
import { useWs } from '@/context/WsContext';
import { JobRequestCard } from '@/components/JobRequestCard';
import { ReconnectingBanner } from '@/components/ReconnectingBanner';
import type { HomeStackParamList } from '@/navigation/types';
import type { PendingRequest, WsEvent } from '@/lib/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'Home'>;

export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { connected, subscribe } = useWs();
  const [isAvailable, setIsAvailable] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PendingRequest[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.getProfile().then((p) => setIsAvailable(p.is_available)).catch(() => {});
    }, []),
  );

  useEffect(() => {
    const unsub1 = subscribe('job_requested', (event: WsEvent) => {
      if (event.type !== 'job_requested') return;
      setRequests((prev) => [
        ...prev,
        {
          job_id: event.job_id,
          description: event.description,
          location_lat: event.location_lat,
          location_lng: event.location_lng,
          received_at: new Date().toISOString(),
        },
      ]);
    });

    const unsub2 = subscribe('job_cancelled', (event: WsEvent) => {
      if (event.type !== 'job_cancelled') return;
      setRequests((prev) => prev.filter((r) => r.job_id !== event.job_id));
    });

    return () => { unsub1(); unsub2(); };
  }, [subscribe]);

  // 5-second location broadcast while available
  useEffect(() => {
    if (!isAvailable) return;
    const id = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({});
        await api.updateLocation(pos.coords.latitude, pos.coords.longitude);
      } catch {}
    }, 5000);
    return () => clearInterval(id);
  }, [isAvailable]);

  async function handleToggle(value: boolean) {
    if (value) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Enable location to go available.');
        return;
      }
      setLocationError(null);
    }
    try {
      await api.setAvailability(value);
      setIsAvailable(value);
    } catch {}
  }

  return (
    <View style={styles.container}>
      <ReconnectingBanner connected={connected} />

      <View style={styles.availabilityRow}>
        <Text style={styles.availabilityLabel}>Available for work</Text>
        <Switch
          value={isAvailable}
          onValueChange={handleToggle}
          testID="availability-toggle"
        />
      </View>

      {locationError ? (
        <Text style={styles.locationError} testID="location-error">{locationError}</Text>
      ) : null}

      <FlatList
        data={requests}
        keyExtractor={(item) => item.job_id}
        renderItem={({ item }) => (
          <JobRequestCard
            request={item}
            onPress={() => navigation.navigate('JobRequestDetail', { request: item })}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty} testID="empty-requests">No pending requests</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  availabilityRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  availabilityLabel: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  locationError: { color: '#dc2626', fontSize: 12, paddingHorizontal: 20, paddingTop: 8 },
  list: { paddingTop: 8 },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8' },
});
