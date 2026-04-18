import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="list/[id]" />
      <Stack.Screen
        name="task/[taskUrl]"
        options={{ presentation: 'card', animation: 'slide_from_right' }}
      />
    </Stack>
  );
}
