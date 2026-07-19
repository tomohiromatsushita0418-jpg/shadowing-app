/**
 * generateWordAudio.ts
 *
 * Pre-generates natural TTS audio for individual words (the ones a learner
 * can tap to hear pronounced) so word playback is consistent and human-like
 * across all devices — instead of falling back to each device's built-in
 * system speech synthesizer (which is robotic on some devices, e.g. iPad).
 *
 * Uses ElevenLabs (same engine/voice as sentence audio) for quality and
 * cross-device consistency. Words are processed MOST-FREQUENT-FIRST so the
 * words users are most likely to tap get covered first within the monthly
 * free character budget. Any word without generated audio still works in the
 * app via the system-TTS fallback.
 *
 * Output:   assets/audio/words/<slug>.mp3
 * Manifest: data/wordAudio.json  ({ "<word>": "./assets/audio/words/<slug>.mp3" })
 *
 * Run:      tsx scripts/generateWordAudio.ts
 * Requires: ELEVENLABS_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface Sentence { en: string }
interface Topic { sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const MANIFEST = path.join(ROOT, 'data', 'wordAudio.json');
const WORD_DIR = path.join(ROOT, 'assets', 'audio', 'words');

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const ELEVEN_VOICE_SETTINGS = {
  stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.4),
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.8),
  style: Number(process.env.ELEVENLABS_STYLE ?? 0.3),
  use_speaker_boost: true,
};

// Keep well under the free monthly character budget per run by default.
const MAX_PER_RUN = Number(process.env.MAX_WORD_AUDIO_PER_RUN ?? 400);
// Skip very short function words? No — learners tap those too. But we do skip
// single letters that aren't real words except "a" and "i".
const MIN_LEN = 1;

function slugFor(word: string): string {
  // Words are limited to [a-z'-]; make a filesystem-safe, collision-resistant slug.
  return word.replace(/'/g, '_ap_').replace(/-/g, '_hy_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Returns unique words ordered by descending frequency (then alphabetical).
 * If WORD_AUDIO_TOPICS_TAIL=N is set, only words from the last N topics are
 * considered — used by the daily job to cover only going-forward vocabulary
 * without backfilling the entire historical catalog.
 */
function extractWordsByFrequency(): string[] {
  let topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  const tail = Number(process.env.WORD_AUDIO_TOPICS_TAIL ?? 0);
  if (tail > 0 && topics.length > tail) topics = topics.slice(-tail);
  const freq = new Map<string, number>();
  for (const t of topics) {
    for (const s of t.sentences) {
      for (const raw of s.en.split(/\s+/)) {
        const w = raw.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        if (w.length >= MIN_LEN) freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => w);
}

function loadManifest(): Record<string, string> {
  if (!fs.existsSync(MANIFEST)) return {};
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8') || '{}');
}

function saveManifest(m: Record<string, string>): void {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(m).sort()) sorted[k] = m[k];
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + '\n');
}

class QuotaError extends Error {}

async function synthWord(word: string, outPath: string): Promise<void> {
  if (!ELEVEN_KEY) throw new Error('ELEVENLABS_API_KEY is required for word audio.');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVEN_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: word,
      model_id: ELEVEN_MODEL,
      voice_settings: ELEVEN_VOICE_SETTINGS,
    }),
  });
  if (res.status === 401 || res.status === 429) {
    throw new QuotaError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  if (!res.ok) {
    throw new Error(`ElevenLabs error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

async function main() {
  if (!ELEVEN_KEY) {
    console.log('ELEVENLABS_API_KEY not set — skipping word audio generation.');
    return;
  }
  fs.mkdirSync(WORD_DIR, { recursive: true });
  const words = extractWordsByFrequency();
  const manifest = loadManifest();

  console.log(
    `${words.length} unique words; ${Object.keys(manifest).length} already have audio. Cap ${MAX_PER_RUN}/run (most-frequent first).`
  );

  let generated = 0;
  for (const word of words) {
    const slug = slugFor(word);
    const abs = path.join(WORD_DIR, `${slug}.mp3`);
    const rel = `./assets/audio/words/${slug}.mp3`;

    if (fs.existsSync(abs)) {
      if (manifest[word] !== rel) manifest[word] = rel;
      continue;
    }

    try {
      await synthWord(word, abs);
      manifest[word] = rel;
      generated++;
      if (generated % 25 === 0) {
        saveManifest(manifest);
        console.log(`  ...${generated} generated (latest: "${word}")`);
      }
      if (generated >= MAX_PER_RUN) {
        console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
        break;
      }
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      if (err instanceof QuotaError) {
        console.log(`  ElevenLabs quota/credits exhausted — stopping (remaining words use system TTS).`);
        console.log(`    (${err.message})`);
        break;
      }
      console.error(`  !! failed "${word}":`, err instanceof Error ? err.message : err);
    }
  }

  saveManifest(manifest);
  console.log(`Done. Generated ${generated} this run. Manifest now has ${Object.keys(manifest).length} words.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
