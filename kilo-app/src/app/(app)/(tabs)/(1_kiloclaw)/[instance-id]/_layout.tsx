import { Stack } from 'expo-router';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function InstanceLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Chat' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Stack.Screen name="billing" options={{ title: 'Billing' }} />
      <Stack.Screen name="changelog" options={{ title: "What's New" }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
    </Stack>
  );
}
