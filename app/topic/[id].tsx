import React, { useState, useCallback } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { topics } from '../../data/topics';
import SentenceCard from '../../components/SentenceCard';
import WordDefinitionModal from '../../components/WordDefinitionModal';

interface DictionaryMeaning {
  partOfSpeech: string;
  definitions: { definition: string; example?: string }[];
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  meanings: DictionaryMeaning[];
}

// Try several Gemini models in order; flash-lite has the highest free-tier
// daily quota, with flash and 2.0-flash as fallbacks if one is exhausted.
const TRANSLATE_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

async function fetchJapaneseMeaning(word: string): Promise<string | null> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return null;
  const prompt = `英単語「${word}」の日本語の意味を、品詞ごとに簡潔に列挙してください。
形式: 各行「品詞: 意味1, 意味2」。
- 不明な単語や固有名詞でも、推測して何らかの意味を返してください
- 前置きや余計な解説は不要、意味だけ`;

  for (const model of TRANSLATE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.2 },
            }),
          }
        );
        if (res.status === 429) {
          // rate limited on this model — try next model
          break;
        }
        if (!res.ok) continue;
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } catch {
        // network glitch — retry once
      }
    }
  }
  return null;
}

export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const topic = topics.find((t) => t.id === id);

  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [dictData, setDictData] = useState<DictionaryEntry[] | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [japaneseMeaning, setJapaneseMeaning] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (topic) {
        navigation.setOptions({ title: topic.title });
      }
      return () => {
        Speech.stop();
      };
    }, [topic, navigation])
  );

  const handleSpeakStart = useCallback((index: number) => {
    Speech.stop();
    setSpeakingIndex(index);
  }, []);

  const handleSpeakDone = useCallback(() => {
    setSpeakingIndex(null);
  }, []);

  const handleWordTap = useCallback(async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (!clean) return;

    // Speak the word immediately for pronunciation practice
    Speech.stop();
    Speech.speak(clean, { language: 'en-US', rate: 0.8, pitch: 1.0 });

    setSelectedWord(clean);
    setDictData(null);
    setDictError(null);
    setJapaneseMeaning(null);
    setDictLoading(true);
    setModalVisible(true);

    // Fetch English dictionary + Japanese meaning in parallel
    const dictPromise = fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          setDictError(`No definition found for "${clean}".`);
          return;
        }
        const json: DictionaryEntry[] = await res.json();
        setDictData(json);
      })
      .catch(() => setDictError('Network error.'));

    const jpPromise = fetchJapaneseMeaning(clean)
      .then((ja) => setJapaneseMeaning(ja ?? '（取得できませんでした。タップして再試行）'))
      .catch(() => setJapaneseMeaning('（取得できませんでした）'));

    await Promise.all([dictPromise, jpPromise]);
    setDictLoading(false);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  if (!topic) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Topic not found.</Text>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={topic.sentences}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <SentenceCard
            sentence={item}
            index={index}
            isSpeaking={speakingIndex === index}
            onSpeak={() => handleSpeakStart(index)}
            onSpeakDone={handleSpeakDone}
            onWordTap={handleWordTap}
          />
        )}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{topic.category}</Text>
            </View>
            <Text style={styles.sentenceCount}>
              {topic.sentences.length} sentences
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        style={styles.container}
      />

      <WordDefinitionModal
        visible={modalVisible}
        word={selectedWord}
        data={dictData}
        loading={dictLoading}
        error={dictError}
        japaneseMeaning={japaneseMeaning}
        onClose={handleCloseModal}
        onPronounce={() => {
          Speech.stop();
          Speech.speak(selectedWord, { language: 'en-US', rate: 0.8 });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f14',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  categoryBadge: {
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryText: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  sentenceCount: {
    color: '#64748b',
    fontSize: 13,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f14',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
  },
});
