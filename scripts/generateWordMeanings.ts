/**
 * Extract every unique word from topics.json and pre-generate its Japanese
 * meaning via Gemini, saving to data/wordMeanings.json. The client reads
 * this bundled dictionary first and only hits the API on cache miss.
 *
 * Run: tsx scripts/generateWordMeanings.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string }
interface Topic { sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const MEANINGS = path.join(ROOT, 'data', 'wordMeanings.json');

const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const BATCH_SIZE = 30;

function extractWords(): string[] {
  const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  const set = new Set<string>();
  for (const t of topics) {
    for (const s of t.sentences) {
      for (const raw of s.en.split(/\s+/)) {
        const w = raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        if (w.length >= 1) set.add(w);
      }
    }
  }
  return [...set].sort();
}

function loadMeanings(): Record<string, string> {
  if (!fs.existsSync(MEANINGS)) return {};
  return JSON.parse(fs.readFileSync(MEANINGS, 'utf8'));
}

function saveMeanings(d: Record<string, string>): void {
  fs.writeFileSync(MEANINGS, JSON.stringify(d, null, 2) + '\n');
}

async function translateBatch(words: string[]): Promise<Record<string, string>> {
  const key = process.env.GEMINI_API_KEY!;
  const list = words.map((w, i) => `${i + 1}. ${w}`).join('\n');
  const prompt = `次の英単語それぞれについて、日本語の主要な意味を簡潔に列挙してください。
形式: 各単語につき「品詞: 意味1, 意味2」形式の文字列。
- 複数の品詞があれば改行で区切る
- 必ず全単語に何らかの意味を返す (固有名詞でも推測でOK)
- 前置きや解説は不要

英単語:
${list}

JSON形式で返してください: {"単語1": "意味文字列", "単語2": "意味文字列", ...}
全${words.length}単語をキーに含めること。`;

  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          }),
        }
      );
      if (res.status === 429) {
        console.log(`  ${model} rate-limited, trying next…`);
        continue;
      }
      if (!res.ok) {
        console.log(`  ${model} error ${res.status}, trying next…`);
        continue;
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
      const parsed = JSON.parse(text);
      // Normalize keys to lowercase
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k.toLowerCase()] = v;
      }
      return out;
    } catch (e) {
      console.log(`  ${model} threw:`, e);
    }
  }
  throw new Error('All models failed for this batch');
}

async function main() {
  const allWords = extractWords();
  const meanings = loadMeanings();
  const missing = allWords.filter((w) => !meanings[w]);

  console.log(`Total unique words: ${allWords.length}`);
  console.log(`Already cached: ${allWords.length - missing.length}`);
  console.log(`Need translation: ${missing.length}`);

  if (missing.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)} (${batch.length} words)`);
    try {
      const result = await translateBatch(batch);
      let added = 0;
      for (const word of batch) {
        if (result[word]) {
          meanings[word] = result[word];
          added++;
        }
      }
      console.log(`  added ${added}/${batch.length}`);
      saveMeanings(meanings);
      // Pace
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error('  batch failed:', e);
      if (e instanceof Error && /429|All models/.test(e.message)) {
        console.log('  rate-limited across all models. Stop, retry tomorrow.');
        break;
      }
    }
  }

  console.log(`Done. Cached ${Object.keys(meanings).length} word meanings.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
