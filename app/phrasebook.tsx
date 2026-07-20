import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePhraseBook, type SavedPhrase } from '../hooks/usePhraseBook';
import phraseAudio from '../data/phraseAudio.json';
import { audioKey, playShort } from '../lib/audio';

const PHRASE_AUDIO: Record<string, string> = phraseAudio as Record<string, string>;

export default function PhraseBookScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { phrases, removePhrase } = usePhraseBook();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: '熟語帳' });
    }, [navigation])
  );

  const grouped = useMemo(() => {
    // Sort by saved date desc (already inserted at head, but make explicit)
    return [...phrases].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );
  }, [phrases]);

  const renderItem = ({ item }: { item: SavedPhrase }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => playShort(item.phrase, PHRASE_AUDIO[audioKey(item.phrase)])}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Text selectable style={styles.phrase}>{item.phrase}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => removePhrase(item.phrase)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Remove from phrase book"
          >
            <Ionicons name="checkmark-circle" size={22} color="#34d399" />
          </TouchableOpacity>
          <Ionicons name="volume-medium-outline" size={16} color="#fbbf24" />
        </View>
      </View>
      <Text selectable style={styles.meaning}>{item.meaning}</Text>
      {item.usage ? (
        <Text selectable style={styles.usage}>💬 {item.usage}</Text>
      ) : null}
      {item.sentenceEn ? (
        <Text selectable style={styles.source} numberOfLines={2}>
          ✏︎ {item.sentenceEn}
        </Text>
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={grouped}
        keyExtractor={(p) => p.phrase + p.savedAt}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        ListHeaderComponent={
          <Text style={styles.headerCount}>
            {grouped.length} {grouped.length === 1 ? 'phrase' : 'phrases'} 保存中
          </Text>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={48} color="#475569" />
            <Text style={styles.emptyTitle}>熟語帳は空です</Text>
            <Text style={styles.emptySub}>
              各文の「覚えたい表現」横の ＋ アイコンをタップすると{'\n'}
              ここに保存されます。
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f14' },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  headerCount: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'rgba(251,191,36,0.06)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#fbbf24',
    marginVertical: 5,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  phrase: {
    color: '#fde68a',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meaning: { color: '#e2e8f0', fontSize: 14, marginTop: 4, lineHeight: 20 },
  usage: { color: '#94a3b8', fontSize: 12, marginTop: 4, fontStyle: 'italic' },
  source: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  empty: {
    alignItems: 'center',
    marginTop: 80,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyTitle: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
