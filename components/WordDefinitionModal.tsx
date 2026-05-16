import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Definition {
  definition: string;
  example?: string;
}

interface Meaning {
  partOfSpeech: string;
  definitions: Definition[];
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings: Meaning[];
}

interface Props {
  visible: boolean;
  word: string;
  data: DictionaryEntry[] | null;
  loading: boolean;
  error: string | null;
  japaneseMeaning?: string | null;
  onClose: () => void;
  onPronounce?: () => void;
}

export default function WordDefinitionModal({
  visible,
  word,
  data,
  loading,
  error,
  japaneseMeaning,
  onClose,
  onPronounce,
}: Props) {
  // Find the best phonetic from the array
  const getPhonetic = (entry: DictionaryEntry): string => {
    if (entry.phonetic) return entry.phonetic;
    const found = entry.phonetics?.find((p) => p.text);
    return found?.text ?? '';
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.wordBlock}>
              <Text style={styles.wordText}>{word}</Text>
              {data && data[0] && (
                <Text style={styles.phoneticText}>
                  {getPhonetic(data[0])}
                </Text>
              )}
            </View>
            <View style={styles.headerActions}>
              {onPronounce && (
                <TouchableOpacity
                  onPress={onPronounce}
                  style={styles.pronounceBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Pronounce word"
                >
                  <Ionicons name="volume-high" size={22} color="#60a5fa" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Looking up "{word}"…</Text>
              </View>
            )}

            {error && !loading && (
              <View style={styles.centered}>
                <Ionicons name="alert-circle-outline" size={40} color="#f87171" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {japaneseMeaning && !loading && (
              <View style={styles.jpBlock}>
                <Text style={styles.jpLabel}>日本語の意味</Text>
                <Text style={styles.jpText}>{japaneseMeaning}</Text>
              </View>
            )}

            {data && !loading && !error && (
              <>
                {data.map((entry, ei) =>
                  entry.meanings.map((meaning, mi) => (
                    <View key={`${ei}-${mi}`} style={styles.meaningBlock}>
                      <View style={styles.posRow}>
                        <Text style={styles.pos}>{meaning.partOfSpeech}</Text>
                        <View style={styles.posDivider} />
                      </View>
                      {meaning.definitions.slice(0, 5).map((def, di) => (
                        <View key={di} style={styles.defRow}>
                          <Text style={styles.defNum}>{di + 1}.</Text>
                          <View style={styles.defContent}>
                            <Text style={styles.defText}>{def.definition}</Text>
                            {def.example ? (
                              <Text style={styles.exampleText}>
                                "{def.example}"
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a2035',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '50%',
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#1e3a5f',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  wordBlock: {
    flex: 1,
  },
  wordText: {
    color: '#e2e8f0',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  phoneticText: {
    color: '#60a5fa',
    fontSize: 15,
    marginTop: 2,
    fontStyle: 'italic',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  pronounceBtn: {
    padding: 6,
    marginRight: 4,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  jpBlock: {
    marginTop: 12,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#60a5fa',
  },
  jpLabel: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  jpText: {
    color: '#e2e8f0',
    fontSize: 14,
    lineHeight: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 8,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  meaningBlock: {
    marginTop: 16,
  },
  posRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  pos: {
    color: '#a78bfa',
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    textTransform: 'lowercase',
  },
  posDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e3a5f',
  },
  defRow: {
    flexDirection: 'row',
    marginBottom: 10,
    gap: 6,
  },
  defNum: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '700',
    minWidth: 20,
    marginTop: 1,
  },
  defContent: {
    flex: 1,
  },
  defText: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 22,
  },
  exampleText: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 20,
  },
});
