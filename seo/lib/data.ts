// Loads the app's own corpus and reshapes it for the public site.
//
// Everything on this site is generated from data the app already produced —
// original sentences, their translations, and the phrase notes attached to
// them. That is the whole point: it is a first-party corpus that exists
// nowhere else, which is what separates this from the mass-produced AI article
// farms Google deindexes.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type Phrase = { phrase: string; meaning: string; usage?: string };
export type Sentence = { en: string; ja: string; phrases?: Phrase[]; audioPath?: string };
export type Topic = {
  id: string;
  title: string;
  titleJa?: string;
  titleJaImproved?: string;
  category: string;
  createdAt?: string;
  sentences: Sentence[];
};

const DATA_DIR = resolve(import.meta.dirname, '../../data');

export function loadTopics(): Topic[] {
  const raw = readFileSync(resolve(DATA_DIR, 'topics.json'), 'utf8');
  const topics = JSON.parse(raw) as Topic[];
  // Oldest first in the file; newest first is what every listing wants.
  return topics.filter((t) => t.sentences?.length > 0);
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'item';
}

export function episodeNumber(topics: Topic[], index: number): number {
  return index + 1;
}

export function episodeSlug(topic: Topic, number: number): string {
  return `${number}-${slugify(topic.title)}`;
}

export function topicTitleJa(topic: Topic): string {
  // `titleJaImproved` is a processing flag (boolean) set by scripts/improveTitles.ts,
  // NOT the title itself — the improved title lives in `titleJa`. Reading the flag
  // here is what used to render the literal string "true" for improved topics.
  return topic.titleJa || topic.title;
}

export function topicDate(topic: Topic): string | null {
  if (!topic.createdAt) return null;
  const date = new Date(topic.createdAt);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// Phrase index
// ---------------------------------------------------------------------------

export type PhraseExample = {
  en: string;
  ja: string;
  topicIndex: number;
  topicTitle: string;
  category: string;
};

export type PhraseEntry = {
  phrase: string;
  slug: string;
  meanings: string[];
  usages: string[];
  examples: PhraseExample[];
  categories: Set<string>;
};

/** Case-insensitive key so "Proposed Acquisition" and "proposed acquisition" merge. */
function phraseKey(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildPhraseIndex(topics: Topic[]): Map<string, PhraseEntry> {
  const index = new Map<string, PhraseEntry>();
  const slugsTaken = new Set<string>();

  topics.forEach((topic, topicIndex) => {
    for (const sentence of topic.sentences) {
      for (const phrase of sentence.phrases ?? []) {
        const text = phrase.phrase?.trim();
        if (!text) continue;
        const key = phraseKey(text);

        let entry = index.get(key);
        if (!entry) {
          // Disambiguate collisions rather than letting one page overwrite another.
          let slug = slugify(text);
          let n = 2;
          while (slugsTaken.has(slug)) slug = `${slugify(text)}-${n++}`;
          slugsTaken.add(slug);

          entry = {
            phrase: text,
            slug,
            meanings: [],
            usages: [],
            examples: [],
            categories: new Set(),
          };
          index.set(key, entry);
        }

        if (phrase.meaning && !entry.meanings.includes(phrase.meaning)) {
          entry.meanings.push(phrase.meaning);
        }
        if (phrase.usage && !entry.usages.includes(phrase.usage)) {
          entry.usages.push(phrase.usage);
        }
        entry.categories.add(topic.category);
        if (!entry.examples.some((e) => e.en === sentence.en)) {
          entry.examples.push({
            en: sentence.en,
            ja: sentence.ja,
            topicIndex,
            topicTitle: topic.title,
            category: topic.category,
          });
        }
      }
    }
  });

  return index;
}

// ---------------------------------------------------------------------------
// Phrase collections
//
// One page per phrase would mean ~3,900 pages carrying two lines each — the
// textbook definition of thin content. Bundling them into themed collections
// of 40 gives ~100 pages that are each genuinely worth landing on, and the
// individual phrase pages are reserved for entries rich enough to stand alone.
// ---------------------------------------------------------------------------

export const COLLECTION_SIZE = 40;

export type Collection = {
  slug: string;
  category: string;
  part: number;
  totalParts: number;
  entries: PhraseEntry[];
};

export function buildCollections(index: Map<string, PhraseEntry>): Collection[] {
  const byCategory = new Map<string, PhraseEntry[]>();
  for (const entry of index.values()) {
    for (const category of entry.categories) {
      const list = byCategory.get(category) ?? [];
      list.push(entry);
      byCategory.set(category, list);
    }
  }

  const collections: Collection[] = [];
  for (const [category, entries] of byCategory) {
    // Most-attested first, so the highest-value phrases land on page 1.
    const sorted = [...entries].sort(
      (a, b) => b.examples.length - a.examples.length || a.phrase.localeCompare(b.phrase),
    );
    const totalParts = Math.ceil(sorted.length / COLLECTION_SIZE);
    for (let part = 0; part < totalParts; part++) {
      collections.push({
        slug: `${slugify(category)}-${part + 1}`,
        category,
        part: part + 1,
        totalParts,
        entries: sorted.slice(part * COLLECTION_SIZE, (part + 1) * COLLECTION_SIZE),
      });
    }
  }
  return collections;
}

export const CATEGORY_JA: Record<string, string> = {
  Business: 'ビジネス英語',
  'Business Negotiation': 'ビジネス交渉',
  'Daily Conversation': '日常会話',
  'Japan News': '時事英語（日本）',
  'World News': '時事英語（世界）',
  Travel: '旅行英語',
  Sports: 'スポーツ英語',
  History: '歴史・教養',
  Trends: 'トレンド・流行',
  'Current Affairs': '時事英語',
  'Chemical Industry': '化学・素材業界',
  Technology: 'テクノロジー',
  Medical: '医療英語',
  Legal: '法律英語',
  'Academic Research': '学術・研究',
};

export function categoryJa(category: string): string {
  return CATEGORY_JA[category] ?? category;
}
