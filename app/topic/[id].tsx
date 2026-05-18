import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import { topics, type Sentence } from '../../data/topics';
import wordMeanings from '../../data/wordMeanings.json';
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

const TRANSLATE_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const BUNDLED_MEANINGS: Record<string, string> = wordMeanings as Record<string, string>;

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

async function fetchJapaneseMeaning(word: string): Promise<string | null> {
  const cached = BUNDLED_MEANINGS[word.toLowerCase()];
  if (cached) return cached;
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
        if (res.status === 429) break;
        if (!res.ok) continue;
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      } catch {}
    }
  }
  return null;
}

export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const topic = topics.find((t) => t.id === id);

  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWord, setSelectedWord] = useState('');
  const [dictData, setDictData] = useState<DictionaryEntry[] | null>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState<string | null>(null);
  const [japaneseMeaning, setJapaneseMeaning] = useState<string | null>(null);

  // Audio lives at the screen level so FlatList recycling of cards never
  // tears down a playing sound.
  const soundRef = useRef<Audio.Sound | null>(null);
  const playRequestIdRef = useRef(0);

  // Prime audio mode once on mount
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {});
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      Speech.stop();
    };
  }, []);

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

  const stopAll = useCallback(async () => {
    if (soundRef.current) {
      const prev = soundRef.current;
      soundRef.current = null;
      try { await prev.stopAsync(); } catch {}
      try { await prev.unloadAsync(); } catch {}
    }
    try { Speech.stop(); } catch {}
  }, []);

  const playSentence = useCallback(
    async (index: number, sentence: Sentence) => {
      const myRequest = ++playRequestIdRef.current;
      await stopAll();
      if (playRequestIdRef.current !== myRequest) return;

      setSpeakingIndex(index);

      if (sentence.audioPath) {
        setLoadingIndex(index);
        try {
          const uri = resolveAudioUri(sentence.audioPath);
          const loadPromise = Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true }
          );
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('audio timeout')), 6000)
          );
          const { sound } = (await Promise.race([
            loadPromise,
            timeoutPromise,
          ])) as Awaited<typeof loadPromise>;
          setLoadingIndex(null);

          if (playRequestIdRef.current !== myRequest) {
            try { await sound.unloadAsync(); } catch {}
            return;
          }
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if (!status.isLoaded) {
              if ((status as any).error) {
                setSpeakingIndex(null);
              }
              return;
            }
            if (status.didJustFinish) {
              setSpeakingIndex(null);
              sound.unloadAsync().catch(() => {});
              if (soundRef.current === sound) soundRef.current = null;
            }
          });
          return;
        } catch (err) {
          setLoadingIndex(null);
          console.warn('Audio load failed, fallback to TTS:', err);
          if (playRequestIdRef.current !== myRequest) return;
        }
      }

      // TTS fallback
      try { Speech.stop(); } catch {}
      Speech.speak(sentence.en, {
        language: 'en-US',
        rate: 0.85,
        pitch: 1.0,
        onDone: () => {
          if (playRequestIdRef.current === myRequest) setSpeakingIndex(null);
        },
        onError: () => {
          if (playRequestIdRef.current === myRequest) setSpeakingIndex(null);
        },
        onStopped: () => {
          if (playRequestIdRef.current === myRequest) setSpeakingIndex(null);
        },
      });
      // Safety timeout so the speaking indicator clears even if onDone is
      // dropped by the platform (some web browsers).
      const estMs = Math.max(2500, sentence.en.length * 70) + 2000;
      setTimeout(() => {
        if (playRequestIdRef.current === myRequest) setSpeakingIndex(null);
      }, estMs);
    },
    [stopAll]
  );

  const handleWordTap = useCallback(async (word: string) => {
    const clean = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (!clean) return;
    Speech.stop();
    Speech.speak(clean, { language: 'en-US', rate: 0.8, pitch: 1.0 });

    setSelectedWord(clean);
    setDictData(null);
    setDictError(null);
    setJapaneseMeaning(null);
    setDictLoading(true);
    setModalVisible(true);

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
      .then((ja) =>
        setJapaneseMeaning(ja ?? '（取得できませんでした。タップして再試行）')
      )
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
            isLoading={loadingIndex === index}
            onPlay={() => playSentence(index, item)}
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
  container: { flex: 1, backgroundColor: '#0f0f14' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
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
  sentenceCount: { color: '#64748b', fontSize: 13 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f0f14',
  },
  errorText: { color: '#ef4444', fontSize: 16 },
});
