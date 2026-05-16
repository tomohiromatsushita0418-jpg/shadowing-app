import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0f0f14' },
          headerTintColor: '#e2e8f0',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#0f0f14' },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Shadowing App' }}
        />
        <Stack.Screen
          name="topic/[id]"
          options={{ title: '', headerBackTitle: 'Topics' }}
        />
      </Stack>
    </>
  );
}
