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
import { topics } from '../data/topics';
import { useComposeProgress, type Verdict } from '../hooks/useComposeProgress';
import { useAccount } from '../lib/account';
import LockedNotice from '../components/LockedNotice';

interface PhraseLite { phrase: string }
interface Problem {
  topicId: string;
  sIndex: number;
  ja: string;
  en: string;
  phrases?: PhraseLite[];
}

const GRADE_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const RANDOM_COUNT = 10;

interface Grade {
  verdict: Verdict;
  score: number;
  best: string;
  feedback: string;
  nuance?: string;
  alternatives?: string[];
}

// --- tile building ----------------------------------------------------------

const normPhrase = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
const normTok = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, '');

/** Split the reference sentence into tappable tiles: individual words, but
 *  known idioms/phrases are merged into a single multi-word tile. */
function buildTiles(en: string, phrases?: PhraseLite[]): string[] {
  const tokens = en.trim().split(/\s+/).filter(Boolean);
  const used = new Array(tokens.length).fill(false);
  const groups: { start: number; len: number }[] = [];
  const phraseList = (phrases ?? [])
    .map((p) => normPhrase(p.phrase))
    .filter((p) => p.includes(' ')) // only multi-word phrases become tiles
    .sort((a, b) => b.length - a.length);

  for (const ph of phraseList) {
    const pw = ph.split(' ');
    for (let i = 0; i + pw.length <= tokens.length; i++) {
      if (used.slice(i, i + pw.length).some(Boolean)) continue;
      let ok = true;
      for (let j = 0; j < pw.length; j++) {
        if (normTok(tokens[i + j]) !== pw[j]) { ok = false; break; }
      }
      if (ok) {
        for (let j = 0; j < pw.length; j++) used[i + j] = true;
        groups.push({ start: i, len: pw.length });
        break;
      }
    }
  }

  const tiles: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const g = groups.find((gr) => gr.start === i);
    if (g) { tiles.push(tokens.slice(i, i + g.len).join(' ')); i += g.len; }
    else { tiles.push(tokens[i]); i++; }
  }
  return tiles;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Word-level LCS diff between the learner's answer and the best sentence.
// `common` words match; the rest are highlighted (extra/wrong on the answer
// side, missing/better on the model side).
type DiffPart = { text: string; common: boolean };
function diffWords(a: string, b: string): { a: DiffPart[]; b: DiffPart[] } {
  const A = a.trim().split(/\s+/).filter(Boolean);
  const B = b.trim().split(/\s+/).filter(Boolean);
  const nrm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
  const n = A.length, m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = nrm(A[i]) === nrm(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ra: DiffPart[] = [], rb: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (nrm(A[i]) === nrm(B[j])) { ra.push({ text: A[i], common: true }); rb.push({ text: B[j], common: true }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ra.push({ text: A[i], common: false }); i++; }
    else { rb.push({ text: B[j], common: false }); j++; }
  }
  while (i < n) { ra.push({ text: A[i], common: false }); i++; }
  while (j < m) { rb.push({ text: B[j], common: false }); j++; }
  return { a: ra, b: rb };
}

// --- grading ----------------------------------------------------------------

async function gradeAnswer(problem: Problem, answer: string): Promise<Grade> {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!key) throw new Error('no-key');
  const prompt = `あなたは経験豊富な英語コーチです。日本人学習者(中上級〜上級)の「瞬間英作文」を添削します。

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

// --- screen -----------------------------------------------------------------

export default function CompositionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { topicId, index, mode } = useLocalSearchParams<{ topicId?: string; index?: string; mode?: string }>();
  const { store, getRecord, saveRecord, topicSummary, reviewWeight, ready: progressReady } = useComposeProgress();
  const { ready: accountReady, hasAccess } = useAccount();
  const wrongMode = mode === 'wrong' && !topicId;
  const isRandom = !topicId;

  // Topic mode → that topic's sentences in order.
  const topicProblems: Problem[] = useMemo(() => {
    if (!topicId) return [];
    const t = topics.find((x) => x.id === topicId);
    if (!t) return [];
    return t.sentences.map((s, i) => ({
      topicId: t.id, sIndex: i, ja: s.ja, en: s.en, phrases: s.phrases,
    }));
  }, [topicId]);

  // Random mode → weak-first spaced review across every episode. Sentences you
  // got wrong (needs_work) or haven't tried surface far more often than ones
  // you've already nailed. Built once, after saved progress has loaded.
  const [randomProblems, setRandomProblems] = useState<Problem[]>([]);
  const [randomBuilt, setRandomBuilt] = useState(false);
  useEffect(() => {
    if (topicId || !progressReady || randomBuilt) return;
    const pool: Problem[] = [];
    for (const t of topics) {
      t.sentences.forEach((s, i) =>
        pool.push({ topicId: t.id, sIndex: i, ja: s.ja, en: s.en, phrases: s.phrases })
      );
    }

    if (wrongMode) {
      // Only sentences the learner previously got wrong (要修正).
      const wrong = pool.filter((p) => store[`${p.topicId}#${p.sIndex}`]?.verdict === 'needs_work');
      setRandomProblems(shuffle(wrong));
    } else {
      // Weighted shuffle: draw with probability ∝ (reviewWeight + 0.3) so even
      // "perfect" items appear occasionally.
      const scored = pool.map((p) => ({
        p, key: Math.random() / (reviewWeight(p.topicId, p.sIndex) + 0.3),
      }));
      scored.sort((a, b) => a.key - b.key);
      setRandomProblems(scored.slice(0, RANDOM_COUNT).map((x) => x.p));
    }
    setRandomBuilt(true);
  }, [topicId, progressReady, randomBuilt, reviewWeight, wrongMode, store]);

  const problems = isRandom ? randomProblems : topicProblems;

  const [idx, setIdx] = useState(() => {
    if (topicId) {
      const n = Number(index);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    }
    return 0;
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [typed, setTyped] = useState('');
  const [typeMode, setTypeMode] = useState(false);
  const [grading, setGrading] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    navigation.setOptions({ title: wrongMode ? '間違えた問題を復習' : '瞬間英作文' });
  }, [navigation, wrongMode]);

  const problem = problems[idx];

  // Shuffled tiles, stable per problem.
  const tiles = useMemo(
    () => (problem ? shuffle(buildTiles(problem.en, problem.phrases)) : []),
    [problem?.topicId, problem?.sIndex]
  );

  const answer = typeMode
    ? typed.trim()
    : selected.map((i) => tiles[i]).join(' ').trim();

  const summary = topicId && problem ? topicSummary(topicId, problems.length) : null;
  const prevRecord = problem ? getRecord(problem.topicId, problem.sIndex) : undefined;

  const submit = useCallback(async () => {
    if (!answer || !problem) return;
    setGrading(true);
    setError(null);
    setGrade(null);
    try {
      const g = await gradeAnswer(problem, answer);
      setGrade(g);
      saveRecord(problem.topicId, problem.sIndex, { verdict: g.verdict, score: g.score });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setError('採点に失敗しました。通信環境を確認してもう一度お試しください。');
    } finally {
      setGrading(false);
    }
  }, [answer, problem, saveRecord]);

  const goTo = useCallback((n: number) => {
    setIdx(n);
    setSelected([]);
    setTyped('');
    setGrade(null);
    setError(null);
    setShowModel(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  if (!accountReady) {
    return <View style={styles.container} />;
  }

  if (!hasAccess) {
    return (
      <View style={styles.container}>
        <LockedNotice what="瞬間英作文" />
      </View>
    );
  }

  if (isRandom && !randomBuilt) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator size="large" color="#22d3ee" />
        <Text style={styles.emptySub}>{wrongMode ? '苦手な問題を集めています…' : '苦手を優先して出題を準備中…'}</Text>
      </View>
    );
  }

  if (wrongMode && randomProblems.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="checkmark-done-circle" size={52} color="#34d399" />
        <Text style={styles.emptyTitle}>復習する間違いはありません</Text>
        <Text style={styles.emptySub}>
          「要修正」と判定された問題がここに集まります。{'\n'}
          まずは通常の瞬間英作文に挑戦してみましょう。
        </Text>
      </View>
    );
  }

  if (!problem) {
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
          <Text style={styles.emptySub}>理解度 {summary.understood} / {summary.total}{'\n'}お疲れさまでした。</Text>
        )}
        <Pressable style={styles.primaryBtn} onPress={() => goTo(0)}>
          <Ionicons name="refresh" size={18} color="#0b1220" />
          <Text style={styles.primaryBtnText}>{isRandom ? 'もう一度（別のランダム）' : '最初から'}</Text>
        </Pressable>
      </View>
    );
  }

  const v = grade ? VERDICT[grade.verdict] : null;
  const usedSet = new Set(selected);

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
          {summary ? (
            <Text style={styles.summaryText}>理解度 {summary.understood}/{summary.total}</Text>
          ) : (
            <Text style={styles.randomTag}>{wrongMode ? '苦手復習' : 'ランダム出題'}</Text>
          )}
        </View>
        <Text style={styles.topicText} numberOfLines={1}>
          {isRandom ? '過去の全エピソードから' : ''}
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
              <Text style={[styles.prevText, { color: VERDICT[prevRecord.verdict].color }]}>前回: {prevRecord.score}点</Text>
            </View>
          ) : null}
        </View>

        {/* Input header */}
        <View style={styles.inputHeader}>
          <Text style={styles.inputLabel}>
            {typeMode ? 'あなたの解答（手入力）' : '選択肢をタップして英文を組み立て'}
          </Text>
          {!grade && (
            <Pressable onPress={() => setTypeMode((m) => !m)} style={styles.modeToggleBtn}>
              <Ionicons name={typeMode ? 'apps-outline' : 'create-outline'} size={13} color="#94a3b8" />
              <Text style={styles.modeToggleText}>{typeMode ? '選択に戻す' : '手入力'}</Text>
            </Pressable>
          )}
        </View>

        {typeMode ? (
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder="Type your English here…"
            placeholderTextColor="#475569"
            multiline
            autoCapitalize="sentences"
            autoCorrect
            editable={!grade}
          />
        ) : (
          <>
            {/* Answer area */}
            <View style={styles.answerArea}>
              {selected.length === 0 ? (
                <Text style={styles.answerPlaceholder}>ここに組み立てた英文が入ります</Text>
              ) : (
                selected.map((tileIdx, pos) => (
                  <Pressable
                    key={`${tileIdx}-${pos}`}
                    style={styles.answerChip}
                    disabled={!!grade}
                    onPress={() => setSelected((s) => s.filter((_, p) => p !== pos))}
                  >
                    <Text style={styles.answerChipText}>{tiles[tileIdx]}</Text>
                  </Pressable>
                ))
              )}
            </View>

            {/* Word/phrase bank */}
            {!grade && (
              <View style={styles.bank}>
                {tiles.map((t, i) =>
                  usedSet.has(i) ? null : (
                    <Pressable
                      key={i}
                      style={styles.bankTile}
                      onPress={() => setSelected((s) => [...s, i])}
                    >
                      <Text style={styles.bankTileText}>{t}</Text>
                    </Pressable>
                  )
                )}
              </View>
            )}

            {!grade && selected.length > 0 && (
              <Pressable style={styles.clearBtn} onPress={() => setSelected([])}>
                <Ionicons name="backspace-outline" size={14} color="#64748b" />
                <Text style={styles.clearBtnText}>クリア</Text>
              </Pressable>
            )}
          </>
        )}

        {!grade && (
          <Pressable
            style={[styles.primaryBtn, (!answer || grading) && styles.btnDisabled]}
            onPress={submit}
            disabled={!answer || grading}
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

            {(() => {
              const d = diffWords(answer, grade.best);
              return (
                <>
                  <Text style={styles.yourAnswerLabel}>あなたの解答（<Text style={{ color: '#f87171' }}>赤=不要/違い</Text>）</Text>
                  <Text style={styles.yourAnswer}>
                    {d.a.map((p, i) => (
                      <Text key={i} style={p.common ? undefined : styles.diffWrong}>
                        {p.text}{i < d.a.length - 1 ? ' ' : ''}
                      </Text>
                    ))}
                  </Text>

                  <View style={styles.bestBox}>
                    <Text style={styles.sectionLabel}>💡 最も自然な英語（<Text style={{ color: '#34d399' }}>緑=入れるべき語</Text>）</Text>
                    <Text style={styles.bestText} selectable>
                      {d.b.map((p, i) => (
                        <Text key={i} style={p.common ? undefined : styles.diffAdd}>
                          {p.text}{i < d.b.length - 1 ? ' ' : ''}
                        </Text>
                      ))}
                    </Text>
                  </View>
                </>
              );
            })()}

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
              <Text style={styles.primaryBtnText}>{idx + 1 >= problems.length ? '結果を見る' : '次の問題へ'}</Text>
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
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  progressText: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  summaryText: { color: '#34d399', fontSize: 12, fontWeight: '800' },
  randomTag: { color: '#22d3ee', fontSize: 12, fontWeight: '800' },
  topicText: { color: '#64748b', fontSize: 12, marginBottom: 8, minHeight: 15 },
  progressBar: { height: 4, backgroundColor: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 20 },
  progressFill: { height: 4, backgroundColor: '#22d3ee', borderRadius: 2 },
  promptCard: {
    backgroundColor: '#161b27', borderRadius: 16, borderWidth: 1, borderColor: '#1e2d45',
    padding: 18, marginBottom: 20,
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
  inputHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inputLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600', flex: 1 },
  modeToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  modeToggleText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
  input: {
    backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12,
    padding: 14, color: '#e2e8f0', fontSize: 16, lineHeight: 24, minHeight: 90,
    textAlignVertical: 'top', marginBottom: 16,
  },
  answerArea: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 60,
    backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12,
    padding: 12, marginBottom: 14, alignItems: 'flex-start',
  },
  answerPlaceholder: { color: '#475569', fontSize: 14, fontStyle: 'italic', paddingVertical: 6 },
  answerChip: {
    backgroundColor: '#22d3ee', borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7,
  },
  answerChipText: { color: '#0b1220', fontSize: 15, fontWeight: '700' },
  bank: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  bankTile: {
    backgroundColor: '#1e2d45', borderWidth: 1, borderColor: '#334155', borderRadius: 8,
    paddingHorizontal: 11, paddingVertical: 8,
  },
  bankTileText: { color: '#e2e8f0', fontSize: 15, fontWeight: '600' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', paddingVertical: 6 },
  clearBtnText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#22d3ee', paddingVertical: 15, borderRadius: 999, marginTop: 8,
  },
  btnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#0b1220', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  errorText: { color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' },
  result: { marginTop: 22 },
  verdictBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16,
  },
  verdictLabel: { fontSize: 14, fontWeight: '800', flex: 1 },
  scoreText: { fontSize: 15, fontWeight: '900' },
  yourAnswerLabel: {
    color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  },
  yourAnswer: { color: '#cbd5e1', fontSize: 15, lineHeight: 22, marginBottom: 16, fontStyle: 'italic' },
  bestBox: {
    backgroundColor: 'rgba(34,211,238,0.06)', borderLeftWidth: 3, borderLeftColor: '#22d3ee',
    borderRadius: 8, padding: 14, marginBottom: 12,
  },
  fbBox: {
    backgroundColor: '#161b27', borderRadius: 10, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#1e2d45',
  },
  sectionLabel: { color: '#e2e8f0', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  bestText: { color: '#a5f3fc', fontSize: 17, lineHeight: 25, fontWeight: '600' },
  diffWrong: { color: '#f87171', textDecorationLine: 'line-through' },
  diffAdd: { color: '#34d399', fontWeight: '900' },
  fbText: { color: '#cbd5e1', fontSize: 14, lineHeight: 22 },
  altText: { color: '#cbd5e1', fontSize: 14, lineHeight: 24 },
  modelToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'center', paddingVertical: 10, marginTop: 4,
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
