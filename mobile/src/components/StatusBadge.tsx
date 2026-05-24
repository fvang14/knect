import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { JobStatus } from '@/lib/types';

const CONFIG: Record<JobStatus, { label: string; bg: string; text: string }> = {
  pending:     { label: 'Pending',     bg: '#fef9c3', text: '#854d0e' },
  accepted:    { label: 'Accepted',    bg: '#dcfce7', text: '#166534' },
  in_progress: { label: 'In Progress', bg: '#dbeafe', text: '#1e40af' },
  completed:   { label: 'Completed',   bg: '#f0fdf4', text: '#15803d' },
  denied:      { label: 'Denied',      bg: '#fee2e2', text: '#991b1b' },
  cancelled:   { label: 'Cancelled',   bg: '#f3f4f6', text: '#6b7280' },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const { label, bg, text } = CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 9999 },
  label: { fontSize: 11, fontWeight: '600' },
});
