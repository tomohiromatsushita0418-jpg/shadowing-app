import React, { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { topics } from '../data/topics';
import { useProgress } from '../hooks/useProgress';
import { useComposeProgress } from '../hooks/useComposeProgress';
import { usePhraseBook } from '../hooks/usePhraseBook';

const DAY_MS = 86400000;
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Stat({ icon, color, value, label }: { icon: any; color: string; value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { completedCount, streak, studyDays } = useProgress();
  const { overallSummary } = useComposeProgress();
  const { phrases } = usePhraseBook();

  useEffect(() => { navigation.setOptions({ title: '学習の記録' }); }, [navigation]);

  const compo = overallSummary();
  const understoodPct = compo.answered > 0 ? Math.round((compo.understood / compo.answered) * 100) : 0;
  const donePct = topics.length > 0 ? Math.round((completedCount / topics.length) * 100) : 0;

  // Last 14 days activity strip.
  const days = useMemo(() => {
    const set = new Set(studyDays);
    const arr: { label: string; active: boolean; isToday: boolean }[] = [];
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today.getTime() - i * DAY_MS);
      arr.push({ label: String(d.getDate()), active: set.has(ymd(d)), isToday: i === 0 });
    }
    return arr;
  }, [studyDays]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}>
      {/* Streak hero */}
      <View style={styles.streakCard}>
        <Text style={styles.streakNum}>{streak > 0 ? `🔥 ${streak}` : '0'}</Text>
        <Text style={styles.streakLabel}>日連続 学習中</Text>
      </View>

      {/* Activity strip */}
      <Text style={styles.sectionTitle}>この2週間</Text>
      <View style={styles.strip}>
        {days.map((d, i) => (
          <View key={i} style={styles.dayCol}>
            <View style={[styles.dayDot, d.active && styles.dayDotOn, d.isToday && styles.dayDotToday]} />
            <Text style={[styles.dayLabel, d.isToday && styles.dayLabelToday]}>{d.label}</Text>
          </View>
        ))}
      </View>

      {/* Stats grid */}
      <Text style={styles.sectionTitle}>これまでの成果</Text>
      <View style={styles.grid}>
        <Stat icon="checkmark-done" color="#34d399" value={`${completedCount}`} label={`完了エピソード (${donePct}%)`} />
        <Stat icon="create" color="#22d3ee" value={compo.answered > 0 ? `${understoodPct}%` : '—'} label={`英作文 理解度`} />
        <Stat icon="bookmark" color="#fbbf24" value={`${phrases.length}`} label="保存した熟語" />
        <Stat icon="calendar" color="#a78bfa" value={`${studyDays.length}`} label="学習した日数" />
      </View>

      <Text style={styles.hint}>
        毎日1本の「聴く→組み立てる→添削」で、確実に積み上がります。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  scroll: { padding: 16 },
  streakCard: {
    backgroundColor: '#161b27',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1e2d45',
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 24,
  },
  streakNum: { color: '#f8fafc', fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  streakLabel: { color: '#94a3b8', fontSize: 14, marginTop: 6, fontWeight: '600' },
  sectionTitle: {
    color: '#e2e8f0', fontSize: 14, fontWeight: '800',
    letterSpacing: 0.3, marginBottom: 12,
  },
  strip: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 28,
  },
  dayCol: { alignItems: 'center', gap: 6 },
  dayDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#1e293b' },
  dayDotOn: { backgroundColor: '#34d399' },
  dayDotToday: { borderWidth: 2, borderColor: '#f8fafc' },
  dayLabel: { color: '#475569', fontSize: 10 },
  dayLabelToday: { color: '#e2e8f0', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  stat: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#161b27',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e2d45',
    padding: 16,
  },
  statIcon: {
    width: 34, height: 34, borderRadius: 10, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  statValue: { color: '#f8fafc', fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: '#94a3b8', fontSize: 12, marginTop: 2, fontWeight: '600' },
  hint: { color: '#64748b', fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
