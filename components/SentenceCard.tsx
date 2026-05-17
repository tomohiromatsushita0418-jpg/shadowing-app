import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import type { Sentence } from '../data/topics';

function resolveAudioUri(audioPath: string): string {
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

interface Props {
  sentence: Sentence;
  index: number;
  isSpeaking: boolean;
  onSpeak: () => void;
  onSpeakDone: () => void;
  onWordTap: (word: string) => void;
}

export default function SentenceCard({
  sentence,
  index,
  isSpeaking,
  onSpeak,
  onSpeakDone,
  onWordTap,
}: Props) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);
  // Word that should STAY highlighted (after long-press) until dismissed
  const [stuckIdx, setStuckIdx] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const stoppedRef = useRef(false);

  const words = sentence.en.split(/(\s+)/);

  const stopAudio = useCallback(async () => {
    stoppedRef.current = true;
    if (soundRef.current) {
      const s = soundRef.current;
      soundRef.current = null;
      try { await s.stopAsync(); } catch {}
      try { await s.unloadAsync(); } catch {}
    }
    Speech.stop();
  }, []);

  // Stop this card's audio whenever the parent says we're no longer the
  // active card. This prevents audio from two cards overlapping when the
  // user taps another sentence mid-play.
  useEffect(() => {
    if (!isSpeaking) {
      stopAudio();
    }
  }, [isSpeaking, stopAudio]);

  useEffect(() => {
    return () => { stopAudio(); };
  }, [stopAudio]);

  const speakFallback = useCallback(() => {
    try { Speech.stop(); } catch {}
    Speech.speak(sentence.en, {
      language: 'en-US',
      rate: 0.85,
      pitch: 1.0,
      onDone: onSpeakDone,
      onError: onSpeakDone,
      onStopped: onSpeakDone,
    });
    // Safety: if Speech never fires onDone (some browsers), clear after a
    // generous estimated duration so the speaking indicator doesn't get
    // stuck on.
    const estMs = Math.max(2500, sentence.en.length * 70);
    setTimeout(() => onSpeakDone(), estMs + 1500);
  }, [sentence.en, onSpeakDone]);

  const playAudio = useCallback(async () => {
    stoppedRef.current = false;
    onSpeak();

    // Stop our own previous sound, if any
    if (soundRef.current) {
      const prev = soundRef.current;
      soundRef.current = null;
      try { await prev.unloadAsync(); } catch {}
    }
    // Stop any TTS in flight too
    try { Speech.stop(); } catch {}

    if (sentence.audioPath) {
      setLoading(true);
      try {
        const uri = resolveAudioUri(sentence.audioPath);
        // Race the audio load against a timeout so a hung 404 / network
        // doesn't leave the user staring at a non-playing card.
        const loadPromise = Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true }
        );
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('audio load timeout')), 6000)
        );
        const { sound } = (await Promise.race([
          loadPromise,
          timeoutPromise,
        ])) as Awaited<typeof loadPromise>;

        if (stoppedRef.current) {
          try { await sound.unloadAsync(); } catch {}
          setLoading(false);
          return;
        }
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) {
            // Web sometimes reports unload mid-stream; treat as done
            if ((status as any).error) {
              onSpeakDone();
            }
            return;
          }
          if (status.didJustFinish) {
            onSpeakDone();
            sound.unloadAsync().catch(() => {});
            if (soundRef.current === sound) soundRef.current = null;
          }
        });
        setLoading(false);
        return;
      } catch (err) {
        setLoading(false);
        console.warn('Audio load failed, falling back to TTS:', err);
        if (stoppedRef.current) return;
        // Fall through to TTS
      }
    }

    speakFallback();
  }, [sentence, onSpeak, onSpeakDone, speakFallback]);

  const handleCardPress = useCallback(() => {
    // Tap outside any word dismisses the long-press highlight
    setStuckIdx(null);
    setPressedIdx(null);
    playAudio();
  }, [playAudio]);

  const handleWordPress = useCallback(
    (word: string, evt: any) => {
      evt.stopPropagation();
      onWordTap(word);
    },
    [onWordTap]
  );

  return (
    <View style={[styles.card, isSpeaking && styles.cardSpeaking]}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{index + 1}</Text>
      </View>

      <Pressable
        style={styles.sentenceRow}
        onPress={handleCardPress}
        accessibilityRole="button"
        accessibilityLabel={`Play sentence ${index + 1}`}
      >
        <Text
          selectable
          dataDetectorType="none"
          style={[styles.sentenceText, isSpeaking && styles.wordSpeaking]}
        >
          {words.map((token, i) => {
            if (/^\s+$/.test(token) || token === '') {
              return token;
            }
            const isHot = pressedIdx === i || stuckIdx === i;
            return (
              <Text
                key={i}
                onPress={() => {
                  // If this word is stuck blue, tapping it unsticks instead
                  if (stuckIdx === i) {
                    setStuckIdx(null);
                    setPressedIdx(null);
                    return;
                  }
                  // Any other stuck word is dismissed
                  setStuckIdx(null);
                  onWordTap(token);
                }}
                onPressIn={() => setPressedIdx(i)}
                onPressOut={() => {
                  // Only reset transient highlight; keep stuck highlight as is
                  setPressedIdx((cur) => (cur === i ? null : cur));
                }}
                onLongPress={() => {
                  // Promote this word to "stuck" so it stays blue while the
                  // native selection / copy bubble is up. Tapping elsewhere
                  // or tapping the word again dismisses it.
                  setStuckIdx(i);
                  setPressedIdx(i);
                }}
                suppressHighlighting
                style={isHot ? styles.wordPressed : undefined}
              >
                {token}
              </Text>
            );
          })}
        </Text>

        <View style={styles.speakerBtn}>
          {loading ? (
            <ActivityIndicator size="small" color="#60a5fa" />
          ) : (
            <Ionicons
              name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
              size={22}
              color={isSpeaking ? '#60a5fa' : '#475569'}
            />
          )}
        </View>
      </Pressable>

      <View style={styles.translationRow}>
        <TouchableOpacity
          onPress={() => setShowTranslation((v) => !v)}
          style={styles.toggleBtn}
          accessibilityRole="button"
          accessibilityLabel={showTranslation ? 'Hide translation' : 'Show translation'}
        >
          <Ionicons
            name={showTranslation ? 'eye-off-outline' : 'eye-outline'}
            size={14}
            color="#475569"
          />
          <Text style={styles.toggleText}>訳</Text>
        </TouchableOpacity>

        {showTranslation && (
          <Text selectable style={styles.translation}>{sentence.ja}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161b27',
    borderRadius: 14,
    padding: 14,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2d45',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  cardSpeaking: {
    borderColor: '#3b82f6',
    backgroundColor: '#0f1f38',
    shadowColor: '#3b82f6',
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  numberBadge: {
    position: 'absolute',
    top: 10,
    left: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: { color: '#64748b', fontSize: 10, fontWeight: '700' },
  sentenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 30,
    paddingRight: 4,
    marginBottom: 10,
  },
  wordsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  sentenceText: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 26,
    fontWeight: '400',
  },
  wordSpeaking: { color: '#93c5fd' },
  wordPressed: { color: '#3b82f6' },
  speakerBtn: {
    paddingLeft: 10,
    paddingTop: 2,
    minWidth: 30,
    alignItems: 'center',
  },
  translationRow: {
    paddingLeft: 30,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  toggleText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 2,
  },
  translation: {
    color: '#94a3b8',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});
