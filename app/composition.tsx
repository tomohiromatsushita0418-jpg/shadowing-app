import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { topics, type Topic } from '../data/topics';
import { useComposeProgress, type Verdict } from '../hooks/useComposeProgress';

interface Problem { ja: string; en: string }

const GRADE_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

interface Grade {
  verdict: Verdict;
  score: number;
  best: string;
  feedback: string;
  nuance?: string;
  alternatives?: string[];
}

function latestTopic(): Topic | undefined {
  return topics.length ? topics[topics.length - 1] : undefined;
}

async function gradeAnswer(problem: Problem, answer: string): Promise<Grade> {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key) throw new Error('no-key');
  const prompt = `あなたは経験豊富な英語コーチです。日本人学習者(TOEIC 700→990)の「瞬間英作文」を添削します。

【和文(問題)】${problem.ja}
【模範解答の一例】${problem.en}
【学習者の解答】${answer}

学習者の英文を評価し、次のJSONだけを返してください（前置き不要）:
{
  "verdict": "perfect" | "good" | "needs_work",
  "score": 0-100 の整数,
  "best": "この和文に対する最も自然な英語(学習者の表現を活かしつつ最善の1文)",
  "feedback": "日本語で: 何が正しく、何が違うか、なぜか。文法・語法の誤りを具体的に指摘",
  "nuance": "日本語で: この表現が持つニュアンスや、より自然にするコツ",
  "alternatives": ["別解1", "別解2"]
}

厳しすぎず、学習者が伸びるよう具体的で actionable なアドバイスにすること。`;

  for (const model of GRADE_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
          }),
        }
      );
      if (res.status === 429 || !res.ok) continue;
      const json = await res.json();
      let text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const g = JSON.parse(text);
      return {
        verdict: g.verdict === 'perfect' || g.verdict === 'good' ? g.verdict : 'needs_work',
        score: Math.max(0, Math.min(100, Number(g.score) || 0)),
        best: String(g.best || problem.en),
        feedback: String(g.feedback || ''),
        nuance: g.nuance ? String(g.nuance) : undefined,
        alternatives: Array.isArray(g.alternatives)
          ? g.alternatives.map((a: any) => String(a)).slice(0, 3)
          : undefined,
      };
    } catch {}
  }
  throw new Error('grade-failed');
}

const VERDICT = {
  perfect: { label: '完璧！', color: '#34d399', bg: 'rgba(52,211,153,0.12)', icon: 'checkmark-circle' as const },
  good: { label: '通じる（改善の余地あり）', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', icon: 'alert-circle' as const },
  needs_work: { label: '要修正', color: '#f87171', bg: 'rgba(248,113,113,0.12)', icon: 'close-circle' as const },
};

export default function CompositionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { topicId, index } = useLocalSearchParams<{ topicId?: string; index?: string }>();
  const { getRecord, saveRecord, topicSummary } = useComposeProgress();

  const topic = useMemo(
    () => (topicId ? topics.find((t) => t.id === topicId) : latestTopic()),
    [topicId]
  );
  const problems: Problem[] = useMemo(
    () => (topic ? topic.sentences.map((s) => ({ ja: s.ja, en: s.en })) : []),
    [topic]
  );

  const [idx, setIdx] = useState(() => {
    const n = Number(index);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });
  const [answer, setAnswer] = useState('');
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (topic) navigation.setOptions({ title: '瞬間英作文' });
  }, [topic, navigation]);

  const problem = problems[idx];
  const summary = topic ? topicSummary(topic.id, problems.length) : null;
  const prevRecord = topic && problem ? getRecord(topic.id, idx) : undefined;

  const submit = useCallback(async () => {
    if (!answer.trim() || !problem || !topic) return;
    setGrading(true);
    setError(null);
    setGrade(null);
    try {
      const g = await gradeAnswer(problem, answer.trim());
      setGrade(g);
      saveRecord(topic.id, idx, { verdict: g.verdict, score: g.score });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setError('採点に失敗しました。通信環境を確認してもう一度お試しください。');
    } finally {
      setGrading(false);
    }
  }, [answer, problem, topic, idx, saveRecord]);

  const goTo = useCallback((n: number) => {
    setIdx(n);
    setAnswer('');
    setGrade(null);
    setError(null);
    setShowModel(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  if (!topic || !problems.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="create-outline" size={48} color="#475569" />
        <Text style={styles.emptyTitle}>問題がありません</Text>
        <Text style={styles.emptySub}>トピックが読み込まれていません。</Text>
      </View>
    );
  }

  if (idx >= problems.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="trophy" size={52} color="#fbbf24" />
        <Text style={styles.emptyTitle}>全{problems.length}問 完了！</Text>
        {summary && (
          <Text style={styles.emptySub}>
            理解度 {summary.understood} / {summary.total}{'\n'}お疲れさまでした。
          </Text>
        )}
        <Pressable style={styles.primaryBtn} onPress={() => goTo(0)}>
          <Ionicons name="refresh" size={18} color="#0b1220" />
          <Text style={styles.primaryBtnText}>最初から</Text>
        </Pressable>
      </View>
    );
  }

  const v = grade ? VERDICT[grade.verdict] : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.progressRow}>
          <Text style={styles.progressText}>問題 {idx + 1} / {problems.length}</Text>
          {summary && (
            <Text style={styles.summaryText}>
              理解度 {summary.understood}/{summary.total}
            </Text>
          )}
        </View>
        <Text style={styles.topicText} numberOfLines={1}>
          {topic.titleJa || topic.title}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((idx + (grade ? 1 : 0)) / problems.length) * 100}%` }]} />
        </View>

        <View style={styles.promptCard}>
          <Text style={styles.promptLabel}>この日本語を英語にしてください</Text>
          <Text style={styles.promptJa}>{problem.ja}</Text>
          {prevRecord && !grade ? (
            <View style={styles.prevRow}>
              <Ionicons name={VERDICT[prevRecord.verdict].icon} size={13} color={VERDICT[prevRecord.verdict].color} />
              <Text style={[styles.prevText, { color: VERDICT[prevRecord.verdict].color }]}>
                前回: {prevRecord.score}点
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.inputLabel}>あなたの解答（手入力・キーボードのマイクで音声入力も可）</Text>
        <TextInput
          style={styles.input}
          value={answer}
          onChangeText={setAnswer}
          placeholder="Type your English here…"
          placeholderTextColor="#475569"
          multiline
          autoCapitalize="sentences"
          autoCorrect
          editable={!grade}
        />

        {!grade && (
          <Pressable
            style={[styles.primaryBtn, (!answer.trim() || grading) && styles.btnDisabled]}
            onPress={submit}
            disabled={!answer.trim() || grading}
          >
            {grading ? (
              <ActivityIndicator size="small" color="#0b1220" />
            ) : (
              <>
                <Ionicons name="checkmark-done" size={18} color="#0b1220" />
                <Text style={styles.primaryBtnText}>採点する</Text>
              </>
            )}
          </Pressable>
        )}

        {error && <Text style={styles.errorText}>{error}</Text>}

        {grade && v && (
          <View style={styles.result}>
            <View style={[styles.verdictBadge, { backgroundColor: v.bg, borderColor: v.color }]}>
              <Ionicons name={v.icon} size={18} color={v.color} />
              <Text style={[styles.verdictLabel, { color: v.color }]}>{v.label}</Text>
              <Text style={[styles.scoreText, { color: v.color }]}>{grade.score}点</Text>
            </View>

            <Text style={styles.yourAnswerLabel}>あなたの解答</Text>
            <Text style={styles.yourAnswer}>{answer.trim()}</Text>

            <View style={styles.bestBox}>
              <Text style={styles.sectionLabel}>💡 最も自然な英語</Text>
              <Text style={styles.bestText} selectable>{grade.best}</Text>
            </View>

            {grade.feedback ? (
              <View style={styles.fbBox}>
                <Text style={styles.sectionLabel}>📝 添削・解説</Text>
                <Text style={styles.fbText}>{grade.feedback}</Text>
              </View>
            ) : null}

            {grade.nuance ? (
              <View style={styles.fbBox}>
                <Text style={styles.sectionLabel}>🎯 ニュアンス・コツ</Text>
                <Text style={styles.fbText}>{grade.nuance}</Text>
              </View>
            ) : null}

            {grade.alternatives && grade.alternatives.length > 0 ? (
              <View style={styles.fbBox}>
                <Text style={styles.sectionLabel}>🔁 別の言い方</Text>
                {grade.alternatives.map((a, i) => (
                  <Text key={i} style={styles.altText} selectable>・{a}</Text>
                ))}
              </View>
            ) : null}

            <Pressable style={styles.modelToggle} onPress={() => setShowModel((s) => !s)}>
              <Ionicons name={showModel ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" />
              <Text style={styles.modelToggleText}>元の英文（模範解答）を{showModel ? '隠す' : '見る'}</Text>
            </Pressable>
            {showModel && <Text style={styles.modelAnswer} selectable>{problem.en}</Text>}

            <Pressable style={styles.primaryBtn} onPress={() => goTo(idx + 1)}>
              <Text style={styles.primaryBtnText}>
                {idx + 1 >= problems.length ? '結果を見る' : '次の問題へ'}
              </Text>
              <Ionicons name="arrow-forward" size={18} color="#0b1220" />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  scroll: { padding: 16 },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  progressText: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  summaryText: { color: '#34d399', fontSize: 12, fontWeight: '800' },
  topicText: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  progressBar: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 20 },
  progressFill: { height: 4, backgroundColor: '#22d3ee', borderRadius: 2 },
  promptCard: {
    backgroundColor: '#161b27',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e2d45',
    padding: 18,
    marginBottom: 20,
  },
  promptLabel: {
    color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 10,
  },
  promptJa: { color: '#f1f5f9', fontSize: 19, lineHeight: 29, fontWeight: '600' },
  prevRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1e293b',
  },
  prevText: { fontSize: 12, fontWeight: '700' },
  inputLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 8, fontWeight: '600' },
  input: {
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    padding: 14,
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#22d3ee',
    paddingVertical: 15,
    borderRadius: 999,
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#0b1220', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  errorText: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  result: { marginTop: 22 },
  verdictBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  verdictLabel: { fontSize: 14, fontWeight: '800', flex: 1 },
  scoreText: { fontSize: 15, fontWeight: '900' },
  yourAnswerLabel: {
    color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  },
  yourAnswer: { color: '#cbd5e1', fontSize: 15, lineHeight: 22, marginBottom: 16, fontStyle: 'italic' },
  bestBox: {
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#22d3ee',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  fbBox: {
    backgroundColor: '#161b27',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1e2d45',
  },
  sectionLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  bestText: { color: '#a5f3fc', fontSize: 17, lineHeight: 25, fontWeight: '600' },
  fbText: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  altText: { color: '#cbd5e1', fontSize: 14, lineHeight: 24 },
  modelToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center',
    paddingVertical: 10, marginTop: 4,
  },
  modelToggleText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  modelAnswer: {
    color: '#94a3b8', fontSize: 14, lineHeight: 22, textAlign: 'center',
    backgroundColor: '#0b1220', padding: 12, borderRadius: 8, marginBottom: 4,
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#0f0f14', paddingHorizontal: 32, gap: 12,
  },
  emptyTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: '800', marginTop: 8 },
  emptySub: { color: '#64748b', fontSize: 14, textAlign: 'center', lineHeight: 21 },
});
