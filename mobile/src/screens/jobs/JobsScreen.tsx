import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobsStackParamList } from '@/navigation/types';
import type { JobQueueItem } from '@/lib/types';

type Nav = NativeStackNavigationProp<JobsStackParamList, 'Jobs'>;

export function JobsScreen() {
  const navigation = useNavigation<Nav>();
  const [jobs, setJobs] = useState<JobQueueItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      api.listJobs().then(setJobs).catch(() => {});
    }, []),
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => navigation.navigate('JobDetail', { jobId: item.id })}
            testID={`job-row-${item.id}`}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.description} numberOfLines={1}>{item.description}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            <StatusBadge status={item.status} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty} testID="empty-jobs">No active jobs</Text>
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  list: { paddingTop: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  rowLeft: { flex: 1, marginRight: 12 },
  description: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  date: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  empty: { textAlign: 'center', marginTop: 40, color: '#94a3b8' },
});
