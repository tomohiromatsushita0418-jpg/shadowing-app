/**
 * tiktok.ts — posts the day's Ren & Mio Short to TikTok (Content Posting API,
 * Direct Post). Same vertical video as YouTube; no extra rendering.
 *
 * Run:   tsx scripts/social/tiktok.ts
 * Env:   TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / TIKTOK_REFRESH_TOKEN
 *        TIKTOK_PRIVACY=public|private   (default private)
 *        VIDEO_OUT=build/short.mp4
 *        YT_META=build/drama/script.json  caption source
 *        GH_TOKEN (optional)              lets it save a rotated refresh token
 *
 * Until TikTok audits the app, only private (SELF_ONLY) posts are allowed; the
 * script checks what the account may use and falls back to private, so the
 * same job starts posting publicly the day the audit passes and
 * TIKTOK_PRIVACY is set to "public".
 *
 * Access tokens live 24 h, so every run trades the refresh token for a fresh
 * one. If TikTok rotates the refresh token, the new one is written back to the
 * TIKTOK_REFRESH_TOKEN secret (needs gh + GH_TOKEN).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const API = 'https://open.tiktokapis.com/v2';

async function post(url: string, body: unknown, token?: string, form = false): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=UTF-8',
    },
    body: form ? new URLSearchParams(body as Record<string, string>) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* keep raw */
  }
  const code = json?.error?.code;
  if (!res.ok || (code && code !== 'ok')) {
    throw new Error(`TikTok ${res.status} ${code ?? ''}: ${(json?.error?.message ?? text).slice(0, 300)}`);
  }
  return json;
}

async function accessToken(): Promise<string> {
  const key = process.env.TIKTOK_CLIENT_KEY!;
  const secret = process.env.TIKTOK_CLIENT_SECRET!;
  const refresh = process.env.TIKTOK_REFRESH_TOKEN!;
  const t = await post(
    `${API}/oauth/token/`,
    { client_key: key, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh },
    undefined,
    true,
  );
  if (!t.access_token) throw new Error(`no access_token: ${JSON.stringify(t).slice(0, 200)}`);
  if (t.refresh_token && t.refresh_token !== refresh && process.env.GH_TOKEN) {
    try {
      execFileSync('gh', ['secret', 'set', 'TIKTOK_REFRESH_TOKEN', '--body', t.refresh_token], { stdio: 'ignore' });
      console.log('[tiktok] refresh token rotated and saved');
    } catch {
      console.log('[tiktok] WARNING: could not save the rotated refresh token');
    }
  }
  return t.access_token;
}

function caption(): string {
  const metaFile = process.env.YT_META;
  if (!metaFile) return '毎日1フレーズ、英会話ドラマで覚えよう #英会話 #英語学習';
  const d = JSON.parse(fs.readFileSync(path.resolve(ROOT, metaFile), 'utf8')) as {
    episode: number;
    title: string;
    idiom: string;
    meaning: string;
  };
  return [
    `【英会話ドラマ#${d.episode}】${d.title}`,
    `今日の熟語：${d.idiom}＝${d.meaning}`,
    '蓮と美桜の職場ラブコメで、毎日1つ“使える英語”を。続きは明日！',
    'アプリ「Resound」はプロフィールのリンクから（最初の10話無料）',
    '※登場人物・音声はAI生成のフィクションです',
    '#英会話 #英語学習 #英語フレーズ #英熟語 #シャドーイング #英語リスニング',
  ].join('\n');
}

async function main() {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET || !process.env.TIKTOK_REFRESH_TOKEN) {
    console.log('[tiktok] no credentials yet, skipping.');
    return;
  }
  const file = path.resolve(ROOT, process.env.VIDEO_OUT ?? 'build/short.mp4');
  const size = fs.statSync(file).size;
  const token = await accessToken();

  // TikTok requires checking the creator's allowed settings before posting.
  const info = await post(`${API}/post/publish/creator_info/query/`, {}, token);
  const allowed: string[] = info?.data?.privacy_level_options ?? [];
  const wantPublic = (process.env.TIKTOK_PRIVACY ?? 'private') === 'public';
  const privacy = wantPublic && allowed.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY';
  if (wantPublic && privacy !== 'PUBLIC_TO_EVERYONE') {
    console.log('[tiktok] public posting not allowed yet (app not audited) — posting privately');
  }

  const postInfo: Record<string, unknown> = {
    title: caption().slice(0, 2200),
    privacy_level: privacy,
    disable_duet: false,
    disable_stitch: false,
    disable_comment: false,
    video_cover_timestamp_ms: 1500,
    is_aigc: true, // AI-generated characters and voices
  };
  const source = { source: 'FILE_UPLOAD', video_size: size, chunk_size: size, total_chunk_count: 1 };
  let init: any;
  try {
    init = await post(`${API}/post/publish/video/init/`, { post_info: postInfo, source_info: source }, token);
  } catch (error) {
    // Older API versions reject the AIGC flag; the caption still discloses it.
    if (!/invalid_param/i.test((error as Error).message)) throw error;
    delete postInfo.is_aigc;
    init = await post(`${API}/post/publish/video/init/`, { post_info: postInfo, source_info: source }, token);
  }
  const { publish_id: publishId, upload_url: uploadUrl } = init.data ?? {};
  if (!publishId || !uploadUrl) throw new Error(`init returned no upload url: ${JSON.stringify(init).slice(0, 200)}`);

  const up = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'content-type': 'video/mp4',
      'content-length': String(size),
      'content-range': `bytes 0-${size - 1}/${size}`,
    },
    body: fs.readFileSync(file),
  });
  if (!up.ok) throw new Error(`upload ${up.status}: ${(await up.text()).slice(0, 200)}`);

  // Processing is async; poll briefly so the log says how it went.
  let status = 'PROCESSING_UPLOAD';
  for (let i = 0; i < 20 && /PROCESSING/.test(status); i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const s = await post(`${API}/post/publish/status/fetch/`, { publish_id: publishId }, token);
    status = s?.data?.status ?? status;
    if (s?.data?.fail_reason) throw new Error(`publish failed: ${s.data.fail_reason}`);
  }
  console.log(`[tiktok] ${status} (${privacy}) publish_id=${publishId}`);
  const metaFile = process.env.YT_META;
  if (metaFile) {
    fs.writeFileSync(
      path.join(path.dirname(path.resolve(ROOT, metaFile)), 'tiktok.json'),
      JSON.stringify({ publishId, status, privacy }),
    );
  }
}

main().catch((error) => {
  console.error('[tiktok]', error instanceof Error ? error.message : error);
  process.exit(1);
});
