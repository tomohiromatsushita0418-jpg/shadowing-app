import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePhraseBook, type SavedPhrase } from '../hooks/usePhraseBook';
import { usePhraseReview } from '../hooks/usePhraseReview';
import phraseAudio from '../data/phraseAudio.json';
import { audioKey, playShort } from '../lib/audio';
import { useAccount } from '../lib/account';
import LockedNotice from '../components/LockedNotice';

const PHRASE_AUDIO: Record<string, string> = phraseAudio as Record<string, string>;
const SESSION = 10;

interface Q { phrase: SavedPhrase; options: string[]; correct: number }

function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

export default function PhraseQuizScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { phrases } = usePhraseBook();
  const { record, weight, ready } = usePhraseReview();
  const { ready: accountReady, hasAccess } = useAccount();

  useEffect(() => { navigation.setOptions({ title: '熟語クイズ' }); }, [navigation]);

  // Build a weak-first session of 4-choice questions. Built once ready.
  const [questions, setQuestions] = useState<Q[]>([]);
  useEffect(() => {
    if (!ready || questions.length || phrases.length < 4) return;
    const scored = phrases.map((p) => ({ p, k: Math.random() / (weight(p.phrase) + 0.3) }));
    scored.sort((a, b) => a.k - b.k);
    const picked = scored.slice(0, SESSION).map((x) => x.p);
    const all = phrases.map((p) => p.phrase);
    const qs: Q[] = picked.map((p) => {
      const distractors = shuffle(all.filter((x) => x !== p.phrase)).slice(0, 3);
      const opts = shuffle([p.phrase, ...distractors]);
      return { phrase: p, options: opts, correct: opts.indexOf(p.phrase) };
    });
    setQuestions(qs);
  }, [ready, phrases, weight, questions.length]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const q = questions[idx];

  const choose = useCallback((i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    const ok = i === q.correct;
    if (ok) setScore((s) => s + 1);
    record(q.phrase.phrase, ok);
    playShort(q.phrase.phrase, PHRASE_AUDIO[audioKey(q.phrase.phrase)]);
  }, [picked, q, record]);

  const next = useCallback(() => { setIdx((i) => i + 1); setPicked(null); }, []);
  const restart = useCallback(() => { setQuestions([]); setIdx(0); setPicked(null); setScore(0); }, []);

  if (!accountReady) return <View style={styles.container} />;
  if (!hasAccess) return <View style={styles.container}><LockedNotice what="熟語クイズ" /></View>;

  if (phrases.length < 4) {
    return (
      <View style={styles.empty}>
        <Ionicons name="albums-outline" size={48} color="#475569" />
        <Text style={styles.emptyTitle}>熟語が足りません</Text>
        <Text style={styles.emptySub}>
          クイズには4つ以上の保存が必要です。{'\n'}各文の「覚えたい表現」から ＋ で保存してください。
        </Text>
      </View>
    );
  }

  if (idx >= questions.length && questions.length > 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="trophy" size={52} color="#fbbf24" />
        <Text style={styles.emptyTitle}>{questions.length}問中 {score}問 正解！</Text>
        <Pressable style={styles.primaryBtn} onPress={restart}>
          <Ionicons name="refresh" size={18} color="#0b1220" />
          <Text style={styles.primaryBtnText}>もう一度（苦手を優先）</Text>
        </Pressable>
      </View>
    );
  }

  if (!q) return <View style={styles.container} />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
    >
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>問題 {idx + 1} / {questions.length}</Text>
        <Text style={styles.scoreText}>正解 {score}</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${((idx + (picked !== null ? 1 : 0)) / questions.length) * 100}%` }]} />
      </View>

      <Text style={styles.prompt}>この意味の表現は？</Text>
      <View style={styles.meaningCard}>
        <Text style={styles.meaningText}>{q.phrase.meaning}</Text>
      </View>

      {q.options.map((opt, i) => {
        const isCorrect = i === q.correct;
        const isPicked = i === picked;
        const revealed = picked !== null;
        return (
          <Pressable
            key={i}
            style={[
              styles.opt,
              revealed && isCorrect && styles.optCorrect,
              revealed && isPicked && !isCorrect && styles.optWrong,
            ]}
            onPress={() => choose(i)}
            disabled={revealed}
          >
            <Text style={[styles.optText, revealed && (isCorrect || isPicked) && styles.optTextStrong]}>{opt}</Text>
            {picked !== null && isCorrect && <Ionicons name="checkmark-circle" size={18} color="#34d399" />}
            {picked !== null && isPicked && !isCorrect && <Ionicons name="close-circle" size={18} color="#f87171" />}
          </Pressable>
        );
      })}

      {picked !== null && (
        <View style={styles.reveal}>
          {q.phrase.usage ? <Text style={styles.usage}>💬 {q.phrase.usage}</Text> : null}
          <Pressable style={styles.primaryBtn} onPress={next}>
            <Text style={styles.primaryBtnText}>{idx + 1 >= questions.length ? '結果を見る' : '次へ'}</Text>
            <Ionicons name="arrow-forward" size={18} color="#0b1220" />
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  scroll: { padding: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressText: { color: '#e2e8f0', fontSize: 13, fontWeight: '800' },
  scoreText: { color: '#34d399', fontSize: 13, fontWeight: '800' },
  progressBar: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 22 },
  progressFill: { height: 4, backgroundColor: '#fbbf24', borderRadius: 2 },
  prompt: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 },
  meaningCard: {
    backgroundColor: '#161b27', borderRadius: 16, borderWidth: 1, borderColor: '#1e2d45',
    padding: 20, marginBottom: 20,
  },
  meaningText: { color: '#f1f5f9', fontSize: 20, lineHeight: 30, fontWeight: '600' },
  opt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12,
    paddingVertical: 15, paddingHorizontal: 16, marginBottom: 10,
  },
  optCorrect: { borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.1)' },
  optWrong: { borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.1)' },
  optText: { color: '#e2e8f0', fontSize: 16, fontWeight: '600', flex: 1 },
  optTextStrong: { fontWeight: '800' },
  reveal: { marginTop: 8 },
  usage: { color: '#94a3b8', fontSize: 13, fontStyle: 'italic', marginBottom: 14, lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#fbbf24', paddingVertical: 15, borderRadius: 999, marginTop: 8,
  },
  primaryBtnText: { color: '#0b1220', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f14', paddingHorizontal: 32, gap: 12 },
  emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  emptySub: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
