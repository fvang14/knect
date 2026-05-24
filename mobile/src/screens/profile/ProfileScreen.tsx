import React, { useCallback, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as api from '@/api/client';
import { STATIC_TRADE_CATEGORIES } from '@/lib/constants';
import type { RateUnit } from '@/lib/types';

export function ProfileScreen() {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [baseRate, setBaseRate] = useState('');
  const [rateUnit, setRateUnit] = useState<RateUnit>('per_hour');
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.getProfile().then((p) => {
        setDisplayName(p.display_name);
        setBio(p.bio ?? '');
        setBaseRate(p.base_rate != null ? String(p.base_rate) : '');
        setRateUnit(p.base_rate_unit ?? 'per_hour');
        setSelectedCatIds(p.trade_categories.map((c) => c.id));
      }).catch(() => {});
    }, []),
  );

  function toggleCategory(id: string) {
    setSelectedCatIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await api.updateProfile({
        display_name: displayName,
        bio: bio || undefined,
        base_rate: baseRate ? parseFloat(baseRate) : undefined,
        base_rate_unit: rateUnit,
        category_ids: selectedCatIds,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Display Name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Your name"
        testID="display-name-input"
      />

      <Text style={styles.sectionTitle}>Bio</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={bio}
        onChangeText={setBio}
        placeholder="Tell customers about yourself"
        multiline
        testID="bio-input"
      />

      <Text style={styles.sectionTitle}>Base Rate</Text>
      <View style={styles.rateRow}>
        <TextInput
          style={[styles.input, styles.rateInput]}
          value={baseRate}
          onChangeText={setBaseRate}
          placeholder="0.00"
          keyboardType="decimal-pad"
          testID="base-rate-input"
        />
        <View style={styles.unitToggle}>
          {(['per_hour', 'per_job'] as RateUnit[]).map((unit) => (
            <TouchableOpacity
              key={unit}
              onPress={() => setRateUnit(unit)}
              style={[styles.unitOption, rateUnit === unit && styles.unitOptionActive]}
              testID={`rate-unit-${unit}`}
            >
              <Text style={[styles.unitText, rateUnit === unit && styles.unitTextActive]}>
                {unit === 'per_hour' ? '/hr' : '/job'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>Trade Categories</Text>
      <View style={styles.categories}>
        {STATIC_TRADE_CATEGORIES.map((cat) => {
          const selected = selectedCatIds.includes(cat.id);
          return (
            <TouchableOpacity
              key={cat.id}
              onPress={() => toggleCategory(cat.id)}
              style={[styles.chip, selected && styles.chipActive]}
              testID={`category-chip-${cat.id}`}
            >
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {cat.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>Saved!</Text> : null}

      <TouchableOpacity
        style={[styles.saveButton, loading && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={loading}
        testID="save-button"
      >
        <Text style={styles.saveButtonText}>{loading ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginTop: 20, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  rateRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  rateInput: { flex: 1 },
  unitToggle: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' },
  unitOption: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff' },
  unitOptionActive: { backgroundColor: '#2563eb' },
  unitText: { fontSize: 13, color: '#475569', fontWeight: '500' },
  unitTextActive: { color: '#fff' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9999,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#475569' },
  chipTextActive: { color: '#fff' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 12 },
  success: { color: '#16a34a', fontSize: 13, marginTop: 12 },
  saveButton: { marginTop: 24, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
