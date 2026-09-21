/**
 * video.ts — renders a vertical Short from an episode's existing audio.
 *
 * Run:   tsx scripts/social/video.ts
 * Env:   VIDEO_TOPIC_INDEX=-1        which episode (default: newest)
 *        VIDEO_SENTENCES=3           how many sentences to include
 *        VIDEO_OUT=build/short.mp4   output path
 *
 * Requires ffmpeg and ffprobe on PATH, plus a CJK font for the Japanese
 * subtitles (ubuntu-latest: `sudo apt-get install -y fonts-noto-cjk`).
 * GitHub's ubuntu runners already ship ffmpeg.
 *
 * Nothing here generates new audio: it reassembles the sentence files the
 * daily pipeline has already produced, so a Short costs no TTS quota.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopics, type Topic } from './compose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
/** Silence inserted after each sentence so the viewer can shadow it. */
const GAP_SECONDS = 0.7;
const OUTRO_SECONDS = 2.0;
const FONT = process.env.VIDEO_FONT ?? 'Noto Sans CJK JP';

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function probeDuration(file: string): number {
  const out = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]).trim();
  const seconds = Number(out);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Could not read duration of ${file}`);
  }
  return seconds;
}

/** ASS timestamps are h:mm:ss.cc (centiseconds). */
function assTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.round((total - Math.floor(total)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(
    Math.min(cs, 99),
  ).padStart(2, '0')}`;
}

/** ASS treats braces and newlines as markup. */
function assEscape(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, ' ').trim();
}

/** Naive but effective wrap: ASS will not break long lines on its own. */
function wrap(text: string, perLine: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > perLine && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.join('\\N');
}

function wrapJa(text: string, perLine: number): string {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += perLine) lines.push(text.slice(i, i + perLine));
  return lines.join('\\N');
}

function buildAss(
  segments: { en: string; ja: string; start: number; end: number }[],
  total: number,
  episodeLabel: string,
): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${WIDTH}
PlayResY: ${HEIGHT}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${FONT},64,&H00F5F5F5,&H00FFFFFF,&H00140F0F,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1
Style: Brand,${FONT},44,&H0024BFFB,&H00FFFFFF,&H00140F0F,&H00000000,-1,0,0,0,100,100,6,0,1,0,0,8,60,60,110,1
Style: Foot,${FONT},36,&H00A08D7A,&H00FFFFFF,&H00140F0F,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events: string[] = [];

  // Brand and episode label sit on screen for the whole clip.
  events.push(
    `Dialogue: 0,${assTime(0)},${assTime(total)},Brand,,0,0,0,,RESOUND`,
    `Dialogue: 0,${assTime(0)},${assTime(total)},Foot,,0,0,0,,${assEscape(episodeLabel)}`,
  );

  for (const segment of segments) {
    const en = wrap(assEscape(segment.en), 34);
    const ja = wrapJa(assEscape(segment.ja), 20);
    // English large and white; the translation smaller and dimmer underneath.
    const text = `{\\fs64\\b1}${en}{\\r}\\N\\N{\\fs40\\c&H00A8A092&}${ja}`;
    events.push(
      `Dialogue: 1,${assTime(segment.start)},${assTime(segment.end)},Main,,0,0,0,,${text}`,
    );
  }

  // Closing card.
  const outroStart = total - OUTRO_SECONDS;
  events.push(
    `Dialogue: 1,${assTime(outroStart)},${assTime(total)},Main,,0,0,0,,{\\fs72\\b1}毎日1本、英語シャドーイング{\\r}\\N\\N{\\fs44\\c&H0024BFFB&}RESOUND`,
  );

  return header + events.join('\n') + '\n';
}

function main() {
  const topics = loadTopics();
  const raw = Number(process.env.VIDEO_TOPIC_INDEX ?? -1);
  const index = raw < 0 ? topics.length + raw : raw;
  const topic: Topic | undefined = topics[index];
  if (!topic) throw new Error(`No topic at index ${index}`);

  const count = Math.max(1, Number(process.env.VIDEO_SENTENCES ?? 3));
  const chosen = topic.sentences.slice(0, count);

  const work = fs.mkdtempSync(path.join(ROOT, 'build-video-'));
  const outPath = path.resolve(ROOT, process.env.VIDEO_OUT ?? 'build/short.mp4');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  try {
    // 1. Normalise each sentence to a common format and pad it with the gap,
    //    so the concat demuxer can join them without re-encoding surprises.
    const listLines: string[] = [];
    const segments: { en: string; ja: string; start: number; end: number }[] = [];
    let cursor = 0;

    chosen.forEach((sentence, i) => {
      if (!sentence.audioPath) throw new Error(`Sentence ${i} has no audio`);
      const source = path.resolve(ROOT, sentence.audioPath.replace(/^\.\//, ''));
      if (!fs.existsSync(source)) throw new Error(`Missing audio file: ${source}`);

      const duration = probeDuration(source);
      const segFile = path.join(work, `seg_${i}.wav`);
      run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', source,
        '-ar', '44100', '-ac', '2',
        '-af', `apad=pad_dur=${GAP_SECONDS}`,
        '-t', String(duration + GAP_SECONDS),
        '-c:a', 'pcm_s16le',
        segFile,
      ]);

      listLines.push(`file '${segFile.replace(/'/g, "'\\''")}'`);
      segments.push({
        en: sentence.en,
        ja: sentence.ja,
        start: cursor,
        // Hold the subtitle through the gap so the viewer can read while shadowing.
        end: cursor + duration + GAP_SECONDS,
      });
      cursor += duration + GAP_SECONDS;
    });

    const listFile = path.join(work, 'list.txt');
    fs.writeFileSync(listFile, listLines.join('\n'), 'utf8');

    const audioFile = path.join(work, 'audio.wav');
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      // Pad the tail so the closing card has audio-free room to sit in.
      '-af', `apad=pad_dur=${OUTRO_SECONDS}`,
      audioFile,
    ]);

    const total = cursor + OUTRO_SECONDS;

    const assFile = path.join(work, 'subs.ass');
    fs.writeFileSync(
      assFile,
      buildAss(segments, total, `第${index + 1}回  ${topic.titleJa ?? topic.title}`),
      'utf8',
    );

    // 2. Compose: flat brand background + burned-in subtitles + the audio.
    run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=0x0F0F14:s=${WIDTH}x${HEIGHT}:r=${FPS}:d=${total.toFixed(2)}`,
      '-i', audioFile,
      '-vf', `ass=${assFile.replace(/[\\:]/g, '\\$&')}`,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      '-shortest',
      outPath,
    ]);

    const size = fs.statSync(outPath).size;
    console.log(
      `[video] ${path.relative(ROOT, outPath)} — ${total.toFixed(1)}s, ${(size / 1_048_576).toFixed(1)} MB, ${chosen.length} sentences`,
    );
    // Consumed by the workflow to build the YouTube metadata.
    console.log(`[video] topicIndex=${index}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error('[video]', error instanceof Error ? error.message : error);
  process.exit(1);
}
