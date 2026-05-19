/**
 * For every sentence that doesn't yet have a `phrases` array, ask Gemini
 * to extract 2-4 idiomatic phrases / collocations / expressions worth
 * memorizing, with concise Japanese explanations. Saves back to
 * data/topics.json.
 *
 * Run: tsx scripts/generatePhrases.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Phrase { phrase: string; meaning: string; usage?: string }
interface Sentence { en: string; ja: string; audioPath?: string; phrases?: Phrase[] }
interface Topic {
  id: string; title: string; titleJa?: string;
  category: string; sentences: Sentence[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOPICS = path.resolve(__dirname, '..', 'data', 'topics.json');
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const MAX_PER_RUN = Number(process.env.MAX_PHRASES_PER_RUN ?? 50);

async function extract(en: string): Promise<Phrase[]> {
  const key = process.env.GEMINI_API_KEY!;
  const prompt = `次の英文から、TOEIC700→990レベルの日本人学習者が「覚える価値がある」と感じる熟語・コロケーション・言い回し・イディオムを2〜4個抽出してください。

英文: "${en}"

要件:
- 単語1つではなく、複数語からなる表現を選ぶ
- ビジネス・報道で使える実用的なもの
- 各表現について:
  - phrase: 英語の表現 (本文に出てきた形)
  - meaning: 日本語の意味 (簡潔に、1行)
  - usage: 別の例文または使い方の補足 (1行、できれば日本語)

JSON配列のみ返してください。例:
[
  {"phrase": "in light of", "meaning": "〜を考慮して", "usage": "in light of recent events のように使う"},
  {"phrase": "across the board", "meaning": "全面的に、一律に"}
]`;

  for (const model of MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      });
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        return arr
          .filter((p: any) => p && p.phrase && p.meaning)
          .map((p: any) => ({
            phrase: String(p.phrase).trim(),
            meaning: String(p.meaning).trim(),
            usage: p.usage ? String(p.usage).trim() : undefined,
          }))
          .slice(0, 4);
      }
    } catch {}
  }
  throw new Error('All models failed');
}

async function main() {
  const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  let generated = 0;
  outer: for (const topic of [...topics].reverse()) {
    for (const s of topic.sentences) {
      if (s.phrases && s.phrases.length > 0) continue;
      try {
        console.log(`[${topic.id}] "${s.en.slice(0, 60)}..."`);
        const phrases = await extract(s.en);
        s.phrases = phrases;
        generated++;
        fs.writeFileSync(TOPICS, JSON.stringify(topics, null, 2) + '\n');
        console.log(`  -> ${phrases.length} phrases`);
        if (generated >= MAX_PER_RUN) {
          console.log('reached cap');
          break outer;
        }
        await new Promise((r) => setTimeout(r, 1500));
      } catch (e) {
        console.error('  fail:', e);
        if (e instanceof Error && /All models|429/.test(e.message)) {
          console.log('  rate limited. Stop, retry tomorrow.');
          break outer;
        }
      }
    }
  }
  console.log(`Done. Generated phrases for ${generated} sentences.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
