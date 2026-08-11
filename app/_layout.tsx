import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Ensure Home (index) is always the stack anchor — even when the app is
// opened directly via a deep link to /topic/<id> (e.g. from the notification
// email). Without this, a deep-linked topic has no screen beneath it and the
// back button cannot return to the list.
export const unstable_settings = {
  initialRouteName: 'index',
};

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
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="folder/[num]"
          options={{ title: 'Stage', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="phrasebook"
          options={{ title: '熟語帳', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="composition"
          options={{ title: '瞬間英作文', headerBackTitle: 'Home' }}
        />
        <Stack.Screen
          name="topic/[id]"
          options={{ title: '', headerBackTitle: 'Back' }}
        />
      </Stack>
    </>
  );
}
