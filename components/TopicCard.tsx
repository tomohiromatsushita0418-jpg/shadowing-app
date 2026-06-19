import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Topic } from '../data/topics';
import { useProgress } from '../hooks/useProgress';

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Daily Conversation': { bg: '#2a1a1a', text: '#f87171' },
  Business: { bg: '#1a2744', text: '#60a5fa' },
  'Current Affairs': { bg: '#1a2a1a', text: '#4ade80' },
  'Chemical Industry': { bg: '#102a2a', text: '#22d3ee' },
  // legacy seed categories
  'Business Negotiation': { bg: '#1a2744', text: '#60a5fa' },
  'Academic Research': { bg: '#1a2a1a', text: '#4ade80' },
  Technology: { bg: '#1f1a2e', text: '#a78bfa' },
  Medical: { bg: '#2a1a1a', text: '#f87171' },
  Legal: { bg: '#2a2410', text: '#fbbf24' },
};

interface Props {
  topic: Topic;
  index: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

export default function TopicCard({ topic, index }: Props) {
  const router = useRouter();
  const { isComplete } = useProgress();
  const colors = CATEGORY_COLORS[topic.category] ?? { bg: '#1e293b', text: '#94a3b8' };
  const done = isComplete(topic.id);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        done && styles.cardDone,
        pressed && styles.pressed,
      ]}
      onPress={() => router.push(`/topic/${topic.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`Open topic: ${topic.title}`}
    >
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.badgeText, { color: colors.text }]}>
            {topic.category}
          </Text>
        </View>
        {done ? (
          <View style={styles.doneBadge}>
            <Ionicons name="checkmark-circle" size={16} color="#34d399" />
            <Text style={styles.doneText}>完了</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={16} color="#475569" />
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        <Text style={styles.titleNumber}>{index + 1}. </Text>
        {topic.title}
      </Text>
      {topic.titleJa && (
        <Text style={styles.titleJa} numberOfLines={2}>
          {topic.titleJa}
        </Text>
      )}

      <View style={styles.footer}>
        <Ionicons name="mic-outline" size={14} color="#64748b" />
        <Text style={styles.meta}>{topic.sentences.length} sentences</Text>
        <Ionicons name="time-outline" size={14} color="#64748b" style={styles.timeIcon} />
        <Text style={styles.meta}>~3 min</Text>
        {topic.createdAt && (
          <>
            <Ionicons
              name="calendar-outline"
              size={14}
              color="#64748b"
              style={styles.timeIcon}
            />
            <Text style={styles.meta}>{formatDate(topic.createdAt)}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#161b27',
    borderRadius: 14,
    padding: 16,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#1e2d45',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  cardDone: {
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: '#141d1a',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  doneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  doneText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  title: {
    color: '#e2e8f0',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 4,
  },
  titleNumber: {
    color: '#e2e8f0',
    fontWeight: '800',
  },
  titleJa: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    marginLeft: 2,
  },
  timeIcon: {
    marginLeft: 10,
  },
});
