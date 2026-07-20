/**
 * generatePhraseAudio.ts
 *
 * Pre-generates ElevenLabs audio for the idioms/phrases shown under each
 * sentence (and saved to the phrase book), using the SAME voice and voice
 * settings as the sentence audio so a tapped phrase sounds like the same
 * speaker.
 *
 * Like generateWordAudio, this covers going-forward vocabulary only:
 * PHRASE_AUDIO_TOPICS_TAIL=N limits generation to the last N topics so the
 * historical catalog is never backfilled.
 *
 * Output:   assets/audio/phrases/<slug>.mp3
 * Manifest: data/phraseAudio.json  ({ "<normalized phrase>": "./assets/audio/phrases/<slug>.mp3" })
 *
 * Run:      tsx scripts/generatePhraseAudio.ts
 * Requires: ELEVENLABS_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

interface Phrase { phrase: string }
interface Sentence { phrases?: Phrase[] }
interface Topic { sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const MANIFEST = path.join(ROOT, 'data', 'phraseAudio.json');
const PHRASE_DIR = path.join(ROOT, 'assets', 'audio', 'phrases');

const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

// Must stay IDENTICAL to generateAudio.ts / generateWordAudio.ts.
const ELEVEN_VOICE_SETTINGS = {
  stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.4),
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.8),
  style: Number(process.env.ELEVENLABS_STYLE ?? 0.45),
  use_speaker_boost: true,
};

const MAX_PER_RUN = Number(process.env.MAX_PHRASE_AUDIO_PER_RUN ?? 120);
const FORCE = process.env.FORCE_REGEN === '1';

/** Same normalization the app uses to look up a phrase in the manifest. */
function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Filesystem-safe, collision-resistant filename for a phrase. */
function slugFor(normalized: string): string {
  const base = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  return `${base || 'phrase'}_${hash}`;
}

function extractPhrases(): string[] {
  let topics = JSON.parse(fs.readFileSync(TOPICS, 'utf8')) as Topic[];
  const tail = Number(process.env.PHRASE_AUDIO_TOPICS_TAIL ?? 0);
  if (tail > 0 && topics.length > tail) topics = topics.slice(-tail);
  const set = new Set<string>();
  for (const t of topics) {
    for (const s of t.sentences) {
      for (const p of s.phrases ?? []) {
        const k = normalize(String(p.phrase ?? ''));
        if (k) set.add(k);
      }
    }
  }
  return [...set];
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

async function synth(text: string, outPath: string): Promise<void> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVEN_KEY as string,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
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
    console.log('ELEVENLABS_API_KEY not set — skipping phrase audio generation.');
    return;
  }
  fs.mkdirSync(PHRASE_DIR, { recursive: true });
  let phrases = extractPhrases();
  const manifest = loadManifest();

  if (FORCE) {
    phrases = phrases.filter((p) => manifest[p]);
    console.log(`FORCE rebuild: regenerating ${phrases.length} existing phrases only.`);
  }

  console.log(
    `${phrases.length} phrases in scope; ${Object.keys(manifest).length} already have audio. Cap ${MAX_PER_RUN}/run.`
  );

  let generated = 0;
  for (const p of phrases) {
    const slug = slugFor(p);
    const abs = path.join(PHRASE_DIR, `${slug}.mp3`);
    const rel = `./assets/audio/phrases/${slug}.mp3`;

    if (!FORCE && fs.existsSync(abs)) {
      if (manifest[p] !== rel) manifest[p] = rel;
      continue;
    }

    try {
      await synth(p, abs);
      manifest[p] = rel;
      generated++;
      if (generated % 20 === 0) {
        saveManifest(manifest);
        console.log(`  ...${generated} generated (latest: "${p.slice(0, 40)}")`);
      }
      if (generated >= MAX_PER_RUN) {
        console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
        break;
      }
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      if (err instanceof QuotaError) {
        console.log('  ElevenLabs quota/credits exhausted — stopping (remaining phrases use system TTS).');
        console.log(`    (${err.message})`);
        break;
      }
      console.error(`  !! failed "${p.slice(0, 40)}":`, err instanceof Error ? err.message : err);
    }
  }

  saveManifest(manifest);
  console.log(`Done. Generated ${generated} this run. Manifest now has ${Object.keys(manifest).length} phrases.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
