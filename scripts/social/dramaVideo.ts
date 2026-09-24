/**
 * dramaVideo.ts — renders a Ren & Mio episode as a vertical YouTube Short.
 *
 * Layout (1080×1920): today's idiom card on top, the two character cards in
 * the middle (the one speaking is lit with an amber frame, the other dimmed),
 * English + Japanese subtitles below with the idiom highlighted. A short
 * title beat opens the clip and a recap/CTA card closes it.
 *
 * Line timings come from the voice track itself: silencedetect finds the
 * pauses, and the N-1 longest pauses are taken as the turn boundaries (turn
 * gaps are longer than mid-sentence breaths). If that fails, time is split in
 * proportion to line length.
 *
 * Run:   tsx scripts/social/dramaVideo.ts
 * Env:   DRAMA_OUT=build/drama   (reads script.json + voice.wav)
 *        VIDEO_OUT=build/short.mp4
 * Needs ffmpeg/ffprobe with libass and a CJK font (fonts-noto-cjk).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Script } from './drama';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const W = 1080;
const H = 1920;
const FPS = 30;
const INTRO = 2.6;
const OUTRO = 3.6;
const FONT = process.env.VIDEO_FONT ?? 'Noto Sans CJK JP';

// Character cards
const CARD_W = 440;
const CARD_H = 587;
const FRAME = 8;
const CARD_Y = 560;
const CARD_X = { Ren: 72, Mio: 1080 - 72 - (CARD_W + FRAME * 2) };
const COLOR = { Ren: '&H00FAC560&', Mio: '&H00B48CFF&' }; // ASS is BGR: sky blue / pink

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function duration(file: string): number {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Number(out.trim());
}

/** Speech spans for each line, in seconds relative to the voice track. */
function lineTimings(voice: string, script: Script, total: number): { start: number; end: number }[] {
  const n = script.lines.length;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', voice, '-af', 'silencedetect=noise=-38dB:d=0.22', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = `${r.stderr ?? ''}`;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = starts.map((s, i) => ({ s, e: ends[i] ?? total })).filter((x) => x.e > x.s);

  // Leading/trailing silence bounds the speech.
  let speechStart = 0;
  let speechEnd = total;
  if (silences.length && silences[0].s <= 0.05) speechStart = silences.shift()!.e;
  if (silences.length && silences[silences.length - 1].e >= total - 0.05) speechEnd = silences.pop()!.s;

  if (silences.length >= n - 1) {
    const cuts = [...silences]
      .sort((a, b) => b.e - b.s - (a.e - a.s))
      .slice(0, n - 1)
      .sort((a, b) => a.s - b.s);
    const spans: { start: number; end: number }[] = [];
    let cursor = speechStart;
    for (const c of cuts) {
      spans.push({ start: cursor, end: c.s });
      cursor = c.e;
    }
    spans.push({ start: cursor, end: speechEnd });
    console.log(`[drama-video] timings from ${silences.length} pauses`);
    return spans;
  }

  // Fallback: proportional to text length.
  console.log('[drama-video] timings by text length (not enough pauses found)');
  const weights = script.lines.map((l) => l.en.length + 8);
  const sum = weights.reduce((a, b) => a + b, 0);
  const spans: { start: number; end: number }[] = [];
  let cursor = speechStart;
  for (const w of weights) {
    const d = ((speechEnd - speechStart) * w) / sum;
    spans.push({ start: cursor, end: cursor + d });
    cursor += d;
  }
  return spans;
}

function assTime(t: number): string {
  const x = Math.max(0, t);
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = Math.floor(x % 60);
  const cs = Math.min(99, Math.round((x - Math.floor(x)) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const esc = (t: string) => t.replace(/[{}\\]/g, '').replace(/\r?\n/g, ' ').trim();

function wrapEn(text: string, per: number): string {
  const out: string[] = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if ((cur + ' ' + w).trim().length > per && cur) {
      out.push(cur);
      cur = w;
    } else cur = `${cur} ${w}`.trim();
  }
  if (cur) out.push(cur);
  return out.join('\\N');
}

/** Wrap Japanese at `per` chars, never starting a line with closing punctuation. */
function wrapJa(text: string, per: number): string {
  const noStart = '、。，．！？!?）」』…ーっゃゅょァィゥェォッャュョ';
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + per, text.length);
    while (end < text.length && noStart.includes(text[end])) end++;
    out.push(text.slice(i, end));
    i = end;
  }
  return out.join('\\N');
}

/** Highlight the idiom (allowing inflections like -ed/-ing/-s) in amber. */
function highlight(enWrapped: string, idiom: string): string {
  const words = idiom
    .toLowerCase()
    .replace(/\b(one's|someone's|sb's|sth)\b/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length === 0) return enWrapped;
  const re = new RegExp(`(${words.map((w) => `${w}\\w*`).join('(?:\\s|\\\\N)+(?:\\w+(?:\\s|\\\\N)+)?')})`, 'i');
  return enWrapped.replace(re, '{\\c&H0024BFFB&}$1{\\c&H00F5F5F5&}');
}

function buildAss(script: Script, spans: { start: number; end: number }[], total: number): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,${FONT},40,&H00F5F5F5,&H00FFFFFF,&H00100C0C,&H64000000,-1,0,0,0,100,100,0,0,1,3,0,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev: string[] = [];
  const all = [assTime(0), assTime(total)];
  const at = (x: number, y: number) => `{\\an5\\pos(${x},${y})}`;

  // Header: series tag + episode title, then today's idiom card — whole clip.
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(540, 118)}{\\fs34\\c&H0024BFFB&\\fsp6}RESOUND 英会話ドラマ  #${script.episode}`);
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(540, 180)}{\\fs44}${esc(script.title)}`);
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(540, 282)}{\\fs30\\c&H00B8B0A6&}今日の熟語`);
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(540, 360)}{\\fs78\\c&H0024BFFB&}${esc(script.idiom)}`);
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(540, 448)}{\\fs46}＝ ${esc(script.meaning)}`);

  // Name plates under the cards.
  const plateY = CARD_Y + CARD_H + FRAME * 2 + 40;
  const cx = (x: number) => x + (CARD_W + FRAME * 2) / 2;
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(cx(CARD_X.Ren), plateY)}{\\fs40\\c${COLOR.Ren}}Ren {\\fs30\\c&H00B8B0A6&}蓮`);
  ev.push(`Dialogue: 0,${all[0]},${all[1]},T,,0,0,0,,${at(cx(CARD_X.Mio), plateY)}{\\fs40\\c${COLOR.Mio}}Mio {\\fs30\\c&H00B8B0A6&}美桜`);

  // Intro beat in the subtitle zone.
  ev.push(`Dialogue: 1,${assTime(0)},${assTime(INTRO)},T,,0,0,0,,${at(540, 1390)}{\\fs58}この熟語、会話で使えますか？{\\fs40\\c&H00B8B0A6&}\\N\\N▶ 2人の会話を聴いてみよう`);

  // Dialogue subtitles.
  script.lines.forEach((line, i) => {
    const start = INTRO + spans[i].start - 0.08;
    const end = i + 1 < spans.length ? INTRO + spans[i + 1].start - 0.08 : INTRO + spans[i].end + 0.5;
    const name = line.speaker as 'Ren' | 'Mio';
    const en = highlight(wrapEn(esc(line.en), 26), script.idiom);
    const ja = wrapJa(esc(line.ja), 20);
    ev.push(
      `Dialogue: 1,${assTime(start)},${assTime(end)},T,,0,0,0,,${at(540, 1400)}{\\fs34\\c${COLOR[name]}}${name}\\N{\\fs60\\c&H00F5F5F5&}${en}\\N{\\fs42\\c&H00A8D8E8&}${ja}`,
    );
  });

  // Outro recap + CTA.
  const o = total - OUTRO;
  ev.push(
    `Dialogue: 1,${assTime(o)},${assTime(total)},T,,0,0,0,,${at(540, 1400)}{\\fs36\\c&H00B8B0A6&}今日の熟語をおさらい\\N{\\fs64\\c&H0024BFFB&}${esc(script.idiom)}\\N{\\fs44}＝ ${esc(script.meaning)}\\N\\N{\\fs40}続きは明日 ▶\\N{\\fs34\\c&H0024BFFB&}毎日の英語はアプリ Resound で`,
  );

  return header + ev.join('\n') + '\n';
}

/** ffmpeg `enable` expression that is true while a character is lit. */
function litExpr(windows: [number, number][]): string {
  return windows.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join('+') || '0';
}

function main() {
  const dir = path.resolve(ROOT, process.env.DRAMA_OUT ?? 'build/drama');
  const script = JSON.parse(fs.readFileSync(path.join(dir, 'script.json'), 'utf8')) as Script;
  const voice = path.join(dir, 'voice.wav');
  const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'drama.json'), 'utf8'));
  const imgRen = path.join(ROOT, state.characters.Ren.image);
  const imgMio = path.join(ROOT, state.characters.Mio.image);

  const voiceLen = duration(voice);
  const total = INTRO + voiceLen + OUTRO;
  const spans = lineTimings(voice, script, voiceLen);

  // Who is lit when: speaker during their line, both during intro/outro.
  const lit: Record<'Ren' | 'Mio', [number, number][]> = {
    Ren: [[0, INTRO], [total - OUTRO, total]],
    Mio: [[0, INTRO], [total - OUTRO, total]],
  };
  script.lines.forEach((line, i) => {
    const s = INTRO + spans[i].start - 0.08;
    const e = i + 1 < spans.length ? INTRO + spans[i + 1].start - 0.08 : INTRO + spans[i].end + 0.5;
    lit[line.speaker as 'Ren' | 'Mio'].push([s, e]);
  });

  const outPath = path.resolve(ROOT, process.env.VIDEO_OUT ?? 'build/short.mp4');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const assFile = path.join(dir, 'subs.ass');
  fs.writeFileSync(assFile, buildAss(script, spans, total), 'utf8');

  const card = (label: string, input: number) =>
    `[${input}:v]scale=${CARD_W}:${CARD_H},setsar=1,split[${label}a][${label}b];` +
    `[${label}a]pad=${CARD_W + FRAME * 2}:${CARD_H + FRAME * 2}:${FRAME}:${FRAME}:color=0xFBBF24[${label}on];` +
    `[${label}b]eq=brightness=-0.28:saturation=0.45,pad=${CARD_W + FRAME * 2}:${CARD_H + FRAME * 2}:${FRAME}:${FRAME}:color=0x2A2D38[${label}off];`;

  const graph =
    card('r', 1) +
    card('m', 2) +
    // Background: deep navy with a thin amber rule under the idiom card.
    `[0:v]drawbox=x=140:y=508:w=800:h=3:color=0xFBBF24@0.6:t=fill[bg];` +
    `[bg][roff]overlay=${CARD_X.Ren}:${CARD_Y}[v1];` +
    `[v1][ron]overlay=${CARD_X.Ren}:${CARD_Y}:enable='${litExpr(lit.Ren)}'[v2];` +
    `[v2][moff]overlay=${CARD_X.Mio}:${CARD_Y}[v3];` +
    `[v3][mon]overlay=${CARD_X.Mio}:${CARD_Y}:enable='${litExpr(lit.Mio)}'[v4];` +
    `[v4]ass=${assFile.replace(/[\\:]/g, '\\$&')}[v];` +
    `[3:a]adelay=${Math.round(INTRO * 1000)}:all=1,apad=pad_dur=${OUTRO},aresample=44100[a]`;

  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0x0E1018:s=${W}x${H}:r=${FPS}:d=${total.toFixed(2)}`,
    '-loop', '1', '-i', imgRen,
    '-loop', '1', '-i', imgMio,
    '-i', voice,
    '-filter_complex', graph,
    '-map', '[v]',
    '-map', '[a]',
    '-t', total.toFixed(2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart',
    outPath,
  ]);

  const mb = fs.statSync(outPath).size / 1_048_576;
  console.log(`[drama-video] ${path.relative(ROOT, outPath)} — ${total.toFixed(1)}s, ${mb.toFixed(1)} MB, ${script.lines.length} lines`);
}

try {
  main();
} catch (error) {
  console.error('[drama-video]', error instanceof Error ? error.message : error);
  process.exit(1);
}
