/**
 * One-off: add a titleJa field (Japanese translation of the topic title)
 * to every topic in data/topics.json that doesn't have one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string; ja: string; audioPath?: string }
interface Topic {
  id: string; title: string; titleJa?: string;
  category: string; sentences: Sentence[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOPICS = path.resolve(__dirname, '..', 'data', 'topics.json');
const MODEL = 'gemini-2.5-flash';

async function translate(title: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `Translate this English topic title to natural Japanese. Reply with the Japanese text only, no quotes:\n\n${title}` }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

async function main() {
  const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  let updated = 0;
  for (const t of topics) {
    if (t.titleJa) continue;
    try {
      t.titleJa = await translate(t.title);
      console.log(`  ${t.title} -> ${t.titleJa}`);
      updated++;
      await new Promise((r) => setTimeout(r, 700));
    } catch (e) {
      console.error(`  fail ${t.id}:`, e);
    }
  }
  fs.writeFileSync(TOPICS, JSON.stringify(topics, null, 2) + '\n');
  console.log(`Done. Updated ${updated} topics.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
