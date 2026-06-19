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

const CATEGORIES = [
  'Daily Conversation',
  'Business',
  'Current Affairs',
  'Chemical Industry',
] as const;
const MODEL = 'gemini-2.5-flash';

// Extra prompting guidance for categories that need more than their name to
// produce the intended content. Keyed by category string.
const CATEGORY_GUIDANCE: Record<string, string> = {
  'Chemical Industry':
    'This topic must read like a recent news/briefing piece about the global chemical industry. ' +
    'Cover current developments and trends such as specialty chemicals, petrochemicals, ' +
    'green/sustainable chemistry and decarbonization, battery and semiconductor materials, ' +
    'supply-chain dynamics, M&A, regulation, and innovation. You may reference major players ' +
    '(e.g. BASF, Dow, Mitsubishi Chemical, Shin-Etsu, Sinopec) and realistic industry themes. ' +
    'Write in the polished register of a professional trade-press briefing.',
};

// Free tier TTS allows ~15 audio generations per day, so a topic must
// stay within that budget. We generate ONE topic per day and rotate the
// category by day-of-year so all categories get coverage.
const MAX_SENTENCES_PER_TOPIC = 12;

function pickCategoryForToday(): string {
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const day = Math.floor((now.getTime() - start) / 86400000);
  return CATEGORIES[day % CATEGORIES.length];
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

async function generateOneTopic(category: string, existingTitles: string[]): Promise<Omit<Topic, 'id'>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required.');

  const avoid = existingTitles.slice(-30).join('; ') || '(none)';
  const guidance = CATEGORY_GUIDANCE[category];
  const prompt = `You are creating English shadowing practice content for advanced Japanese learners (TOEIC 700 to 990 level).

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

  const category = process.env.TOPIC_CATEGORY || pickCategoryForToday();
  console.log(`Loaded ${topics.length} existing topics.`);
  console.log(`Today's category: ${category}`);

  try {
    const t = await generateOneTopic(category, existingTitles);
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
