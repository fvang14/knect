import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function ReconnectingBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <View style={styles.banner} testID="reconnecting-banner">
      <Text style={styles.text}>Reconnecting…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#fbbf24',
    paddingVertical: 6,
    alignItems: 'center',
  },
  text: { fontSize: 12, fontWeight: '600', color: '#78350f' },
});
