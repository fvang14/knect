import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as api from '@/api/client';
import { StatusBadge } from '@/components/StatusBadge';
import type { JobsStackParamList } from '@/navigation/types';
import type { JobDetail } from '@/lib/types';

type Nav = NativeStackNavigationProp<JobsStackParamList, 'JobDetail'>;
type Route = RouteProp<JobsStackParamList, 'JobDetail'>;

const ACTIVE_STATUSES = new Set(['accepted', 'in_progress']);

export function JobDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params: { jobId } } = useRoute<Route>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [quoteAmount, setQuoteAmount] = useState('');
  const [quoteNote, setQuoteNote] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getJob(jobId).then((j) => {
      setJob(j);
      if (j.quote?.custom_amount != null) setQuoteAmount(String(j.quote.custom_amount));
      if (j.quote?.custom_note) setQuoteNote(j.quote.custom_note);
    }).catch(() => {});
  }, [jobId]);

  async function handleSubmitQuote() {
    if (!job) return;
    setLoading(true);
    try {
      await api.submitQuote(jobId, {
        custom_amount: quoteAmount ? parseFloat(quoteAmount) : undefined,
        custom_note: quoteNote || undefined,
      });
    } catch {} finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    setLoading(true);
    try {
      await api.completeJob(jobId);
      navigation.goBack();
    } catch {} finally {
      setLoading(false);
    }
  }

  if (!job) return null;

  const isActive = ACTIVE_STATUSES.has(job.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <StatusBadge status={job.status} />
        <Text style={styles.date}>{new Date(job.created_at).toLocaleDateString()}</Text>
      </View>

      <Text style={styles.sectionLabel}>Description</Text>
      <Text style={styles.description}>{job.description}</Text>

      {job.location_address ? (
        <>
          <Text style={styles.sectionLabel}>Location</Text>
          <Text style={styles.body}>{job.location_address}</Text>
        </>
      ) : null}

      {isActive ? (
        <>
          <Text style={styles.sectionLabel}>Quote</Text>
          <TextInput
            style={styles.input}
            placeholder="Custom amount (optional)"
            value={quoteAmount}
            onChangeText={setQuoteAmount}
            keyboardType="decimal-pad"
            testID="quote-amount-input"
          />
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Note (optional)"
            value={quoteNote}
            onChangeText={setQuoteNote}
            multiline
            testID="quote-note-input"
          />
          <TouchableOpacity
            style={[styles.button, styles.quoteButton]}
            onPress={handleSubmitQuote}
            disabled={loading}
            testID="quote-submit-button"
          >
            <Text style={styles.quoteButtonText}>
              {job.quote ? 'Update Quote' : 'Submit Quote'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.completeButton]}
            onPress={handleComplete}
            disabled={loading}
            testID="complete-button"
          >
            <Text style={styles.completeButtonText}>Mark Complete</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  date: { fontSize: 12, color: '#94a3b8' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, marginTop: 16 },
  description: { fontSize: 15, color: '#0f172a', lineHeight: 22 },
  body: { fontSize: 14, color: '#475569' },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  button: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  quoteButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
  quoteButtonText: { fontWeight: '600', color: '#334155' },
  completeButton: { backgroundColor: '#2563eb' },
  completeButtonText: { fontWeight: '700', color: '#fff' },
});
