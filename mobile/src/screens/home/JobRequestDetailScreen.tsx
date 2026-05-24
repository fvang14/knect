import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { ApiError } from '@/api/client';
import type { HomeStackParamList } from '@/navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'JobRequestDetail'>;
type Route = RouteProp<HomeStackParamList, 'JobRequestDetail'>;

export function JobRequestDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params: { request } } = useRoute<Route>();
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);

  async function handleRespond(action: 'accept' | 'deny') {
    setLoading(true);
    try {
      await api.respondToJob(request.job_id, action);
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict(true);
        setTimeout(() => navigation.goBack(), 1500);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Job description</Text>
      <Text style={styles.description}>{request.description}</Text>

      {conflict ? (
        <Text style={styles.conflict} testID="conflict-message">
          This request is no longer available.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.denyButton]}
          onPress={() => handleRespond('deny')}
          disabled={loading}
          testID="deny-button"
        >
          <Text style={styles.denyText}>Deny</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.acceptButton]}
          onPress={() => handleRespond('accept')}
          disabled={loading}
          testID="accept-button"
        >
          <Text style={styles.acceptText}>{loading ? 'Responding…' : 'Accept'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 20 },
  label: { fontSize: 12, fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: 6 },
  description: { fontSize: 16, color: '#0f172a', marginBottom: 24 },
  conflict: { color: '#dc2626', fontSize: 13, marginBottom: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  denyButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  denyText: { fontWeight: '600', color: '#475569' },
  acceptButton: { backgroundColor: '#2563eb' },
  acceptText: { fontWeight: '700', color: '#fff' },
});
