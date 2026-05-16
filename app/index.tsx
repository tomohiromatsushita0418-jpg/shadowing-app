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
              colors={['#1e1b4b', '#0f1f38', '#0f0f14']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.brandRow}>
                <View style={styles.logoMark}>
                  <Ionicons name="mic" size={20} color="#60a5fa" />
                </View>
                <Text style={styles.brandName}>ECHO</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.heroHeadline}>
                Master English by{'\n'}speaking it back.
              </Text>
              <Text style={styles.heroSub}>
                TOEIC 700 → 990 シャドーイング
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
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 26,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    marginBottom: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
  },
  logoMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    color: '#fafafa',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
  },
  proBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  proBadgeText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroHeadline: {
    color: '#fafafa',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 22,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statNum: {
    color: '#fafafa',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
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
