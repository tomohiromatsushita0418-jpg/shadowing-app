/**
 * generateComposition.ts
 *
 * For each newest topic that doesn't yet have a quick-composition set, ask
 * Gemini to create 10 Japanese→English "instant composition" (瞬間英作文)
 * problems based on that day's topic. Saved to data/composition.json.
 *
 * This is a text-generation call (gemini-2.5-flash-lite), which has a separate,
 * much larger quota than the TTS models — so it does NOT compete with the daily
 * audio budget.
 *
 * data/composition.json shape:
 *   { "<topicId>": { title, titleJa, category, createdAt, problems: [
 *       { ja: "<和文>", en: "<自然な英訳(模範解答)>", point: "<注目ポイント(任意)>" }, ... ] } }
 *
 * Run: tsx scripts/generateComposition.ts
 * Requires: GEMINI_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string; ja: string }
interface Topic {
  id: string; title: string; titleJa?: string;
  category: string; createdAt?: string; sentences: Sentence[];
}
interface Problem { ja: string; en: string; point?: string }
interface CompoSet {
  title: string; titleJa?: string; category: string;
  createdAt?: string; problems: Problem[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const OUT = path.join(ROOT, 'data', 'composition.json');

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const PER_TOPIC = Number(process.env.COMPOSITION_PROBLEMS ?? 10);
// How many recent topics to cover per run (0 = all missing).
const TAIL = Number(process.env.COMPOSITION_TOPICS_TAIL ?? 0);
const MAX_TOPICS_PER_RUN = Number(process.env.MAX_COMPOSITION_TOPICS_PER_RUN ?? 3);

function loadTopics(): Topic[] {
  return JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
}
function loadOut(): Record<string, CompoSet> {
  if (!fs.existsSync(OUT)) return {};
  return JSON.parse(fs.readFileSync(OUT, 'utf8') || '{}');
}
function saveOut(d: Record<string, CompoSet>): void {
  fs.writeFileSync(OUT, JSON.stringify(d, null, 2) + '\n');
}

async function makeProblems(topic: Topic): Promise<Problem[]> {
  const key = process.env.GEMINI_API_KEY!;
  const context = topic.sentences.map((s, i) => `${i + 1}. ${s.en}`).join('\n');
  const prompt = `あなたは英語学習アプリの問題作成者です。以下のトピック「${topic.title}${
    topic.titleJa ? '（' + topic.titleJa + '）' : ''
  }」の内容をもとに、TOEIC 700→990 レベルの日本人学習者向けに「瞬間英作文」の問題を${PER_TOPIC}問作ってください。

トピックの英文（語彙・テーマの参考）:
${context}

要件:
- 各問題は「日本語の文」を提示し、それを英語に訳す形式
- 難易度は上記トピックと同等（ビジネス/報道でも使える自然で洗練された表現）
- このトピックで登場した語彙・言い回しを活かす
- 和文は自然な日本語（直訳っぽくしない）
- en は最も自然な模範解答（1文）
- point は、その問題で特に意識してほしい文法・語法・言い回しのヒント（日本語で簡潔に、任意）
- ${PER_TOPIC}問すべて異なる文型・表現を扱い、易しい順に並べる

JSON配列のみ返す。例:
[
  {"ja": "その会社は不確実な市場環境の中で戦略を見直さざるを得なかった。", "en": "The company was forced to rethink its strategy amid uncertain market conditions.", "point": "be forced to do / amid の使い方"},
  ...
]`;

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
          }),
        }
      );
      if (res.status === 429 || !res.ok) continue;
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        const problems = arr
          .filter((p: any) => p && p.ja && p.en)
          .map((p: any) => ({
            ja: String(p.ja).trim(),
            en: String(p.en).trim(),
            point: p.point ? String(p.point).trim() : undefined,
          }))
          .slice(0, PER_TOPIC);
        if (problems.length) return problems;
      }
    } catch {}
  }
  throw new Error('All models failed');
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY not set — skipping composition generation.');
    return;
  }
  let topics = loadTopics();
  if (TAIL > 0 && topics.length > TAIL) topics = topics.slice(-TAIL);
  const out = loadOut();

  let done = 0;
  for (const topic of [...topics].reverse()) {
    if (out[topic.id]?.problems?.length) continue;
    try {
      console.log(`[${topic.id}] ${topic.titleJa || topic.title} …`);
      const problems = await makeProblems(topic);
      out[topic.id] = {
        title: topic.title,
        titleJa: topic.titleJa,
        category: topic.category,
        createdAt: topic.createdAt,
        problems,
      };
      saveOut(out);
      console.log(`  -> ${problems.length} problems`);
      done++;
      if (done >= MAX_TOPICS_PER_RUN) { console.log('reached per-run cap'); break; }
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error('  fail:', e instanceof Error ? e.message : e);
      if (e instanceof Error && /All models|429/.test(e.message)) {
        console.log('  rate limited — stopping, will retry next run.');
        break;
      }
    }
  }
  console.log(`Done. Generated composition sets for ${done} topic(s). Total: ${Object.keys(out).length}.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
