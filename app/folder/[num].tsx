import React, { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { topics } from '../../data/topics';
import TopicCard from '../../components/TopicCard';

const FOLDER_SIZE = 10;

export default function FolderScreen() {
  const { num } = useLocalSearchParams<{ num: string }>();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const folderNumber = Math.max(1, parseInt(num ?? '1', 10));
  const startIdx = (folderNumber - 1) * FOLDER_SIZE;
  const endIdx = startIdx + FOLDER_SIZE;

  const slice = useMemo(
    () =>
      topics.slice(startIdx, endIdx).map((t, i) => ({
        topic: t,
        absoluteIndex: startIdx + i,
      })),
    [startIdx, endIdx]
  );

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ title: `セット ${folderNumber}` });
    }, [navigation, folderNumber])
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={slice}
        keyExtractor={(item) => item.topic.id}
        renderItem={({ item }) => (
          <TopicCard topic={item.topic} index={item.absoluteIndex} />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.empty}>このセットにはまだトピックがありません。</Text>
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
  list: { paddingBottom: 32, paddingTop: 8 },
  empty: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
});
