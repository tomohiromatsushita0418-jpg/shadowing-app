import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { topics, type Topic } from '../data/topics';
import FolderCard from '../components/FolderCard';
import AccountBanner from '../components/AccountBanner';
import Welcome from '../components/Welcome';
import { useProgress } from '../hooks/useProgress';
import { useOnboarding } from '../hooks/useOnboarding';
import { useAccount } from '../lib/account';
import { FREE_PREVIEW_TOPICS } from '../lib/access';

const FOLDER_SIZE = 10;

function latestTopic(): { topic: Topic; index: number } | null {
  if (topics.length === 0) return null;
  return { topic: topics[topics.length - 1], index: topics.length - 1 };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { completedCount, streak } = useProgress();
  const { ready: onbReady, onboarded, complete } = useOnboarding();
  const { session, entitlement, paywallEnabled } = useAccount();
  const isPro = entitlement?.plan === 'pro' && entitlement.active === true;
  // Free tier is Stage 1 (the first FREE_PREVIEW_TOPICS episodes). Any stage that
  // begins past that is locked until the user subscribes. When the paywall is
  // off (pre-launch) nothing is locked.
  const stageLocked = (start: number) => paywallEnabled && !isPro && start > FREE_PREVIEW_TOPICS;

  const folders = useMemo(() => {
    const groups: {
      folderNumber: number;
      start: number;
      end: number;
      count: number;
      topicIds: string[];
    }[] = [];
    const totalFolders = Math.max(1, Math.ceil(topics.length / FOLDER_SIZE));
    for (let i = 0; i < totalFolders; i++) {
      const start = i * FOLDER_SIZE + 1;
      const end = (i + 1) * FOLDER_SIZE;
      const count = Math.max(0, Math.min(topics.length, end) - start + 1);
      const topicIds = topics.slice(i * FOLDER_SIZE, (i + 1) * FOLDER_SIZE).map((t) => t.id);
      groups.push({ folderNumber: i + 1, start, end, count, topicIds });
    }
    return groups;
  }, []);

  const featured = latestTopic();
  const featuredLocked = featured ? stageLocked(featured.index + 1) : false;
  const overallRatio = topics.length > 0 ? completedCount / topics.length : 0;

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
            topicIds={item.topicIds}
            locked={stageLocked(item.start)}
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
              <View style={styles.topBar}>
                <View style={styles.brandRow}>
                  <Text style={styles.brandName}>RESOUND</Text>
                  <Text style={styles.brandSep}>·</Text>
                  <Text style={styles.brandSub}>english studio</Text>
                </View>
                <View style={styles.topIcons}>
                  <Pressable
                    style={styles.iconBtn}
                    onPress={() => router.push('/feedback' as any)}
                    accessibilityLabel="お問い合わせ・ご要望"
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={19} color="#cbd5e1" />
                  </Pressable>
                  <Pressable
                    style={styles.iconBtn}
                    onPress={() => router.push((session ? '/account' : '/login') as any)}
                    accessibilityLabel={session ? 'アカウント' : 'ログイン'}
                  >
                    <Ionicons
                      name={session ? 'person-circle' : 'person-circle-outline'}
                      size={22}
                      color={session ? '#22d3ee' : '#cbd5e1'}
                    />
                  </Pressable>
                </View>
              </View>

              <Text style={styles.heroSub}>
                Shadow it. Rebuild it. Own it.
              </Text>

              {/* Login / subscribe CTA */}
              {!session ? (
                <Pressable style={styles.ctaLogin} onPress={() => router.push('/login' as any)}>
                  <Ionicons name="sparkles" size={15} color="#0b1220" />
                  <Text style={styles.ctaLoginText}>ログイン / 無料で新規登録</Text>
                  <Ionicons name="arrow-forward" size={15} color="#0b1220" />
                </Pressable>
              ) : !isPro ? (
                <Pressable style={styles.ctaSubscribe} onPress={() => router.push('/paywall' as any)}>
                  <Ionicons name="lock-open" size={15} color="#fde68a" />
                  <Text style={styles.ctaSubscribeText}>購読して全エピソード・全機能を開放</Text>
                  <Ionicons name="chevron-forward" size={15} color="#fde68a" />
                </Pressable>
              ) : null}

              {/* Stats row → tap for the full dashboard */}
              <Pressable
                style={styles.statsRow}
                onPress={() => router.push('/dashboard' as any)}
                accessibilityLabel="学習の記録を見る"
              >
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{completedCount}</Text>
                  <Text style={styles.statLabel}>Done</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>
                    {streak > 0 ? `🔥${streak}` : streak}
                  </Text>
                  <Text style={styles.statLabel}>Streak</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statNum}>{topics.length}</Text>
                  <Text style={styles.statLabel}>Topics</Text>
                </View>
              </Pressable>

              {/* Overall progress */}
              <View style={styles.heroProgressRow}>
                <View style={styles.heroProgressTrack}>
                  <View
                    style={[
                      styles.heroProgressFill,
                      { width: `${Math.round(overallRatio * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.heroProgressPct}>
                  {Math.round(overallRatio * 100)}%
                </Text>
              </View>
            </LinearGradient>

            <AccountBanner />

            {/* Today's pick */}
            {featured && (
              <Pressable
                style={({ pressed }) => [
                  styles.featuredCard,
                  pressed && styles.featuredPressed,
                ]}
                onPress={() =>
                  router.push(featuredLocked ? '/paywall' : `/topic/${featured.topic.id}`)
                }
              >
                <LinearGradient
                  colors={featuredLocked ? ['#1e293b', '#0f172a'] : ['#0c4a6e', '#0e7490']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.featuredInner}
                >
                  <View style={styles.featuredHeader}>
                    {featuredLocked ? (
                      <Ionicons name="lock-closed" size={13} color="#fbbf24" />
                    ) : (
                      <View style={styles.featuredDot} />
                    )}
                    <Text style={styles.featuredKicker}>
                      {featuredLocked ? '購読で解放' : 'LATEST DROP'}
                    </Text>
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
                      <Text style={styles.featuredCtaText}>
                        {featuredLocked ? '購読で解放' : 'Start'}
                      </Text>
                      <Ionicons
                        name={featuredLocked ? 'lock-closed' : 'arrow-forward'}
                        size={16}
                        color="#0c4a6e"
                      />
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            )}

            {/* Practice menu — one cohesive set */}
            <View style={styles.menu}>
              {[
                { icon: 'create', tint: '#22d3ee', title: '瞬間英作文', sub: '和文を英語に・AIが添削', to: '/composition' },
                { icon: 'refresh-circle', tint: '#f87171', title: '間違えた問題を復習', sub: '瞬間英作文の「要修正」だけ', to: '/composition?mode=wrong' },
                { icon: 'bookmark', tint: '#fbbf24', title: '熟語帳', sub: '保存した表現を復習・クイズ', to: '/phrasebook' },
                { icon: 'stats-chart', tint: '#34d399', title: '学習の記録', sub: '連続日数・理解度・成果', to: '/dashboard' },
              ].map((m, i, arr) => (
                <Pressable
                  key={m.title}
                  style={({ pressed }) => [
                    styles.menuItem,
                    i < arr.length - 1 && styles.menuItemBorder,
                    pressed && styles.menuItemPressed,
                  ]}
                  onPress={() => router.push(m.to as any)}
                >
                  <View style={[styles.menuIcon, { backgroundColor: m.tint + '1f', borderColor: m.tint + '4d' }]}>
                    <Ionicons name={m.icon as any} size={18} color={m.tint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuTitle}>{m.title}</Text>
                    <Text style={styles.menuSub}>{m.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#475569" />
                </Pressable>
              ))}
            </View>

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
      {onbReady && !onboarded && <Welcome onStart={complete} />}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  ctaLogin: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#22d3ee',
    borderRadius: 999,
    paddingVertical: 12,
    marginBottom: 22,
  },
  ctaLoginText: { color: '#0b1220', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  ctaSubscribe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 999,
    paddingVertical: 12,
    marginBottom: 22,
  },
  ctaSubscribeText: { color: '#fde68a', fontSize: 13.5, fontWeight: '800' },
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
  heroSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
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
  heroProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  heroProgressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  heroProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  heroProgressPct: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '700',
    minWidth: 34,
    textAlign: 'right',
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
  composeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 22,
    marginTop: -8,
  },
  composeIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeTitle: {
    color: '#a5f3fc',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
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
  menu: {
    backgroundColor: '#12151d',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e2533',
    marginBottom: 24,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#1e2533' },
  menuItemPressed: { backgroundColor: 'rgba(255,255,255,0.03)' },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTitle: { color: '#f1f5f9', fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  menuSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
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
