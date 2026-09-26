/**
 * youtube.ts — uploads a rendered Short to YouTube.
 *
 * Run:   tsx scripts/social/youtube.ts
 * Env:   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
 *        VIDEO_OUT=build/short.mp4        file to upload
 *        VIDEO_TOPIC_INDEX=-1             episode the video is about
 *        YOUTUBE_PRIVACY=public|unlisted|private   (default: unlisted)
 *
 * Default privacy is `unlisted` on purpose — the first few runs should be
 * reviewed before anything lands on a public channel. Flip it once the output
 * looks right.
 *
 * Quota: an upload costs 1,600 units of the default 10,000/day, so roughly six
 * videos a day is the ceiling without requesting more.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { episodeUrl, loadTopics } from './compose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status';
/** "Education" */
const CATEGORY_ID = '27';
const TITLE_LIMIT = 100;

function credentials() {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { clientId, clientSecret, refreshToken };
}

async function accessToken(creds: NonNullable<ReturnType<typeof credentials>>): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(`Token refresh failed ${response.status}: ${payload}`);
  const parsed = JSON.parse(payload) as { access_token?: string };
  if (!parsed.access_token) throw new Error('No access_token in token response');
  return parsed.access_token;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function main() {
  const creds = credentials();
  if (!creds) {
    console.log('[youtube] no credentials, skipping upload.');
    return;
  }

  const file = path.resolve(ROOT, process.env.VIDEO_OUT ?? 'build/short.mp4');
  if (!fs.existsSync(file)) throw new Error(`Video not found: ${file}`);

  const app = 'https://resound.study?utm_source=youtube';
  let title: string;
  let description: string;
  let tags: string[];

  const metaFile = process.env.YT_META;
  if (metaFile) {
    // Ren & Mio drama episode (scripts/social/drama.ts).
    const d = JSON.parse(fs.readFileSync(path.resolve(ROOT, metaFile), 'utf8')) as {
      episode: number; title: string; idiom: string; meaning: string;
      lines: { speaker: string; en: string; ja: string }[];
    };
    // "#Shorts" plus the vertical aspect ratio is what gets it classified as a Short.
    title = truncate(`【英会話ドラマ#${d.episode}】${d.idiom}＝${d.meaning}｜${d.title} #Shorts`, TITLE_LIMIT);
    description = [
      `▶ アプリで毎日シャドーイング＆AI瞬間英作文（最初の10話無料）: ${app}`,
      '',
      `今日の熟語：${d.idiom}（${d.meaning}）`,
      '',
      '蓮と美桜の英会話ドラマ。毎日1つ、使える熟語を会話で覚えよう。続きは明日！',
      '',
      ...d.lines.map((l) => `${l.speaker}: ${l.en}\n　${l.ja}`),
      '',
      '▶ 毎日の英語シャドーイング＆AI瞬間英作文はアプリ「Resound」で（最初の10話無料）',
      app,
      '',
      '※ 登場人物・音声はAIで生成したフィクションです。',
      '',
      '#英会話 #英語学習 #英語フレーズ #英熟語 #英語リスニング #Shorts',
    ].join('\n');
    tags = ['英会話', '英語学習', '英熟語', '英語フレーズ', 'シャドーイング', d.idiom];
  } else {
    const topics = loadTopics();
    const raw = Number(process.env.VIDEO_TOPIC_INDEX ?? -1);
    const index = raw < 0 ? topics.length + raw : raw;
    const topic = topics[index];
    if (!topic) throw new Error(`No topic at index ${index}`);
    const titleJa = topic.titleJa || topic.title;
    title = truncate(`${titleJa} | 英語シャドーイング #Shorts`, TITLE_LIMIT);
    description = [
      `第${index + 1}回「${titleJa}」より。`,
      '',
      ...topic.sentences.slice(0, 3).map((s) => `${s.en}\n${s.ja}`),
      '',
      '▶ アプリ「Resound」:', app,
      '',
      '#英語学習 #シャドーイング #英語スピーキング #英語リスニング #Shorts',
    ].join('\n');
    tags = ['英語学習', 'シャドーイング', '英語スピーキング', '英語リスニング'];
    void episodeUrl;
  }

  const metadata = {
    snippet: {
      title,
      description: truncate(description, 4900),
      tags,
      categoryId: CATEGORY_ID,
      defaultLanguage: 'ja',
    },
    status: {
      privacyStatus: process.env.YOUTUBE_PRIVACY ?? 'unlisted',
      selfDeclaredMadeForKids: false,
      // Realistic-looking AI characters and voices must be disclosed.
      containsSyntheticMedia: true,
    },
  };

  const boundary = `resound-${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
        metadata,
      )}\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
      'utf8',
    ),
    fs.readFileSync(file),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);

  const token = await accessToken(creds);
  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': `multipart/related; boundary=${boundary}`,
      'content-length': String(body.length),
    },
    body,
  });

  const payload = await response.text();
  if (!response.ok) throw new Error(`YouTube upload ${response.status}: ${payload.slice(0, 600)}`);

  const parsed = JSON.parse(payload) as { id?: string };
  if (metaFile && parsed.id) {
    // Recorded into data/drama.json by the workflow so the daily digest can report on it.
    fs.writeFileSync(
      path.join(path.dirname(path.resolve(ROOT, metaFile)), 'video.json'),
      JSON.stringify({ id: parsed.id, uploadedAt: new Date().toISOString() }),
    );
  }
  console.log(
    `[youtube] uploaded (${metadata.status.privacyStatus}): https://youtube.com/watch?v=${parsed.id}`,
  );
}

main().catch((error) => {
  console.error('[youtube]', error instanceof Error ? error.message : error);
  process.exit(1);
});
