import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  folderNumber: number; // 1-indexed
  start: number;        // topic index start (1-indexed)
  end: number;          // topic index end (inclusive)
  count: number;        // actual topic count in this folder
}

export default function FolderCard({ folderNumber, start, end, count }: Props) {
  const router = useRouter();
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/folder/${folderNumber}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open folder ${folderNumber}`}
    >
      <View style={styles.left}>
        <View style={styles.iconWrap}>
          <Ionicons name="folder" size={24} color="#fbbf24" />
        </View>
        <View>
          <Text style={styles.title}>セット {folderNumber}</Text>
          <Text style={styles.range}>
            トピック {start}〜{end}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.count}>{count}</Text>
        <Ionicons name="chevron-forward" size={16} color="#475569" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161b27',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2d45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  left: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1f1a08',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#e2e8f0', fontSize: 16, fontWeight: '700' },
  range: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
