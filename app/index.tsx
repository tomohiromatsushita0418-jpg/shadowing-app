import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { topics } from '../data/topics';
import TopicCard from '../components/TopicCard';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <TopicCard topic={item} index={index} />}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <Text style={styles.subtitle}>
            TOEIC 700→990 Level Shadowing Practice
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f14',
    paddingHorizontal: 16,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  list: {
    paddingBottom: 32,
  },
});
