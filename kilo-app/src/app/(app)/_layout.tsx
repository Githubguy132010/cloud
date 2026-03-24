import { Stack, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export default function AppLayout() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="profile"
        options={{
          presentation: 'modal',
          headerShown: true,
          headerTitle: 'Profile',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
          headerRight: () => (
            <Pressable
              onPress={() => {
                router.back();
              }}
              accessibilityRole="button"
              accessibilityLabel="Close profile"
              className="p-2"
            >
              <X size={20} color={colors.mutedForeground} />
            </Pressable>
          ),
        }}
      />
    </Stack>
  );
}
