import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { topics, type Topic } from '../data/topics';
import FolderCard from '../components/FolderCard';

const FOLDER_SIZE = 10;

function totalSentences(): number {
  return topics.reduce((n, t) => n + t.sentences.length, 0);
}

function totalMinutes(): number {
  // Rough: ~3 minutes per topic
  return topics.length * 3;
}

function latestTopic(): { topic: Topic; index: number } | null {
  if (topics.length === 0) return null;
  return { topic: topics[topics.length - 1], index: topics.length - 1 };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const folders = useMemo(() => {
    const groups: { folderNumber: number; start: number; end: number; count: number }[] = [];
    const totalFolders = Math.max(1, Math.ceil(topics.length / FOLDER_SIZE));
    for (let i = 0; i < totalFolders; i++) {
      const start = i * FOLDER_SIZE + 1;
      const end = (i + 1) * FOLDER_SIZE;
      const count = Math.max(0, Math.min(topics.length, end) - start + 1);
      groups.push({ folderNumber: i + 1, start, end, count });
    }
    return groups;
  }, []);

  const featured = latestTopic();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={folders}
        keyExtractor={(f) => String(f.folderNumber)}
        renderItem={({ item }) => (
          <FolderCard
            folderNumber={item.folderNumber}
            start={item.start}
            end={item.end}
            count={item.count}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Hero / brand banner */}
            <LinearGradient
              colors={['#0b0c14', '#0b1424', '#0a0a10']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.brandRow}>
                <Text style={styles.brandName}>ECHO</Text>
                <Text style={styles.brandSep}>·</Text>
                <Text style={styles.brandSub}>shadowing studio</Text>
              </View>

              <View style={styles.heroBlock}>
                <Text style={styles.heroWord}>Listen.</Text>
                <Text style={styles.heroWord}>Mirror.</Text>
                <Text style={[styles.heroWord, styles.heroWordAccent]}>
                  Become fluent.
                </Text>
              </View>

              <Text style={styles.heroSub}>
                A daily shadowing ritual, curated by AI.
              </Text>

              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{topics.length}</Text>
                  <Text style={styles.statLabel}>Topics</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{totalSentences()}</Text>
                  <Text style={styles.statLabel}>Sentences</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{totalMinutes()}</Text>
                  <Text style={styles.statLabel}>Minutes</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Today's pick */}
            {featured && (
              <Pressable
                style={({ pressed }) => [
                  styles.featuredCard,
                  pressed && styles.featuredPressed,
                ]}
                onPress={() => router.push(`/topic/${featured.topic.id}`)}
              >
                <LinearGradient
                  colors={['#0c4a6e', '#0e7490']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.featuredInner}
                >
                  <View style={styles.featuredHeader}>
                    <View style={styles.featuredDot} />
                    <Text style={styles.featuredKicker}>LATEST DROP</Text>
                  </View>
                  <Text style={styles.featuredTitle} numberOfLines={2}>
                    {featured.topic.title}
                  </Text>
                  {featured.topic.titleJa && (
                    <Text style={styles.featuredTitleJa} numberOfLines={1}>
                      {featured.topic.titleJa}
                    </Text>
                  )}
                  <View style={styles.featuredFooter}>
                    <View style={styles.featuredMeta}>
                      <Ionicons name="mic-outline" size={13} color="#a5f3fc" />
                      <Text style={styles.featuredMetaText}>
                        {featured.topic.sentences.length} sentences
                      </Text>
                    </View>
                    <View style={styles.featuredCta}>
                      <Text style={styles.featuredCtaText}>Start</Text>
                      <Ionicons name="arrow-forward" size={16} color="#0c4a6e" />
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            )}

            {/* Phrase book entry */}
            <Pressable
              style={({ pressed }) => [
                styles.phraseBookBtn,
                pressed && styles.phraseBookBtnPressed,
              ]}
              onPress={() => router.push('/phrasebook' as any)}
            >
              <View style={styles.phraseBookLeft}>
                <View style={styles.phraseBookIcon}>
                  <Ionicons name="bookmark" size={18} color="#fbbf24" />
                </View>
                <View>
                  <Text style={styles.phraseBookTitle}>熟語帳</Text>
                  <Text style={styles.phraseBookSub}>保存したフレーズを復習</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </Pressable>

            {/* Section heading */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Stages</Text>
              <Text style={styles.sectionHint}>
                {folders.length} {folders.length === 1 ? 'stage' : 'stages'}
              </Text>
            </View>
          </>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f14',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  hero: {
    marginHorizontal: -16,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
  },
  brandName: {
    color: '#fafafa',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 6,
  },
  brandSep: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    fontWeight: '400',
  },
  brandSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'lowercase',
    fontStyle: 'italic',
  },
  heroBlock: {
    marginBottom: 16,
  },
  heroWord: {
    color: '#f5f5f7',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 40,
    letterSpacing: -1,
  },
  heroWordAccent: {
    color: '#fafafa',
    fontWeight: '700',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    fontStyle: 'italic',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statNum: {
    color: '#fafafa',
    fontSize: 20,
    fontWeight: '300',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 3,
  },
  featuredCard: {
    marginBottom: 22,
    borderRadius: 18,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 10,
  },
  featuredPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  featuredInner: {
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(165,243,252,0.18)',
  },
  featuredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  featuredDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a5f3fc',
    shadowColor: '#a5f3fc',
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  featuredKicker: {
    color: '#a5f3fc',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  featuredTitle: {
    color: '#f0f9ff',
    fontSize: 19,
    fontWeight: '800',
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  featuredTitleJa: {
    color: 'rgba(240,249,255,0.65)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4,
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  featuredMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  featuredMetaText: {
    color: 'rgba(165,243,252,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },
  featuredCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#a5f3fc',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  featuredCtaText: {
    color: '#0c4a6e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  phraseBookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
  },
  phraseBookBtnPressed: { opacity: 0.8 },
  phraseBookLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phraseBookIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phraseBookTitle: {
    color: '#fde68a',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  phraseBookSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 6,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: '#fafafa',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
});
