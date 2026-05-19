import React, { useState, useCallback } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import type { Sentence } from '../data/topics';
import { usePhraseBook } from '../hooks/usePhraseBook';

interface Props {
  sentence: Sentence;
  index: number;
  isSpeaking: boolean;
  isLoading: boolean;
  topicId?: string;
  onPlay: () => void;
  onWordTap: (word: string) => void;
}

export default function SentenceCard({
  sentence,
  index,
  isSpeaking,
  isLoading,
  topicId,
  onPlay,
  onWordTap,
}: Props) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [pressedIdx, setPressedIdx] = useState<number | null>(null);
  const [stuckIdx, setStuckIdx] = useState<number | null>(null);
  const { isSaved, togglePhrase } = usePhraseBook();

  const words = sentence.en.split(/(\s+)/);

  const handleCardPress = useCallback(() => {
    setStuckIdx(null);
    setPressedIdx(null);
    onPlay();
  }, [onPlay]);

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
            if (/^\s+$/.test(token) || token === '') return token;
            const isHot = pressedIdx === i || stuckIdx === i;
            return (
              <Text
                key={i}
                onPress={() => {
                  if (stuckIdx === i) {
                    setStuckIdx(null);
                    setPressedIdx(null);
                    return;
                  }
                  setStuckIdx(null);
                  onWordTap(token);
                }}
                onPressIn={() => setPressedIdx(i)}
                onPressOut={() =>
                  setPressedIdx((cur) => (cur === i ? null : cur))
                }
                onLongPress={() => {
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
          {isLoading ? (
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

      {sentence.phrases && sentence.phrases.length > 0 && (
        <View style={styles.phrasesRow}>
          <View style={styles.phrasesHeader}>
            <Ionicons name="bulb-outline" size={13} color="#fbbf24" />
            <Text style={styles.phrasesHeaderText}>覚えたい表現</Text>
          </View>
          {sentence.phrases.map((p, i) => {
            const saved = isSaved(p.phrase);
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => {
                  try { Speech.stop(); } catch {}
                  Speech.speak(p.phrase, { language: 'en-US', rate: 0.85, pitch: 1.0 });
                }}
                style={styles.phraseItem}
                accessibilityLabel={`Play phrase ${p.phrase}`}
              >
                <View style={styles.phraseHeaderRow}>
                  <Text selectable style={styles.phraseEn}>{p.phrase}</Text>
                  <View style={styles.phraseActions}>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        togglePhrase({
                          phrase: p.phrase,
                          meaning: p.meaning,
                          usage: p.usage,
                          topicId,
                          sentenceEn: sentence.en,
                        });
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel={saved ? 'Remove from phrase book' : 'Save to phrase book'}
                    >
                      <Ionicons
                        name={saved ? 'checkmark-circle' : 'add-circle-outline'}
                        size={20}
                        color={saved ? '#34d399' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                    <Ionicons name="volume-medium-outline" size={14} color="#fbbf24" />
                  </View>
                </View>
                <Text selectable style={styles.phraseJa}>{p.meaning}</Text>
                {p.usage && (
                  <Text selectable style={styles.phraseUsage}>
                    💬 {p.usage}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
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
  phrasesRow: {
    marginTop: 10,
    marginLeft: 30,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  phrasesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  phrasesHeaderText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  phraseItem: {
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderLeftWidth: 2,
    borderLeftColor: '#fbbf24',
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 6,
  },
  phraseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  phraseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phraseEn: {
    color: '#fde68a',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  phraseJa: {
    color: '#e2e8f0',
    fontSize: 13,
    marginTop: 2,
  },
  phraseUsage: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
