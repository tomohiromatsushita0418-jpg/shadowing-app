/**
 * generatePhraseAudio.ts
 *
 * Pre-generates audio for the idioms/phrases shown under each sentence (and
 * saved to the phrase book), using the SAME engine and voice as the sentence
 * audio (Gemini / "Puck" by default) so a tapped phrase sounds like the same
 * speaker.
 *
 * Like generateWordAudio, this covers going-forward vocabulary only:
 * PHRASE_AUDIO_TOPICS_TAIL=N limits generation to the last N topics so the
 * historical catalog is never backfilled.
 *
 * Output:   assets/audio/phrases/<slug>.(wav|mp3)
 * Manifest: data/phraseAudio.json  ({ "<normalized phrase>": "./assets/audio/phrases/<slug>.<ext>" })
 *
 * Run:      tsx scripts/generatePhraseAudio.ts
 * Requires: GEMINI_API_KEY (or ELEVENLABS_API_KEY with TTS_ENGINE=elevenlabs)
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QuotaError, allExhausted, anyEngineReady, paceFor, synthesize } from './ttsEngine.js';

interface Phrase { phrase: string }
interface Sentence { phrases?: Phrase[] }
interface Topic { sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS = path.join(ROOT, 'data', 'topics.json');
const MANIFEST = path.join(ROOT, 'data', 'phraseAudio.json');
const PHRASE_DIR = path.join(ROOT, 'assets', 'audio', 'phrases');

const MAX_PER_RUN = Number(process.env.MAX_PHRASE_AUDIO_PER_RUN ?? 200);
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

/** Synthesizes `text`, writes it with the serving engine's extension. */
async function synth(text: string, slug: string) {
  const { buf, ext, engine } = await synthesize(text);
  const outPath = path.join(PHRASE_DIR, `${slug}.${ext}`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return { rel: `./assets/audio/phrases/${slug}.${ext}`, engine };
}

/** Existing audio for a phrase, in either engine's format. */
function existingRel(slug: string): string | null {
  for (const ext of ['wav', 'mp3']) {
    if (fs.existsSync(path.join(PHRASE_DIR, `${slug}.${ext}`))) {
      return `./assets/audio/phrases/${slug}.${ext}`;
    }
  }
  return null;
}

async function main() {
  if (!anyEngineReady()) {
    console.log('No TTS API key available — skipping phrase audio generation.');
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

    if (!FORCE) {
      const existing = existingRel(slug);
      if (existing) {
        if (manifest[p] !== existing) manifest[p] = existing;
        continue;
      }
    }

    try {
      const { rel, engine } = await synth(p, slug);
      manifest[p] = rel;
      generated++;
      if (generated % 10 === 0) {
        saveManifest(manifest);
        console.log(`  ...${generated} generated (latest: "${p.slice(0, 40)}", via ${engine})`);
      }
      if (generated >= MAX_PER_RUN) {
        console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
        break;
      }
      await new Promise((r) => setTimeout(r, paceFor(engine)));
    } catch (err) {
      if (err instanceof QuotaError && allExhausted()) {
        console.log('  all TTS quotas exhausted — stopping (remaining phrases use device TTS).');
        break;
      }
      console.error(`  !! failed "${p.slice(0, 40)}":`, err instanceof Error ? err.message : err);
    }
  }

  saveManifest(manifest);
  console.log(`Done. Generated ${generated} this run. Manifest now has ${Object.keys(manifest).length} phrases.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
