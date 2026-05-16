/**
 * generateAudio.ts
 *
 * Generates native-sounding English audio for every sentence in
 * data/topics.json that doesn't yet have an audio file, using Google
 * Gemini's TTS preview model. Saves WAV files to assets/audio/.
 *
 * Run:      tsx scripts/generateAudio.ts
 * Requires: GEMINI_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string; ja: string; audioPath?: string }
interface Topic { id: string; title: string; category: string; sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS_PATH = path.join(ROOT, 'data', 'topics.json');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');

const MODEL = 'gemini-2.5-flash-preview-tts';
// Voices: "Puck" upbeat, "Aoede" breezy, "Leda" youthful, "Charon" informative,
// "Fenrir" excitable, "Zephyr" bright. "Puck" reads with natural intonation.
const VOICE = process.env.TTS_VOICE || 'Puck';
// Gemini TTS returns PCM16 mono at 24000 Hz
const SAMPLE_RATE = 24000;

// Gemini TTS responds to natural-language style instructions when the
// input is wrapped as: `Say [STYLE]: "[TEXT]"`. The model speaks only the
// quoted text, applying the requested tone.
function wrapWithStyle(text: string): string {
  const style =
    'in a natural, warm, expressive conversational tone — like a friend explaining something in person — with appropriate intonation, emphasis on key words, and brief natural pauses at commas';
  // Strip any existing quotes in the text to avoid breaking the wrapper
  const safe = text.replace(/"/g, '\\"');
  return `Say ${style}: "${safe}"`;
}

function loadTopics(): Topic[] {
  if (!fs.existsSync(TOPICS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf8') || '[]') as Topic[];
}

function saveTopics(topics: Topic[]): void {
  fs.writeFileSync(TOPICS_PATH, JSON.stringify(topics, null, 2) + '\n');
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

async function synthesize(text: string, outPath: string, attempt = 1): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: wrapWithStyle(text) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
        },
      },
    }),
  });

  if (res.status === 429 && attempt < 6) {
    const body = await res.text();
    const m = body.match(/retry in ([0-9.]+)s/);
    const wait = m ? Math.ceil(parseFloat(m[1]) * 1000) + 2000 : 30000 * attempt;
    console.log(`    rate limited, retry in ${Math.round(wait / 1000)}s (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, wait));
    return synthesize(text, outPath, attempt + 1);
  }

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini TTS error ${res.status}: ${t}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('No audio in response');
  const pcm = Buffer.from(b64, 'base64');
  const wav = pcmToWav(pcm, SAMPLE_RATE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, wav);
}

// Free tier daily request cap (Gemini TTS): ~15 RPD. Leave a small buffer.
const MAX_PER_RUN = Number(process.env.MAX_AUDIO_PER_RUN ?? 14);

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const topics = loadTopics();
  console.log(`Scanning ${topics.length} topics for missing audio (cap: ${MAX_PER_RUN}/run)...`);

  let generated = 0;
  let skipped = 0;
  let mutated = false;

  // Process newest first so today's freshly-generated topic gets audio
  // before older backlog consumes the daily quota.
  const ordered = [...topics].reverse();
  outer: for (const topic of ordered) {
    for (let i = 0; i < topic.sentences.length; i++) {
      const s = topic.sentences[i];
      const filename = `${topic.id}_${i}.wav`;
      const absPath = path.join(AUDIO_DIR, filename);
      const relPath = `./assets/audio/${filename}`;

      if (fs.existsSync(absPath)) {
        if (s.audioPath !== relPath) { s.audioPath = relPath; mutated = true; }
        skipped++;
        continue;
      }

      try {
        console.log(`  TTS -> ${filename}: ${s.en.slice(0, 60)}...`);
        await synthesize(s.en, absPath);
        s.audioPath = relPath;
        mutated = true;
        generated++;
        if (generated >= MAX_PER_RUN) {
          console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
          break outer;
        }
        // Free tier: 3 RPM → space ~22s apart
        await new Promise((r) => setTimeout(r, 22000));
      } catch (err) {
        console.error(`  !! failed ${filename}:`, err);
        if (err instanceof Error && /429/.test(err.message)) {
          console.log('  giving up for today (rate limit).');
          break outer;
        }
      }
    }
  }

  if (mutated) saveTopics(topics);
  console.log(`Done. Generated ${generated}, skipped ${skipped}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
