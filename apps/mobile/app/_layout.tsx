import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="library/[id]" options={{ title: 'Sentence Detail' }} />
      <Stack.Screen name="session/index" options={{ title: 'Practice Session' }} />
      <Stack.Screen name="session/summary" options={{ title: 'Session Summary' }} />
      <Stack.Screen name="onboarding" options={{ title: 'Onboarding' }} />
    </Stack>
  );
}
