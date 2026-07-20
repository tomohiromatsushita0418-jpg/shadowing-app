/**
 * generateAudio.ts
 *
 * Generates native-sounding English audio for every sentence in
 * data/topics.json that doesn't yet have an audio file.
 *
 * Sentences are the highest-priority audio, so this runs first and gets the
 * scarce Gemini budget before the phrase/word scripts. See ttsEngine.ts for
 * the Gemini (voice "Puck") → ElevenLabs overflow cascade.
 *
 * Run:      tsx scripts/generateAudio.ts
 * Requires: GEMINI_API_KEY and/or ELEVENLABS_API_KEY
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuotaError, allExhausted, anyEngineReady, paceFor, synthesize } from './ttsEngine.js';

interface Sentence { en: string; ja: string; audioPath?: string }
interface Topic { id: string; title: string; category: string; sentences: Sentence[] }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const TOPICS_PATH = path.join(ROOT, 'data', 'topics.json');
const AUDIO_DIR = path.join(ROOT, 'assets', 'audio');

// Per-run cap. Gemini's free TTS tier allows ~15 requests/day, which is just
// enough for one 12-sentence topic; ElevenLabs is limited by monthly credits
// instead, so it can take a higher cap.
const MAX_PER_RUN = Number(process.env.MAX_AUDIO_PER_RUN ?? 14);
// Overwrite existing audio (used for a one-time migration to ElevenLabs).
const FORCE = process.env.FORCE_REGEN === '1';

function loadTopics(): Topic[] {
  if (!fs.existsSync(TOPICS_PATH)) return [];
  return JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf8') || '[]') as Topic[];
}

function saveTopics(topics: Topic[]): void {
  fs.writeFileSync(TOPICS_PATH, JSON.stringify(topics, null, 2) + '\n');
}

// Find an already-generated audio file (either extension) for a sentence slot.
function existingAudio(topicId: string, i: number): string | null {
  for (const ext of ['mp3', 'wav']) {
    const abs = path.join(AUDIO_DIR, `${topicId}_${i}.${ext}`);
    if (fs.existsSync(abs)) return `./assets/audio/${topicId}_${i}.${ext}`;
  }
  return null;
}

async function main() {
  if (!anyEngineReady()) {
    console.log('No TTS API key available — skipping audio generation.');
    return;
  }
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const topics = loadTopics();
  console.log(
    `Scanning ${topics.length} topics for missing audio — Gemini/Puck (ElevenLabs overflow), cap: ${MAX_PER_RUN}/run${FORCE ? ', FORCE regen' : ''}...`
  );

  let generated = 0;
  let skipped = 0;
  let mutated = false;

  // Newest first so today's topic gets audio before older backlog.
  const ordered = [...topics].reverse();
  outer: for (const topic of ordered) {
    for (let i = 0; i < topic.sentences.length; i++) {
      const s = topic.sentences[i];

      if (!FORCE) {
        const existing = existingAudio(topic.id, i);
        if (existing) {
          if (s.audioPath !== existing) { s.audioPath = existing; mutated = true; }
          skipped++;
          continue;
        }
      }

      try {
        console.log(`  -> ${topic.id}_${i}: ${s.en.slice(0, 55)}...`);
        const { buf, ext, engine } = await synthesize(s.en);
        const relPath = `./assets/audio/${topic.id}_${i}.${ext}`;
        fs.writeFileSync(path.join(AUDIO_DIR, `${topic.id}_${i}.${ext}`), buf);

        // Clean up a stale file with the *other* extension (engine switch).
        const otherExt = ext === 'mp3' ? 'wav' : 'mp3';
        const stale = path.join(AUDIO_DIR, `${topic.id}_${i}.${otherExt}`);
        if (fs.existsSync(stale)) fs.rmSync(stale);

        s.audioPath = relPath;
        mutated = true;
        generated++;
        if (generated >= MAX_PER_RUN) {
          console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
          break outer;
        }
        await new Promise((r) => setTimeout(r, paceFor(engine)));
      } catch (err) {
        if (err instanceof QuotaError && allExhausted()) {
          console.log('  all TTS quotas exhausted — stopping (remaining sentences use device TTS).');
          break outer;
        }
        console.error(`  !! failed ${topic.id}_${i}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  if (mutated) saveTopics(topics);
  console.log(`Done. Generated ${generated}, skipped ${skipped}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
