/**
 * One-off: rewrite every Japanese translation in data/topics.json so
 * it reads as natural, professional Japanese (not a literal/word-for-word
 * machine translation). Uses Gemini with batched calls per topic.
 *
 * Run: tsx scripts/improveTranslations.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string; ja: string; audioPath?: string }
interface Topic { id: string; title: string; titleJa?: string; category: string; sentences: Sentence[]; jaImproved?: boolean }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOPICS = path.resolve(__dirname, '..', 'data', 'topics.json');
// 2.5-flash-lite has a separate (higher) free quota than 2.5-flash
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

async function retranslate(sentences: { en: string; ja: string }[]): Promise<string[]> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

  const numbered = sentences.map((s, i) => `${i + 1}. EN: ${s.en}\n   旧訳: ${s.ja}`).join('\n\n');
  const prompt = `あなたはプロの英日翻訳者です。以下の英文と既存の日本語訳を見て、各英文について、より自然で洗練された日本語訳に書き直してください。

要件:
- 直訳ではなく、日本語として自然に読める文にする
- ニュアンスや言外の含意も汲んだ意訳を恐れない
- ビジネス文書や報道記事の質感を意識する
- 既存訳に引きずられず、ゼロから書き直す気持ちで
- 番号順に、改行区切りで JSON 配列 (文字列のみ) を返す。前置きやマークダウンは禁止

英文:
${numbered}

JSON 配列のみ返してください。例: ["訳1", "訳2", "訳3"]`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  const arr = JSON.parse(text) as string[];
  if (!Array.isArray(arr)) throw new Error('Not an array');
  return arr;
}

async function main() {
  const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  let updated = 0;

  for (const topic of topics) {
    if (topic.jaImproved) {
      console.log(`[${topic.id}] already improved, skipping`);
      continue;
    }
    console.log(`[${topic.id}] ${topic.title} (${topic.sentences.length} sentences)`);
    try {
      const newJas = await retranslate(topic.sentences);
      if (newJas.length === topic.sentences.length) {
        topic.sentences.forEach((s, i) => {
          if (newJas[i] && newJas[i].trim()) s.ja = newJas[i].trim();
        });
        topic.jaImproved = true;
        updated += topic.sentences.length;
        console.log(`  -> updated ${topic.sentences.length} translations`);
        // Persist after each topic so partial progress survives crashes
        fs.writeFileSync(TOPICS, JSON.stringify(topics, null, 2) + '\n');
      } else {
        console.error(`  !! length mismatch: got ${newJas.length}, expected ${topic.sentences.length}`);
      }
      await new Promise((r) => setTimeout(r, 4500));
    } catch (e) {
      console.error(`  !! failed:`, e);
      if (e instanceof Error && /429/.test(e.message)) {
        console.log('  rate limited, stopping for now. Re-run later to continue.');
        break;
      }
    }
  }

  fs.writeFileSync(TOPICS, JSON.stringify(topics, null, 2) + '\n');
  console.log(`Done. Rewrote ${updated} translations.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
