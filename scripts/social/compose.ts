/**
 * Builds the day's social posts out of the day's episode.
 *
 * The posts are not marketing copy with a link bolted on — each one is a
 * self-contained piece of the actual teaching material, so it is worth reading
 * even if nobody clicks. That is both what performs on these platforms and
 * what keeps the accounts clear of automated-spam enforcement: the content
 * genuinely changes every day because the source material does.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

export interface Phrase {
  phrase: string;
  meaning: string;
  usage?: string;
}
export interface Sentence {
  en: string;
  ja: string;
  phrases?: Phrase[];
  audioPath?: string;
}
export interface Topic {
  id: string;
  title: string;
  titleJa?: string;
  titleJaImproved?: string;
  category: string;
  createdAt?: string;
  sentences: Sentence[];
}

export type PostKind = 'phrase' | 'quiz' | 'episode';

export interface Post {
  kind: PostKind;
  /** Body without the URL; the URL is appended per platform so limits work out. */
  text: string;
  url: string;
}

export function loadTopics(): Topic[] {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'topics.json'), 'utf8'),
  ) as Topic[];
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

function siteUrl(): string {
  return (process.env.SITE_URL || 'https://learn.resound.study').replace(/\/$/, '');
}

export function episodeUrl(topic: Topic, number: number): string {
  return `${siteUrl()}/episodes/${number}-${slugify(topic.title)}/`;
}

const CATEGORY_TAGS: Record<string, string[]> = {
  Business: ['#ビジネス英語', '#TOEIC'],
  'Business Negotiation': ['#ビジネス英語', '#英語交渉'],
  'Daily Conversation': ['#日常英会話', '#英語学習'],
  'Current Affairs': ['#時事英語', '#英語ニュース'],
  'Chemical Industry': ['#ビジネス英語', '#化学業界'],
  Technology: ['#英語学習', '#テック英語'],
  Medical: ['#医療英語'],
  Legal: ['#法律英語'],
  'Academic Research': ['#アカデミック英語'],
};

function tagsFor(topic: Topic): string {
  return (CATEGORY_TAGS[topic.category] ?? ['#英語学習']).concat('#シャドーイング').join(' ');
}

/** Deterministic pick so a rerun on the same day posts the same thing. */
function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

function dayNumber(topic: Topic): number {
  const date = topic.createdAt ? new Date(topic.createdAt) : new Date();
  return Math.floor(date.getTime() / 86_400_000);
}

/**
 * Three posts a day: a phrase card, a translation quiz, and the episode
 * announcement. Well inside X's free-tier ceiling of 500 writes a month.
 */
export function composePosts(topic: Topic, number: number): Post[] {
  const url = episodeUrl(topic, number);
  const seed = dayNumber(topic);
  const tags = tagsFor(topic);
  const titleJa = topic.titleJaImproved || topic.titleJa || topic.title;

  const withPhrases = topic.sentences.filter((s) => (s.phrases?.length ?? 0) > 0);
  const posts: Post[] = [];

  // 1. Phrase card — one expression, its meaning, and the sentence it came from.
  const phraseSentence = withPhrases.length ? pick(withPhrases, seed) : null;
  const phrase = phraseSentence?.phrases?.length ? pick(phraseSentence.phrases, seed) : null;
  if (phrase && phraseSentence) {
    const block = [`【今日の表現】${phrase.phrase}`, `意味: ${phrase.meaning}`];
    if (phrase.usage) block.push(`使い方: ${phrase.usage}`);
    block.push(`例: ${phraseSentence.en}\n　 ${phraseSentence.ja}`, tags);
    posts.push({ kind: 'phrase', text: block.join('\n\n'), url });
  }

  // 2. Quiz — the Japanese, ask for the English. The answer is on the page,
  //    which is the whole point: it converts curiosity into a click.
  //
  //    Drawn from the shortest sentences on purpose: a 100-character Japanese
  //    sentence is both a bad quiz prompt and too long to survive X's limit
  //    alongside the link.
  const quizSentence = pick(
    [...topic.sentences].sort((a, b) => a.ja.length - b.ja.length).slice(0, 3),
    seed + 1,
  );
  posts.push({
    kind: 'quiz',
    text: [
      '【英作文クイズ】これ、英語で言えますか？',
      `「${quizSentence.ja}」`,
      '答えと解説はこちら↓',
      tags,
    ].join('\n\n'),
    url,
  });

  // 3. Episode announcement.
  posts.push({
    kind: 'episode',
    text: [
      `【第${number}回】${titleJa}`,
      `${topic.sentences.length}文の英文を、全文和訳と表現解説つきで公開しました。`,
      `今日の1文: ${topic.sentences[0].en}`,
      tags,
    ].join('\n\n'),
    url,
  });

  return posts;
}

/**
 * X counts most CJK characters as 2 toward the 280 limit; everything else as 1.
 * A URL always counts as 23 regardless of its real length.
 */
export function xWeight(text: string): number {
  let weight = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x303e) ||
      (code >= 0x3041 && code <= 0x33ff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xa000 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe4f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    weight += isWide ? 2 : 1;
  }
  return weight;
}

const X_LIMIT = 280;
const URL_WEIGHT = 23;

/** Trims the body so body + newline + URL fits, cutting whole lines from the end. */
export function fitForX(post: Post): string {
  const budget = X_LIMIT - URL_WEIGHT - 1;
  let lines = post.text.split('\n');

  while (lines.length > 1 && xWeight(lines.join('\n')) > budget) {
    // Drop from the end but always keep the hashtag line, which is last.
    const removable = lines.length - 2;
    if (removable < 1) break;
    lines = [...lines.slice(0, removable), lines[lines.length - 1]];
  }

  let body = lines.join('\n');
  while (xWeight(body) > budget) body = body.slice(0, -1);
  return `${body}\n${post.url}`;
}

/** Threads allows 500 characters and counts them plainly. */
export function fitForThreads(post: Post): string {
  const full = `${post.text}\n${post.url}`;
  return full.length <= 500 ? full : `${full.slice(0, 496 - post.url.length)}…\n${post.url}`;
}
