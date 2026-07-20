/**
 * ttsEngine.ts
 *
 * Shared speech synthesis for the short clips (single words and phrases).
 *
 * Default engine is Gemini with the "Puck" voice — the same engine, voice and
 * style wording used for sentence audio, so a tapped word/phrase sounds like
 * the same speaker. Set TTS_ENGINE=elevenlabs to use ElevenLabs instead.
 */

export const ENGINE = (process.env.TTS_ENGINE || 'gemini').toLowerCase();

export class QuotaError extends Error {}

// --- Gemini -----------------------------------------------------------------
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const GEMINI_VOICE = process.env.TTS_VOICE || 'Puck';
const GEMINI_SAMPLE_RATE = 24000;

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function geminiSynth(text: string, attempt = 1): Promise<Buffer> {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY is required.');
  const safe = text.replace(/"/g, '\\"');
  const prompt =
    `Say in a natural, warm, expressive conversational tone — like a friend ` +
    `explaining something in person — with clear pronunciation: "${safe}"`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: GEMINI_VOICE } },
          },
        },
      }),
    }
  );

  if (res.status === 429) {
    const body = await res.text();
    // Daily cap → give up so the caller can stop cleanly. Per-minute cap →
    // wait out the window and retry.
    if (/per day|PerDay|daily/i.test(body) || attempt >= 4) {
      throw new QuotaError(`Gemini 429: ${body.slice(0, 160)}`);
    }
    const m = body.match(/retry in ([0-9.]+)s/);
    const wait = m ? Math.ceil(parseFloat(m[1]) * 1000) + 2000 : 25000 * attempt;
    await new Promise((r) => setTimeout(r, wait));
    return geminiSynth(text, attempt + 1);
  }
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
  };
  const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('Gemini returned no audio');
  return pcmToWav(Buffer.from(b64, 'base64'), GEMINI_SAMPLE_RATE);
}

// --- ElevenLabs -------------------------------------------------------------
const ELEVEN_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb';
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const ELEVEN_VOICE_SETTINGS = {
  stability: Number(process.env.ELEVENLABS_STABILITY ?? 0.4),
  similarity_boost: Number(process.env.ELEVENLABS_SIMILARITY ?? 0.8),
  style: Number(process.env.ELEVENLABS_STYLE ?? 0.45),
  use_speaker_boost: true,
};

async function elevenSynth(text: string): Promise<Buffer> {
  if (!ELEVEN_KEY) throw new Error('ELEVENLABS_API_KEY is required.');
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}?output_format=mp3_44100_128`,
    {
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
    }
  );
  if (res.status === 401 || res.status === 429) {
    throw new QuotaError(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- Public API -------------------------------------------------------------

/** File extension produced by the active engine. */
export const AUDIO_EXT = ENGINE === 'elevenlabs' ? 'mp3' : 'wav';

/** Seconds to wait between requests to respect the active engine's rate limit. */
export const PACE_MS = ENGINE === 'elevenlabs' ? 350 : 21000;

export async function synthesize(text: string): Promise<Buffer> {
  return ENGINE === 'elevenlabs' ? elevenSynth(text) : geminiSynth(text);
}

export function engineReady(): boolean {
  return ENGINE === 'elevenlabs' ? !!ELEVEN_KEY : !!GEMINI_KEY;
}
