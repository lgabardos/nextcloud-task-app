import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { loadCredentials } from '../src/services/authService';
import { useAppStore } from '../src/store/appStore';

export default function RootLayout() {
  const setCredentials = useAppStore((s) => s.setCredentials);

  useEffect(() => {
    async function checkAuth() {
      const creds = await loadCredentials();
      if (creds) {
        setCredentials(creds);
        router.replace('/(app)/home');
      }
    }
    checkAuth();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(app)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
