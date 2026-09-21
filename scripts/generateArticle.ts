/**
 * generateArticle.ts
 *
 * Writes ONE explainer article per day into seo/content/, derived from the
 * episode that was generated the same day.
 *
 * Run:      tsx scripts/generateArticle.ts
 * Requires: GEMINI_API_KEY
 * Options:  ARTICLE_TOPIC_INDEX=-1   which episode to write about (default: last)
 *           ARTICLE_FORCE=1          overwrite an existing article for that episode
 *
 * Why one a day, and why grounded in the episode:
 *
 * Publishing a large volume of generated articles about generic keywords is
 * exactly the pattern Google's scaled-content-abuse policy targets, and sites
 * doing it get removed wholesale. What is safe — and genuinely useful — is
 * writing about material we actually own: the article must quote the episode's
 * real sentences and explain the real phrase notes attached to them. That makes
 * each piece first-party content that exists nowhere else, and caps the volume
 * at the rate we produce actual teaching material.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TOPICS_PATH = path.join(ROOT, 'data', 'topics.json');
const CONTENT_DIR = path.join(ROOT, 'seo', 'content');

const MODEL = 'gemini-2.5-flash';
/** Below this, the model clearly failed to do the job and we publish nothing. */
const MIN_BODY_CHARS = 900;

interface Phrase { phrase: string; meaning: string; usage?: string }
interface Sentence { en: string; ja: string; phrases?: Phrase[] }
interface Topic {
  id: string;
  title: string;
  titleJa?: string;
  titleJaImproved?: string;
  category: string;
  createdAt?: string;
  sentences: Sentence[];
}

type Article = {
  slug: string;
  title: string;
  description: string;
  date: string;
  bodyHtml: string;
  topicId: string;
  tags: string[];
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70) || 'article'
  );
}

function esc(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, responseMimeType: 'application/json' },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
}

function buildPrompt(topic: Topic): string {
  const material = topic.sentences
    .map(
      (s, i) =>
        `${i + 1}. EN: ${s.en}\n   JA: ${s.ja}\n   表現: ${(s.phrases ?? [])
          .map((p) => `${p.phrase}（${p.meaning}）`)
          .join(' / ')}`,
    )
    .join('\n');

  return `あなたは日本人英語学習者（TOEIC 700〜900点台）向けに解説記事を書く英語講師です。

以下は「${topic.titleJaImproved || topic.titleJa || topic.title}」という学習教材の全文です。

${material}

この教材を題材に、日本語の解説記事を1本書いてください。

【厳守】
- 上の教材に**実際に出てくる英文・表現だけ**を扱うこと。教材にない例文を創作しない
- 最低3つの表現を深掘りする。それぞれ「なぜその語が選ばれているか」「類似表現との違い」「使うときの注意点」を具体的に書く
- 学習者がつまずきやすい文法構造を1つ以上取り上げて説明する
- 一般論や埋め草（「英語は大切です」等）を書かない。内容の薄い段落を作らない
- 本文は1200〜1800字程度

【出力形式】次のJSONのみを返す（前置き不要）:
{
  "title": "記事タイトル。検索されそうな具体的な語を含める。30字前後",
  "description": "記事の要約。80〜110字",
  "tags": ["タグ1", "タグ2", "タグ3"],
  "sections": [
    { "heading": "見出し", "paragraphs": ["段落1", "段落2"] }
  ]
}

paragraphs の各要素は本文の1段落。小見出しを入れたい場合だけ "### 小見出し" という要素を挟む。`;
}

/**
 * The model reliably slips Markdown into the paragraph strings despite being
 * asked for plain text, and a literal "### 1. foo" on the page looks broken.
 * Rather than fight the prompt, promote the two things it actually emits.
 */
function paragraphToHtml(paragraph: string): string {
  const heading = paragraph.match(/^#{2,4}\s+(.*)$/);
  if (heading) return `<h3>${inline(heading[1])}</h3>`;
  return `<p>${inline(paragraph)}</p>`;
}

function inline(text: string): string {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<em>$1</em>');
}

function toHtml(
  sections: { heading: string; paragraphs: string[] }[],
  topic: Topic,
  episodeNumber: number,
): string {
  const parts = sections
    .map(
      (section) =>
        `<h2>${esc(section.heading.replace(/^#{2,4}\s+/, ''))}</h2>\n${section.paragraphs
          .map(paragraphToHtml)
          .join('\n')}`,
    )
    .join('\n');

  // Always link back to the episode the article is about: it gives the reader
  // the full material and gives the episode page an internal link.
  const source = `<h2>この記事で扱った教材</h2>
<p>本記事の英文はすべて <strong>第${episodeNumber}回「${esc(
    topic.titleJaImproved || topic.titleJa || topic.title,
  )}」</strong>からの引用です。全文と音声はエピソードページでご覧いただけます。</p>`;

  return `${parts}\n${source}`;
}

async function main() {
  const topics = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf8')) as Topic[];
  if (topics.length === 0) throw new Error('No topics available.');

  const rawIndex = Number(process.env.ARTICLE_TOPIC_INDEX ?? -1);
  const index = rawIndex < 0 ? topics.length + rawIndex : rawIndex;
  const topic = topics[index];
  if (!topic) throw new Error(`No topic at index ${index}`);

  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const existing = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, f), 'utf8')) as Article);

  if (!process.env.ARTICLE_FORCE && existing.some((a) => a.topicId === topic.id)) {
    console.log(`[article] already written for topic ${topic.id} — nothing to do.`);
    return;
  }

  const response = await callGemini(buildPrompt(topic));
  const parsed = JSON.parse(response) as {
    title?: string;
    description?: string;
    tags?: string[];
    sections?: { heading?: string; paragraphs?: string[] }[];
  };

  const sections = (parsed.sections ?? [])
    .map((s) => ({
      heading: String(s.heading ?? '').trim(),
      paragraphs: (s.paragraphs ?? []).map((p) => String(p).trim()).filter(Boolean),
    }))
    .filter((s) => s.heading && s.paragraphs.length > 0);

  const bodyChars = sections.reduce((n, s) => n + s.paragraphs.join('').length, 0);
  if (!parsed.title || sections.length < 2 || bodyChars < MIN_BODY_CHARS) {
    // Publishing a stub would do more harm than publishing nothing: thin pages
    // drag the whole domain down. Fail loudly and skip the day instead.
    throw new Error(
      `Article too thin to publish (${bodyChars} chars, ${sections.length} sections). Skipping.`,
    );
  }

  const date = (topic.createdAt ? new Date(topic.createdAt) : new Date()).toISOString();
  const article: Article = {
    slug: `${date.slice(0, 10)}-${slugify(topic.title)}`,
    title: parsed.title.trim(),
    description: (parsed.description ?? '').trim() || parsed.title.trim(),
    date,
    bodyHtml: toHtml(sections, topic, index + 1),
    topicId: topic.id,
    tags: (parsed.tags ?? []).map((t) => String(t).trim()).filter(Boolean).slice(0, 4),
  };

  const file = path.join(CONTENT_DIR, `${article.slug}.json`);
  fs.writeFileSync(file, `${JSON.stringify(article, null, 2)}\n`, 'utf8');
  console.log(`[article] wrote ${path.relative(ROOT, file)} (${bodyChars} chars)`);
}

main().catch((error) => {
  console.error('[article]', error instanceof Error ? error.message : error);
  process.exit(1);
});
