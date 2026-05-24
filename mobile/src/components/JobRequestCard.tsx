import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { PendingRequest } from '@/lib/types';

interface Props {
  request: PendingRequest;
  onPress: () => void;
}

export function JobRequestCard({ request, onPress }: Props) {
  const age = Math.round(
    (Date.now() - new Date(request.received_at).getTime()) / 1000
  );

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} testID={`request-card-${request.job_id}`}>
      <Text style={styles.description} numberOfLines={2}>
        {request.description}
      </Text>
      <Text style={styles.meta}>{age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  description: { fontSize: 14, fontWeight: '500', color: '#0f172a', marginBottom: 4 },
  meta: { fontSize: 12, color: '#94a3b8' },
});
