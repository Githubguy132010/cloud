import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { Text, View } from '@/tw';

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [token, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-neutral-950">
        <Text className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
          Kilo
        </Text>
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
      <PortalHost />
    </AuthProvider>
  );
}
