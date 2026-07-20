/**
 * generateAudio.ts
 *
 * Generates native-sounding English audio for every sentence in
 * data/topics.json that doesn't yet have an audio file.
 *
 * Primary engine:   ElevenLabs (studio-grade, human-like). Used when
 *                    ELEVENLABS_API_KEY is present. Outputs MP3.
 * Fallback engine:   Google Gemini TTS preview. Used when no ElevenLabs
 *                    key is set, or when ElevenLabs quota is exhausted.
 *                    Outputs WAV.
 *
 * Run:      tsx scripts/generateAudio.ts
 * Requires: ELEVENLABS_API_KEY (preferred) and/or GEMINI_API_KEY
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

// Engine selection. Gemini (voice "Puck") is the default: it sounds natural,
// and its free tier comfortably covers one 12-sentence topic per day, whereas
// the ElevenLabs free tier only covers a few days per month. Set
// TTS_ENGINE=elevenlabs to opt back into ElevenLabs.
const ENGINE = (process.env.TTS_ENGINE || 'gemini').toLowerCase();

// ---------------------------------------------------------------------------
// ElevenLabs config (opt-in)
// ---------------------------------------------------------------------------
const ELEVEN_KEY = ENGINE === 'elevenlabs' ? process.env.ELEVENLABS_API_KEY : undefined;
// Default voice: "Brian" — a warm, natural American-male narrator voice that
// reads conversationally rather than like a news anchor. Override with any
// voice id from your ElevenLabs voice library via ELEVENLABS_VOICE_ID.
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';
// eleven_multilingual_v2 = the highest-fidelity, most human production model.
// (eleven_turbo_v2_5 is faster/cheaper but slightly less expressive.)
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

// Voice settings tuned for natural, expressive speech:
//  - stability 0.40   → lets intonation breathe (lower = more emotive/varied)
//  - similarity 0.80  → stays faithful to the voice timbre
//  - style 0.45       → adds conversational expressiveness
//  - speaker_boost    → richer presence
const ELEVEN_VOICE_SETTINGS = {
  stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.4),
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.8),
  style: Number(process.env.ELEVENLABS_STYLE ?? 0.45),
  use_speaker_boost: true,
};

// ---------------------------------------------------------------------------
// Gemini config (fallback)
// ---------------------------------------------------------------------------
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
// "Puck" — the voice the user picked after A/B-listening to the back catalogue.
const GEMINI_VOICE = process.env.TTS_VOICE || 'Puck';
const GEMINI_SAMPLE_RATE = 24000;

// Style instruction. This is the exact wording that produced the audio the
// user singled out as natural, so keep it stable — changing it changes how
// every future topic sounds.
function geminiWrapWithStyle(text: string): string {
  const style =
    'in a natural, warm, expressive conversational tone — like a friend ' +
    'explaining something in person — with appropriate intonation, emphasis ' +
    'on key words, and brief natural pauses at commas';
  const safe = text.replace(/"/g, '\\"');
  return `Say ${style}: "${safe}"`;
}

// ---------------------------------------------------------------------------

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

class QuotaError extends Error {}

// Returns the relative audioPath written, or throws.
async function synthesizeEleven(text: string, baseNoExt: string): Promise<string> {
  if (!ELEVEN_KEY) throw new Error('no ElevenLabs key');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVEN_KEY,
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
    const body = await res.text();
    // 401 with quota_exceeded, or 429 rate/credit limit → fall back to Gemini.
    throw new QuotaError(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ElevenLabs error ${res.status}: ${t.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = `${baseNoExt}.mp3`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  return `./assets/audio/${path.basename(outPath)}`;
}

async function synthesizeGemini(
  text: string,
  baseNoExt: string,
  attempt = 1
): Promise<string> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY env var is required.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: geminiWrapWithStyle(text) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
        },
      },
    }),
  });

  if (res.status === 429 && attempt < 6) {
    const body = await res.text();
    const m = body.match(/retry in ([0-9.]+)s/);
    const wait = m ? Math.ceil(parseFloat(m[1]) * 1000) + 2000 : 30000 * attempt;
    console.log(`    [gemini] rate limited, retry in ${Math.round(wait / 1000)}s (attempt ${attempt})`);
    await new Promise((r) => setTimeout(r, wait));
    return synthesizeGemini(text, baseNoExt, attempt + 1);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini TTS error ${res.status}: ${t}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('No audio in response');
  const pcm = Buffer.from(b64, 'base64');
  const wav = pcmToWav(pcm, GEMINI_SAMPLE_RATE);
  const outPath = `${baseNoExt}.wav`;
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, wav);
  return `./assets/audio/${path.basename(outPath)}`;
}

// Per-run cap. Gemini's free TTS tier allows ~15 requests/day, which is just
// enough for one 12-sentence topic; ElevenLabs is limited by monthly credits
// instead, so it can take a higher cap.
const MAX_PER_RUN = Number(
  process.env.MAX_AUDIO_PER_RUN ?? (ENGINE === 'elevenlabs' ? 30 : 14)
);
// Overwrite existing audio (used for a one-time migration to ElevenLabs).
const FORCE = process.env.FORCE_REGEN === '1';

// Find an already-generated audio file (either extension) for a sentence slot.
function existingAudio(topicId: string, i: number): string | null {
  for (const ext of ['mp3', 'wav']) {
    const abs = path.join(AUDIO_DIR, `${topicId}_${i}.${ext}`);
    if (fs.existsSync(abs)) return `./assets/audio/${topicId}_${i}.${ext}`;
  }
  return null;
}

async function main() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const topics = loadTopics();
  const engine = ELEVEN_KEY ? 'ElevenLabs (Gemini fallback)' : 'Gemini';
  console.log(
    `Scanning ${topics.length} topics for missing audio — engine: ${engine}, cap: ${MAX_PER_RUN}/run${FORCE ? ', FORCE regen' : ''}...`
  );

  let generated = 0;
  let skipped = 0;
  let mutated = false;
  let elevenDisabled = !ELEVEN_KEY;

  // Newest first so today's topic gets audio before older backlog.
  const ordered = [...topics].reverse();
  outer: for (const topic of ordered) {
    for (let i = 0; i < topic.sentences.length; i++) {
      const s = topic.sentences[i];
      const baseNoExt = path.join(AUDIO_DIR, `${topic.id}_${i}`);

      if (!FORCE) {
        const existing = existingAudio(topic.id, i);
        if (existing) {
          if (s.audioPath !== existing) { s.audioPath = existing; mutated = true; }
          skipped++;
          continue;
        }
      }

      try {
        let relPath: string;
        if (!elevenDisabled) {
          try {
            console.log(`  [11L] -> ${topic.id}_${i}: ${s.en.slice(0, 55)}...`);
            relPath = await synthesizeEleven(s.en, baseNoExt);
          } catch (e) {
            if (e instanceof QuotaError) {
              console.log(`  ElevenLabs quota/credits exhausted → switching to Gemini fallback.`);
              console.log(`    (${e.message})`);
              elevenDisabled = true;
              console.log(`  [gemini] -> ${topic.id}_${i}: ${s.en.slice(0, 55)}...`);
              relPath = await synthesizeGemini(s.en, baseNoExt);
            } else {
              throw e;
            }
          }
        } else {
          console.log(`  [gemini] -> ${topic.id}_${i}: ${s.en.slice(0, 55)}...`);
          relPath = await synthesizeGemini(s.en, baseNoExt);
        }

        // Clean up a stale file with the *other* extension (provider switch).
        const otherExt = relPath.endsWith('.mp3') ? 'wav' : 'mp3';
        const stale = path.join(AUDIO_DIR, `${topic.id}_${i}.${otherExt}`);
        if (fs.existsSync(stale)) fs.rmSync(stale);

        s.audioPath = relPath;
        mutated = true;
        generated++;
        if (generated >= MAX_PER_RUN) {
          console.log(`  reached per-run cap (${MAX_PER_RUN}); stopping.`);
          break outer;
        }
        // Gentle pacing. ElevenLabs has generous RPS; Gemini free is 3 RPM.
        await new Promise((r) => setTimeout(r, elevenDisabled ? 22000 : 1200));
      } catch (err) {
        console.error(`  !! failed ${topic.id}_${i}:`, err);
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
