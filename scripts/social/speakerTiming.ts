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
    let best = 0;
    let bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let e2 = 0;
      for (let i = 0; i < win; i++) {
        num += x[start + i] * x[start + i + lag];
        e2 += x[start + i + lag] * x[start + i + lag];
      }
      const c = num / Math.sqrt(energy * e2 + 1e-12);
      if (c > best) {
        best = c;
        bestLag = lag;
      }
    }
    if (best > 0.6 && bestLag > 0) pitches.push(r / bestLag);
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
): Span[] | null {
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
  const cost = (i: number, voice: string) => {
    const p = stretches[i].pitch;
    if (p === null) return 0;
    const d = Math.log(p) - logThr;
    const wrong = voice === 'low' ? Math.max(0, d) : Math.max(0, -d);
    return wrong * (stretches[i].end - stretches[i].start);
  };

  // Split the stretches, in order, into exactly the script's turns so that
  // total mismatch is minimal (dynamic programming over stretch × turn).
  const INF = Number.POSITIVE_INFINITY;
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(T + 1).fill(INF));
  const from: number[][] = Array.from({ length: N + 1 }, () => new Array(T + 1).fill(-1));
  dp[0][0] = 0;
  for (let i = 1; i <= N; i++) {
    for (let k = 1; k <= Math.min(i, T); k++) {
      const c = cost(i - 1, expected[k - 1].voice);
      const stay = dp[i - 1][k]; // stretch i-1 continues turn k-1
      const open = dp[i - 1][k - 1]; // stretch i-1 starts turn k-1
      if (stay <= open) {
        dp[i][k] = stay + c;
        from[i][k] = k;
      } else {
        dp[i][k] = open + c;
        from[i][k] = k - 1;
      }
    }
  }
  if (!Number.isFinite(dp[N][T])) return null;
  const turnOf: number[] = new Array(N);
  for (let i = N, k = T; i >= 1; i--) {
    turnOf[i - 1] = k - 1;
    k = from[i][k];
  }
  const turns = expected.map(() => ({ start: INF, end: 0 }));
  stretches.forEach((st, i) => {
    const t = turns[turnOf[i]];
    t.start = Math.min(t.start, st.start);
    t.end = Math.max(t.end, st.end);
  });

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
  return spans;
}
