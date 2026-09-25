/**
 * drama.ts — writes today's episode of the Ren & Mio English mini-drama and
 * voices it.
 *
 * Each episode teaches ONE idiom taken from the newest lessons, used naturally
 * in a 30–45 second two-person scene that continues the running story
 * (data/drama.json). Both voices come from a single multi-speaker Gemini TTS
 * call, so a whole episode costs one request of the free daily quota.
 *
 * Run:   tsx scripts/social/drama.ts
 * Env:   GEMINI_API_KEY
 *        DRAMA_OUT=build/drama   output directory
 * Out:   script.json  — idiom, lines, YouTube metadata
 *        voice.wav    — the dialogue audio (24 kHz mono)
 *        state.json   — next data/drama.json, applied by the workflow only
 *                       after a successful upload
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTopics } from './compose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const STATE_FILE = path.join(ROOT, 'data', 'drama.json');

const TEXT_MODEL = 'gemini-2.5-flash';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const TTS_SAMPLE_RATE = 24000;

type Character = { ja: string; voice: string; image: string; profile: string };
type State = {
  episode: number;
  characters: Record<string, Character>;
  premise: string;
  synopsis: string;
  usedIdioms: string[];
};
export type Line = { speaker: string; en: string; ja: string };
export type Script = {
  episode: number;
  title: string;
  idiom: string;
  meaning: string;
  lines: Line[];
  nextSynopsis: string;
};

function key(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is required');
  return k;
}

async function gemini(model: string, body: unknown): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key()}`;
  // The preview TTS model is often briefly overloaded (500/503); back off and retry.
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    if ((res.status === 500 || res.status === 503) && attempt < 5) {
      console.log(`[drama] ${model} ${res.status}, retry ${attempt} in ${attempt * 15}s`);
      await new Promise((r) => setTimeout(r, attempt * 15_000));
      continue;
    }
    throw new Error(`${model} ${res.status}: ${text.slice(0, 400)}`);
  }
}

/** Multi-word expressions from the most recent lessons that haven't been used yet. */
function idiomCandidates(used: Set<string>): { phrase: string; meaning: string }[] {
  const topics = loadTopics();
  const seen = new Set<string>();
  const out: { phrase: string; meaning: string }[] = [];
  for (const topic of topics.slice(-5).reverse()) {
    for (const s of topic.sentences) {
      for (const p of s.phrases ?? []) {
        const k = p.phrase.trim().toLowerCase();
        const words = k.split(/\s+/).length;
        // Real idioms/phrasal verbs are short and carry no numbers or proper nouns.
        if (words < 2 || words > 5 || /\d/.test(k) || used.has(k) || seen.has(k)) continue;
        seen.add(k);
        out.push({ phrase: p.phrase.trim(), meaning: p.meaning });
      }
    }
  }
  return out.slice(0, 25);
}

async function writeScript(state: State): Promise<Script> {
  const used = new Set(state.usedIdioms.map((s) => s.toLowerCase()));
  const candidates = idiomCandidates(used);
  if (candidates.length === 0) throw new Error('No unused idiom candidates');
  const episode = state.episode + 1;
  const cast = Object.entries(state.characters)
    .map(([name, c]) => `- ${name} (${c.ja}): ${c.profile}`)
    .join('\n');

  const prompt = `You write "Ren & Mio", a serialized English-learning mini-drama for YouTube Shorts aimed at Japanese learners.

Premise: ${state.premise}
Cast:
${cast}

Story so far (Japanese): ${state.synopsis}
This is episode ${episode}.

Choose ONE expression for today's lesson. It must be something a learner genuinely wants to memorize: a real idiom, phrasal verb or set phrase that natives use in everyday or workplace conversation (e.g. "on the same page", "call it a day", "play it by ear", "get the hang of").
Prefer one from this list taken from today's lessons:
${candidates.map((c) => `- ${c.phrase} — ${c.meaning}`).join('\n')}
If none of them is a genuinely useful, conversational idiom, choose a common, high-value English idiom that fits the scene instead.
Never reuse any of these: ${[...used].join(', ') || '(none yet)'}.

Write the next scene:
- 6 to 8 lines, alternating speakers (Ren and Mio only), 30–45 seconds when spoken.
- Each English line is natural, native, spoken English, at most 14 words.
- Use the chosen expression naturally at least once (you may inflect it, e.g. tense).
- Continue the story from where it left off; move it forward a little; end on a small hook or a witty beat that makes viewers want tomorrow's episode.
- Keep it light and charming; no explicit content.
- Japanese translations are natural subtitles, not word-for-word.

Return ONLY JSON:
{
  "idiom": "the expression in its dictionary form",
  "meaning": "short natural Japanese meaning (<= 20 chars)",
  "title": "catchy Japanese hook title for the episode (<= 22 chars)",
  "lines": [{"speaker": "Ren" | "Mio", "en": "...", "ja": "..."}],
  "nextSynopsis": "updated running story summary in Japanese (<= 280 chars), including this episode"
}`;

  // A response schema keeps the output valid JSON; still retry a couple of
  // times in case the model returns something unusable.
  const schema = {
    type: 'OBJECT',
    properties: {
      idiom: { type: 'STRING' },
      meaning: { type: 'STRING' },
      title: { type: 'STRING' },
      lines: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            speaker: { type: 'STRING', enum: ['Ren', 'Mio'] },
            en: { type: 'STRING' },
            ja: { type: 'STRING' },
          },
          required: ['speaker', 'en', 'ja'],
        },
      },
      nextSynopsis: { type: 'STRING' },
    },
    required: ['idiom', 'meaning', 'title', 'lines', 'nextSynopsis'],
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await gemini(TEXT_MODEL, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      const raw = res.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = JSON.parse(raw) as Omit<Script, 'episode'>;
      const lines = (parsed.lines ?? []).filter(
        (l) => (l.speaker === 'Ren' || l.speaker === 'Mio') && l.en?.trim() && l.ja?.trim(),
      );
      if (lines.length < 4) throw new Error(`Script too short (${lines.length} lines)`);
      return { ...parsed, lines, episode };
    } catch (error) {
      lastError = error;
      console.log(`[drama] script attempt ${attempt} failed: ${(error as Error).message}`);
    }
  }
  throw lastError;
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function voice(script: Script, state: State): Promise<Buffer> {
  const transcript = script.lines.map((l) => `${l.speaker}: ${l.en}`).join('\n');
  const res = await gemini(TTS_MODEL, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Read this scene between Ren and Mio as a natural, warm, lightly playful conversation between two young colleagues. Clear pronunciation for English learners, relaxed pace. Leave a clear pause of about one second every time the speaker changes, and do not pause for long inside a line.\n\n${transcript}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: Object.entries(state.characters).map(([name, c]) => ({
            speaker: name,
            voiceConfig: { prebuiltVoiceConfig: { voiceName: c.voice } },
          })),
        },
      },
    },
  });
  const b64 = res.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
  if (!b64) throw new Error('TTS returned no audio');
  return pcmToWav(Buffer.from(b64, 'base64'), TTS_SAMPLE_RATE);
}

async function main() {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as State;
  const outDir = path.resolve(ROOT, process.env.DRAMA_OUT ?? 'build/drama');
  fs.mkdirSync(outDir, { recursive: true });

  const script = await writeScript(state);
  console.log(`[drama] #${script.episode} "${script.title}" — ${script.idiom} (${script.meaning})`);
  for (const l of script.lines) console.log(`  ${l.speaker}: ${l.en} / ${l.ja}`);

  const wav = await voice(script, state);
  fs.writeFileSync(path.join(outDir, 'voice.wav'), wav);
  fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2));

  const next: State = {
    ...state,
    episode: script.episode,
    synopsis: script.nextSynopsis || state.synopsis,
    usedIdioms: [...state.usedIdioms, script.idiom.toLowerCase()],
  };
  fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(next, null, 2) + '\n');
  console.log(`[drama] voice ${(wav.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, outDir)}`);
}

main().catch((error) => {
  console.error('[drama]', error instanceof Error ? error.message : error);
  process.exit(1);
});
