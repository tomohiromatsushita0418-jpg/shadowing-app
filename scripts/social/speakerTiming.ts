/**
 * speakerTiming.ts — works out when each line of a two-voice dialogue is
 * spoken, from the audio alone.
 *
 * Pauses alone are ambiguous (a breath inside a line can be longer than the
 * gap between turns), so each stretch of speech between pauses is labelled
 * low- or high-pitched by autocorrelation pitch tracking. Consecutive
 * stretches with the same voice merge into one turn; if the resulting turn
 * sequence matches the script (Ren = low voice, Mio = high voice), the turn
 * boundaries are exact speaker changes. Lines inside one turn are split by
 * text length. Returns null if the audio doesn't match the script, so the
 * caller can fall back.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export type Span = { start: number; end: number };
export type Silence = { s: number; e: number };

/** 16-bit mono PCM samples from a canonical 44-byte-header WAV. */
function readWav(file: string): { samples: Int16Array; rate: number } {
  const buf = fs.readFileSync(file);
  const rate = buf.readUInt32LE(24);
  const dataStart = buf.indexOf('data', 12) + 8;
  const view = new Int16Array(buf.buffer, buf.byteOffset + dataStart, Math.floor((buf.length - dataStart) / 2));
  return { samples: view, rate };
}

/** Median pitch (Hz) of the voiced frames in [from, to) seconds, or null. */
function medianPitch(samples: Int16Array, rate: number, from: number, to: number): number | null {
  const step = 2; // analyse at half rate — plenty for voice pitch
  const r = rate / step;
  const win = Math.round(r * 0.04);
  const hop = Math.round(r * 0.02);
  const minLag = Math.floor(r / 380);
  const maxLag = Math.ceil(r / 70);
  const a = Math.max(0, Math.floor(from * rate));
  const b = Math.min(samples.length, Math.floor(to * rate));
  const x: number[] = [];
  for (let i = a; i < b; i += step) x.push(samples[i] / 32768);
  if (x.length < win + maxLag) return null;

  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const pitches: number[] = [];
  for (let start = 0; start + win + maxLag < x.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < win; i++) energy += x[start + i] * x[start + i];
    if (Math.sqrt(energy / win) < peak * 0.08) continue; // unvoiced / quiet
    const corr: number[] = [];
    let best = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let e2 = 0;
      for (let i = 0; i < win; i++) {
        num += x[start + i] * x[start + i + lag];
        e2 += x[start + i + lag] * x[start + i + lag];
      }
      const c = num / Math.sqrt(energy * e2 + 1e-12);
      corr.push(c);
      if (c > best) best = c;
    }
    if (best <= 0.6) continue;
    // A periodic voice also correlates at 2x, 3x its period; taking the global
    // peak reads a high voice an octave low. Use the SHORTEST lag that is
    // (nearly) as good as the best, at a local maximum.
    let pick = -1;
    for (let k = 1; k < corr.length - 1; k++) {
      if (corr[k] >= 0.88 * best && corr[k] >= corr[k - 1] && corr[k] >= corr[k + 1]) {
        pick = k;
        break;
      }
    }
    if (pick >= 0) pitches.push(r / (minLag + pick));
  }
  if (pitches.length < 3) return null;
  pitches.sort((p, q) => p - q);
  return pitches[Math.floor(pitches.length / 2)];
}

export function speakerTimings(
  wavFile: string,
  silences: Silence[],
  speechStart: number,
  speechEnd: number,
  lines: { speaker: string; en: string }[],
  lowVoice = 'Ren',
): { spans: Span[]; cost: number } | null {
  const { samples, rate } = readWav(wavFile);

  // Speech stretches between the pauses.
  const stretches: { start: number; end: number; pitch: number | null }[] = [];
  let cursor = speechStart;
  for (const s of silences) {
    if (s.s > cursor + 0.05) stretches.push({ start: cursor, end: s.s, pitch: null });
    cursor = s.e;
  }
  if (speechEnd > cursor + 0.05) stretches.push({ start: cursor, end: speechEnd, pitch: null });
  for (const st of stretches) st.pitch = medianPitch(samples, rate, st.start, st.end);

  const known = stretches.map((s) => s.pitch).filter((p): p is number => p !== null);
  if (known.length < 2) return null;

  // Split the two voices with 2-means on log pitch.
  const logs = known.map(Math.log).sort((p, q) => p - q);
  let lo = logs[0];
  let hi = logs[logs.length - 1];
  for (let it = 0; it < 20; it++) {
    const mid = (lo + hi) / 2;
    const L = logs.filter((v) => v <= mid);
    const H = logs.filter((v) => v > mid);
    if (!L.length || !H.length) break;
    lo = L.reduce((p, q) => p + q, 0) / L.length;
    hi = H.reduce((p, q) => p + q, 0) / H.length;
  }
  if (hi - lo < Math.log(1.15)) return null; // voices too similar to separate
  const threshold = Math.exp((lo + hi) / 2);

  // Expected turns from the script.
  const expected: { voice: string; lines: number[] }[] = [];
  lines.forEach((l, i) => {
    const voice = l.speaker === lowVoice ? 'low' : 'high';
    const last = expected[expected.length - 1];
    if (last && last.voice === voice) last.lines.push(i);
    else expected.push({ voice, lines: [i] });
  });
  const T = expected.length;
  const N = stretches.length;
  if (N < T) return null;

  // Cost of putting stretch i in a turn of the given voice: how far its pitch
  // sits on the wrong side of the threshold, weighted by duration.
  const logThr = Math.log(threshold);
  const pitchCost = (i: number, voice: string) => {
    const p = stretches[i].pitch;
    if (p === null) return 0;
    const d = Math.log(p) - logThr;
    const wrong = voice === 'low' ? Math.max(0, d) : Math.max(0, -d);
    return wrong * (stretches[i].end - stretches[i].start);
  };

  // Expected speaking time of each turn, from its share of the text. Pitch
  // alone gets fooled by very expressive lines, so a turn whose length is far
  // from what its words need is penalised too.
  const dur = stretches.map((s) => s.end - s.start);
  const speech = dur.reduce((a, b) => a + b, 0);
  const tw = expected.map((t) => t.lines.reduce((a, i) => a + lines[i].en.length + 8, 0));
  const twSum = tw.reduce((a, b) => a + b, 0);
  const expDur = tw.map((w) => (speech * w) / twSum);
  const LAMBDA = 0.6;

  // dp[i][k]: best cost with stretches [0, i) split into turns [0, k).
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(T + 1).fill(INF));
  const back: number[][] = Array.from({ length: N + 1 }, () => new Array(T + 1).fill(-1));
  dp[0][0] = 0;
  for (let k = 1; k <= T; k++) {
    const voice = expected[k - 1].voice;
    for (let i = k; i <= N - (T - k); i++) {
      let pc = 0;
      let d = 0;
      for (let j = i - 1; j >= k - 1; j--) {
        // turn k-1 covers stretches [j, i)
        pc += pitchCost(j, voice);
        d += dur[j];
        if (!Number.isFinite(dp[j][k - 1])) continue;
        const dev = d - expDur[k - 1];
        const c = dp[j][k - 1] + pc + (LAMBDA * dev * dev) / Math.max(expDur[k - 1], 0.5);
        if (c < dp[i][k]) {
          dp[i][k] = c;
          back[i][k] = j;
        }
      }
    }
  }
  if (!Number.isFinite(dp[N][T])) return null;
  const turns: { start: number; end: number }[] = new Array(T);
  for (let i = N, k = T; k >= 1; k--) {
    const j = back[i][k];
    turns[k - 1] = { start: stretches[j].start, end: stretches[i - 1].end };
    i = j;
  }

  // Lines within a turn: share the turn's time by text length.
  const spans: Span[] = new Array(lines.length);
  turns.forEach((t, k) => {
    const idx = expected[k].lines;
    const weights = idx.map((i) => lines[i].en.length + 8);
    const sum = weights.reduce((p, q) => p + q, 0);
    let c = t.start;
    idx.forEach((i, j) => {
      const d = ((t.end - t.start) * weights[j]) / sum;
      spans[i] = { start: c, end: c + d };
      c += d;
    });
  });
  console.log(`[speaker-timing] ${T} turns aligned by voice (split at ${Math.round(threshold)} Hz, mismatch ${dp[N][T].toFixed(2)})`);
  return { spans, cost: dp[N][T] / T };
}

/** Pauses in a WAV (ffmpeg silencedetect) and the span that actually holds speech. */
export function detectSpeech(wavFile: string, total: number) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', wavFile, '-af', 'silencedetect=noise=-38dB:d=0.22', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = `${r.stderr ?? ''}`;
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const silences = starts.map((s, i) => ({ s, e: ends[i] ?? total })).filter((x) => x.e > x.s);
  let speechStart = 0;
  let speechEnd = total;
  if (silences.length && silences[0].s <= 0.05) speechStart = silences.shift()!.e;
  if (silences.length && silences[silences.length - 1].e >= total - 0.05) speechEnd = silences.pop()!.s;
  return { silences, speechStart, speechEnd };
}

/**
 * Does this voice track really contain the whole script? TTS sometimes drops
 * or merges lines; then the audio is too short for the text, or no split of
 * it matches the script's alternating voices.
 */
export function checkVoiceTrack(
  wavFile: string,
  lines: { speaker: string; en: string }[],
): { ok: boolean; reason: string } {
  const buf = fs.readFileSync(wavFile);
  const rate = buf.readUInt32LE(24);
  const dataStart = buf.indexOf('data', 12) + 8;
  const total = (buf.length - dataStart) / 2 / rate;
  const { silences, speechStart, speechEnd } = detectSpeech(wavFile, total);
  const speech = speechEnd - speechStart;
  const chars = lines.reduce((a, l) => a + l.en.length, 0);
  const expected = chars / 15; // ~15 characters per second of clear speech
  if (speech < expected * 0.7) {
    return { ok: false, reason: `too short: ${speech.toFixed(1)}s for ~${expected.toFixed(1)}s of text` };
  }
  const aligned = speakerTimings(wavFile, silences, speechStart, speechEnd, lines);
  if (!aligned) return { ok: false, reason: 'voices do not match the script' };
  if (aligned.cost > 0.25) return { ok: false, reason: `poor alignment (${aligned.cost.toFixed(2)})` };
  return { ok: true, reason: `ok (${speech.toFixed(1)}s, alignment ${aligned.cost.toFixed(2)})` };
}
