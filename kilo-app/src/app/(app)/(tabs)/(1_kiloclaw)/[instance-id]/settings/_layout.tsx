import { Stack } from 'expo-router';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function SettingsLayout() {
  const colors = useThemeColors();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.foreground,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="env-vars" options={{ title: 'Environment Variables' }} />
      <Stack.Screen name="secrets" options={{ title: 'Secrets' }} />
      <Stack.Screen name="channels" options={{ title: 'Channels' }} />
      <Stack.Screen name="exec-policy" options={{ title: 'Execution Policy' }} />
      <Stack.Screen name="version-pin" options={{ title: 'Version Pinning' }} />
      <Stack.Screen name="device-pairing" options={{ title: 'Device Pairing' }} />
      <Stack.Screen name="google" options={{ title: 'Google Account' }} />
    </Stack>
  );
}
