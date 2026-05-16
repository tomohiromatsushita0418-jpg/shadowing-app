/**
 * Re-translate every topic title into more natural Japanese. Overwrites
 * titleJa even if already set. Also stamps createdAt if missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Topic {
  id: string; title: string; titleJa?: string;
  category: string; sentences: unknown[];
  createdAt?: string; titleJaImproved?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOPICS = path.resolve(__dirname, '..', 'data', 'topics.json');
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

async function translateTitle(title: string, category: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const prompt = `あなたは日本の出版・ビジネス分野でプロのコピーライター兼翻訳者です。
以下の英語のタイトルを、日本人が普段から使う自然な日本語タイトルに書き直してください。

要件:
- 直訳・逐語訳は禁止。日本語ネイティブが「これ日本語っぽい」と感じる表現に
- 外来語をそのまま英語表記で使うのも可 (例: "M&A" "クラウド")
- 不自然な四字熟語的造語は避ける ("越境M&A" のような造語は不可)
- 短く読みやすく (10-20文字程度)
- カテゴリ: ${category}
- 前置きや引用符は不要、タイトル本体だけを返す

英タイトル: ${title}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim().replace(/^["「『]|["」』]$/g, '');
}

async function main() {
  const topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  let updated = 0;
  for (const t of topics) {
    if (!t.createdAt) t.createdAt = new Date().toISOString();
    if (t.titleJaImproved) {
      console.log(`[${t.id}] skip (already improved): ${t.titleJa}`);
      continue;
    }
    try {
      const before = t.titleJa ?? '(none)';
      t.titleJa = await translateTitle(t.title, t.category);
      t.titleJaImproved = true;
      console.log(`[${t.id}] ${before} -> ${t.titleJa}`);
      updated++;
      fs.writeFileSync(TOPICS, JSON.stringify(topics, null, 2) + '\n');
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) {
      console.error(`[${t.id}] !!`, e);
      if (e instanceof Error && /429/.test(e.message)) break;
    }
  }
  console.log(`Done. Updated ${updated} titles.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
