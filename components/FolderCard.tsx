import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useProgress } from '../hooks/useProgress';

interface Props {
  folderNumber: number; // 1-indexed
  start: number;
  end: number;
  count: number;
  topicIds: string[]; // ids of the topics that live in this stage
}

// A small palette of accent colors cycled by stage number so each card
// feels distinct without picking colors manually.
const PALETTES: { from: string; to: string; glow: string; accent: string }[] = [
  { from: '#1e3a5f', to: '#0f1f38', glow: '#3b82f6', accent: '#60a5fa' },
  { from: '#3b1e5f', to: '#1f0f38', glow: '#a855f7', accent: '#c084fc' },
  { from: '#5f1e3a', to: '#380f1f', glow: '#ec4899', accent: '#f472b6' },
  { from: '#1e5f4a', to: '#0f3829', glow: '#10b981', accent: '#34d399' },
  { from: '#5f4a1e', to: '#38290f', glow: '#f59e0b', accent: '#fbbf24' },
];

export default function FolderCard({ folderNumber, start, end, count, topicIds }: Props) {
  const router = useRouter();
  const { completedInList } = useProgress();
  const palette = PALETTES[(folderNumber - 1) % PALETTES.length];
  const doneCount = completedInList(topicIds);
  const ratio = count > 0 ? doneCount / count : 0;
  const allDone = count > 0 && doneCount === count;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.cardOuter,
        { shadowColor: palette.glow },
        pressed && styles.pressed,
      ]}
      onPress={() => router.push(`/folder/${folderNumber}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open stage ${folderNumber}`}
    >
      <LinearGradient
        colors={[palette.from, palette.to]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <View style={styles.left}>
          <Text style={[styles.stageLabel, { color: palette.accent }]}>
            STAGE
          </Text>
          <Text style={styles.stageNumber}>
            {String(folderNumber).padStart(2, '0')}
          </Text>
          <Text style={styles.range}>
            {start}–{end}
          </Text>

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.round(ratio * 100)}%`,
                    backgroundColor: palette.accent,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: palette.accent }]}>
              {doneCount}/{count}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          {allDone ? (
            <View style={[styles.countPill, { borderColor: palette.accent }]}>
              <Ionicons name="checkmark-circle" size={15} color={palette.accent} />
              <Text style={[styles.countLabel, { color: palette.accent }]}>done</Text>
            </View>
          ) : (
            <View style={[styles.countPill, { borderColor: palette.accent }]}>
              <Text style={[styles.countText, { color: palette.accent }]}>
                {count}
              </Text>
              <Text style={styles.countLabel}>topics</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={palette.accent} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    marginVertical: 8,
    borderRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  card: {
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  left: { flex: 1 },
  stageLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 2,
  },
  stageNumber: {
    color: '#fafafa',
    fontSize: 40,
    fontWeight: '900',
    lineHeight: 44,
    letterSpacing: -1,
  },
  range: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingRight: 12,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    minWidth: 34,
    textAlign: 'right',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  countPill: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  countText: {
    fontSize: 16,
    fontWeight: '800',
  },
  countLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
