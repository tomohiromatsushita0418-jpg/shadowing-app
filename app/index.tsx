import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { topics } from '../data/topics';
import FolderCard from '../components/FolderCard';

const FOLDER_SIZE = 10;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();

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

  return (
    <View style={styles.container}>
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
  list: { paddingBottom: 32 },
});
