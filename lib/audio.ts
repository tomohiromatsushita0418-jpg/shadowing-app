/**
 * Shared audio helpers.
 *
 * `playShort` is used for the short, on-demand clips (a tapped word or a
 * tapped phrase). It prefers a pre-generated ElevenLabs file — the same voice
 * and voice settings as the sentence audio — and only falls back to the
 * device's built-in speech synthesizer when no file exists for that text yet.
 */
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';

export function resolveAudioUri(audioPath: string): string {
  if (audioPath.startsWith('http')) return audioPath;
  const clean = audioPath.replace(/^\.\//, '');
  if (Platform.OS === 'web') return '/' + clean;
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any).expoGoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.developer?.hostUri;
  if (hostUri) {
    const host = String(hostUri).split('/')[0];
    return `http://${host}/${clean}`;
  }
  return clean;
}

/** Normalizes a phrase/word into the key used by the audio manifests. */
export function audioKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// One shared slot for short clips so a new tap always replaces the previous.
let currentShort: Audio.Sound | null = null;

export async function playShort(
  text: string,
  relPath: string | undefined,
  fallbackRate = 0.85
): Promise<void> {
  if (currentShort) {
    const prev = currentShort;
    currentShort = null;
    try { await prev.unloadAsync(); } catch {}
  }
  try { Speech.stop(); } catch {}

  if (relPath) {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: resolveAudioUri(relPath) },
        { shouldPlay: true }
      );
      currentShort = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (currentShort === sound) currentShort = null;
        }
      });
      return;
    } catch {
      // fall through to system TTS
    }
  }

  Speech.speak(text, { language: 'en-US', rate: fallbackRate, pitch: 1.0 });
}
