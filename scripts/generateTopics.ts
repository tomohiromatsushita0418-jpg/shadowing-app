/**
 * generateTopics.ts
 *
 * Generates 1 new shadowing topic per run, rotating through the categories
 * (Daily Conversation / Business / Current Affairs / Chemical Industry) by
 * day-of-year, using the Google Gemini API and appending it to
 * data/topics.json.
 *
 * Run:      tsx scripts/generateTopics.ts
 * Requires: GEMINI_API_KEY (Node 22+ for built-in fetch)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string; ja: string; audioPath?: string }
interface Topic { id: string; title: string; titleJa?: string; category: string; sentences: Sentence[]; createdAt?: string }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS_PATH = path.join(ROOT, 'data', 'topics.json');

// Daily rotation, in this exact order (2026-09 spec). One topic per day, the
// category advances by one each day and wraps around.
const CATEGORIES = [
  'Daily Conversation', // 日常会話
  'Business', // ビジネス
  'Japan News', // 時事ニュース（日本）
  'World News', // 時事ニュース（世界）
  'Travel', // 旅行
  'Sports', // スポーツ
  'History', // 歴史（世界の国々を順番に）
  'Trends', // 流行
] as const;
const MODEL = 'gemini-2.5-flash';

// When the History slot comes up it walks through the world's countries in this
// order, one per visit, so the series builds a tour of world history over time.
const HISTORY_COUNTRIES = [
  'Egypt', 'Greece', 'Italy (Rome)', 'China', 'India', 'Iran (Persia)', 'Turkey',
  'United Kingdom', 'France', 'Germany', 'Spain', 'Portugal', 'the Netherlands',
  'Russia', 'the United States', 'Mexico', 'Peru', 'Brazil', 'Japan', 'Korea',
  'Mongolia', 'Vietnam', 'Thailand', 'Indonesia', 'Ethiopia', 'Mali', 'Egypt (modern)',
  'South Africa', 'Australia', 'Canada', 'Austria', 'Poland', 'Sweden', 'Greece (modern)',
] as const;

// Extra prompting guidance for categories that need more than their name to
// produce the intended content. Keyed by category string.
const CATEGORY_GUIDANCE: Record<string, string> = {
  'Daily Conversation':
    'A natural, everyday spoken-English scene (shopping, dining out, catching up with a friend, ' +
    'a phone call, small talk at work). Conversational, idiomatic, the way people actually speak.',
  'Business':
    'A realistic workplace/business situation — a meeting, a negotiation, a project update, ' +
    'a client email read aloud. Polished professional English.',
  'Japan News':
    'A recent news / current-affairs briefing about JAPAN (Japanese politics, economy, society, ' +
    'business, technology, culture), written in polished English as if reporting Japanese news to ' +
    'an international audience. Timely, specific, factual in tone.',
  'World News':
    'A recent news / current-affairs briefing about WORLD events outside Japan (international ' +
    'politics, the global economy, science and technology, major world developments), in the ' +
    'polished register of a serious news outlet.',
  'Travel':
    'A travel scene or travel-writing piece — airports and check-in, hotels, asking directions, ' +
    'sightseeing, local food and customs, trip planning. Vivid and practical.',
  'Sports':
    'A sports news / commentary piece — a match report, an athlete profile, tournament analysis, ' +
    'or a training/health angle. Energetic, specific, in the register of sports journalism.',
  'History':
    'An engaging, factual history piece. Cover key events, eras, notable figures and cultural ' +
    'legacy. Educational and vivid, in the register of good popular-history writing.',
  'Trends':
    'A piece about a current trend or pop-culture phenomenon — technology and social-media trends, ' +
    'fashion, lifestyle, entertainment, or something going viral. Fresh and contemporary.',
};

// Free tier TTS allows ~15 audio generations per day, and sentences, phrases
// and words all draw on that same budget. Keeping topics at 10 sentences
// leaves roughly 5 requests per day for phrase/word audio instead of the
// sentences consuming everything. We generate ONE topic per day and rotate the
// category by day-of-year so all categories get coverage.
const MAX_SENTENCES_PER_TOPIC = 10;

// Strict sequential rotation keyed off how many topics already exist, so the
// order stays exact even if a day's run is skipped (a date-based rotation would
// jump a category on a missed day).
function pickCategory(topicCount: number): string {
  return CATEGORIES[topicCount % CATEGORIES.length];
}

// Which country the next History topic covers: walk HISTORY_COUNTRIES by how
// many History topics already exist.
function nextHistoryCountry(topics: Topic[]): string {
  const count = topics.filter((t) => t.category === 'History').length;
  return HISTORY_COUNTRIES[count % HISTORY_COUNTRIES.length];
}

function loadTopics(): Topic[] {
  if (!fs.existsSync(TOPICS_PATH)) {
    fs.mkdirSync(path.dirname(TOPICS_PATH), { recursive: true });
    fs.writeFileSync(TOPICS_PATH, '[]');
    return [];
  }
  const raw = fs.readFileSync(TOPICS_PATH, 'utf8').trim() || '[]';
  return JSON.parse(raw) as Topic[];
}

function saveTopics(topics: Topic[]): void {
  fs.writeFileSync(TOPICS_PATH, JSON.stringify(topics, null, 2) + '\n');
}

function uniqueId(existing: Set<string>): string {
  let id: string;
  do {
    id = `t${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  } while (existing.has(id));
  existing.add(id);
  return id;
}

async function generateOneTopic(
  category: string,
  existingTitles: string[],
  extraGuidance?: string,
): Promise<Omit<Topic, 'id'>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required.');

  const avoid = existingTitles.slice(-30).join('; ') || '(none)';
  const guidance = [CATEGORY_GUIDANCE[category], extraGuidance].filter(Boolean).join(' ');
  const prompt = `You are creating English shadowing practice content for upper-intermediate to advanced Japanese learners, to strengthen their listening and speaking.

Generate ONE topic in the category: "${category}".
${guidance ? `\nCategory guidance: ${guidance}\n` : ''}
Requirements:
- EXACTLY ${MAX_SENTENCES_PER_TOPIC} sentences (no more, no less)
- Each English sentence: sophisticated, native-sounding (advanced vocabulary, idiomatic, varied syntax) appropriate for the category
- Each Japanese translation MUST be natural, polished, professional-translator-quality Japanese — NOT a literal/word-for-word machine translation. Capture nuance and implication, prioritize Japanese readability over strict word correspondence.
- All sentences relate to the same scenario/theme
- Avoid duplicating these recently-used titles: ${avoid}

Return ONLY valid JSON (no markdown fences) in this exact shape:
{
  "title": "<concise English title>",
  "titleJa": "<natural Japanese translation of the title>",
  "category": "${category}",
  "sentences": [{ "en": "<english>", "ja": "<japanese>" }]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty completion from Gemini');

  const parsed = JSON.parse(content) as Omit<Topic, 'id'>;
  if (!parsed.title || !Array.isArray(parsed.sentences)) {
    throw new Error('Invalid topic shape from model');
  }
  parsed.category = category;
  parsed.sentences = parsed.sentences
    .filter((s) => s && typeof s.en === 'string' && typeof s.ja === 'string')
    .map((s) => ({ en: s.en.trim(), ja: s.ja.trim() }));
  return parsed;
}

async function main() {
  const topics = loadTopics();
  const existingIds = new Set(topics.map((t) => t.id));
  const existingTitles = topics.map((t) => t.title);

  const category = process.env.TOPIC_CATEGORY || pickCategory(topics.length);
  const historyCountry = category === 'History' ? nextHistoryCountry(topics) : null;
  const extraGuidance = historyCountry
    ? `Center this entire piece on the history of ${historyCountry}.`
    : undefined;
  console.log(`Loaded ${topics.length} existing topics.`);
  console.log(`Today's category: ${category}${historyCountry ? ` (${historyCountry})` : ''}`);

  try {
    const t = await generateOneTopic(category, existingTitles, extraGuidance);
    if (t.sentences.length > MAX_SENTENCES_PER_TOPIC) {
      t.sentences = t.sentences.slice(0, MAX_SENTENCES_PER_TOPIC);
    }
    const id = uniqueId(existingIds);
    const topic: Topic = { id, ...t, createdAt: new Date().toISOString() } as Topic;
    topics.push(topic);
    console.log(`  -> "${topic.title}" (${topic.sentences.length} sentences) id=${id}`);
  } catch (err) {
    console.error(`  !! failed for ${category}:`, err);
  }

  saveTopics(topics);
  console.log(`Done. topics.json now has ${topics.length} topics.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
