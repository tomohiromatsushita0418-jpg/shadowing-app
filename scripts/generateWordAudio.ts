/**
 * generateWordAudio.ts
 *
 * Pre-generates natural TTS audio for individual words (the ones a learner
 * can tap to hear pronounced) so word playback is consistent and human-like
 * across all devices — instead of falling back to each device's built-in
 * system speech synthesizer (which is robotic on some devices, e.g. iPad).
 *
 * Uses the same engine/voice as the sentence audio (Gemini / "Puck" by
 * default) for a consistent speaker across the app. Words are processed MOST-FREQUENT-FIRST so the
 * words users are most likely to tap get covered first within the monthly
 * free character budget. Any word without generated audio still works in the
 * app via the system-TTS fallback.
 *
 * Output:   assets/audio/words/<slug>.(wav|mp3)
 * Manifest: data/wordAudio.json  ({ "<word>": "./assets/audio/words/<slug>.<ext>" })
 *
 * Run:      tsx scripts/generateWordAudio.ts
 * Requires: GEMINI_API_KEY (or ELEVENLABS_API_KEY with TTS_ENGINE=elevenlabs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Engine (Gemini/Puck by default) is shared with sentence + phrase audio so a
// tapped word sounds like the same speaker.
import { AUDIO_EXT, PACE_MS, QuotaError, engineReady, synthesize, ENGINE } from './ttsEngine.js';

interface Sentence { en: string }
interface Topic { sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const MANIFEST = path.join(ROOT, 'data', 'wordAudio.json');
const WORD_DIR = path.join(ROOT, 'assets', 'audio', 'words');

// Gemini's free TTS tier is limited by requests/day (~15, mostly consumed by
// the day's sentence audio), ElevenLabs by monthly characters.
const MAX_PER_RUN = Number(
  process.env.MAX_WORD_AUDIO_PER_RUN ?? (ENGINE === 'elevenlabs' ? 400 : 30)
);
// Rebuild existing word audio (e.g. after changing voice settings).
const FORCE = process.env.FORCE_REGEN === '1';
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

async function synthWord(word: string, outPath: string): Promise<void> {
  const buf = await synthesize(word);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
}

/** Existing audio for a word, in either engine's format. */
function existingRel(slug: string): string | null {
  for (const ext of ['wav', 'mp3']) {
    if (fs.existsSync(path.join(WORD_DIR, `${slug}.${ext}`))) {
      return `./assets/audio/words/${slug}.${ext}`;
    }
  }
  return null;
}

async function main() {
  if (!engineReady()) {
    console.log(`TTS engine "${ENGINE}" has no API key — skipping word audio generation.`);
    return;
  }
  fs.mkdirSync(WORD_DIR, { recursive: true });
  let words = extractWordsByFrequency();
  const manifest = loadManifest();

  // When rebuilding (e.g. after a voice-settings change) only redo words that
  // already have audio — never expand coverage into the historical backlog.
  if (FORCE) {
    words = words.filter((w) => manifest[w]);
    console.log(`FORCE rebuild: regenerating ${words.length} existing words only.`);
  }

  console.log(
    `engine=${ENGINE}; ${words.length} unique words; ${Object.keys(manifest).length} already have audio. Cap ${MAX_PER_RUN}/run (most-frequent first).`
  );

  let generated = 0;
  for (const word of words) {
    const slug = slugFor(word);
    const abs = path.join(WORD_DIR, `${slug}.${AUDIO_EXT}`);
    const rel = `./assets/audio/words/${slug}.${AUDIO_EXT}`;

    if (!FORCE) {
      const existing = existingRel(slug);
      if (existing) {
        if (manifest[word] !== existing) manifest[word] = existing;
        continue;
      }
    }

    try {
      await synthWord(word, abs);
      manifest[word] = rel;
      generated++;
      if (generated % 10 === 0) {
        saveManifest(manifest);
        console.log(`  ...${generated} generated (latest: "${word}")`);
      }
      if (generated >= MAX_PER_RUN) {
        console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
        break;
      }
      await new Promise((r) => setTimeout(r, PACE_MS));
    } catch (err) {
      if (err instanceof QuotaError) {
        console.log(`  ${ENGINE} quota exhausted — stopping (remaining words use system TTS).`);
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
