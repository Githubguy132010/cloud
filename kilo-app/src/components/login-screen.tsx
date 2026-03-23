import { useEffect } from 'react';

import { useAuth } from '@/lib/auth/auth-context';
import { useDeviceAuth } from '@/lib/auth/use-device-auth';
import { Pressable, ScrollView, Text, View } from '@/tw';

export function LoginScreen() {
  const { signIn } = useAuth();
  const { status, token, code, error, start, cancel, copyCode } = useDeviceAuth();

  useEffect(() => {
    if (status === 'approved' && token) {
      void signIn(token);
    }
  }, [status, token, signIn]);

  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="flex-1">
      <View className="flex-1 items-center justify-center gap-8 px-6">
        <View className="items-center gap-3">
          <Text className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Kilo
          </Text>
          <Text className="text-lg text-neutral-500 dark:text-neutral-400">
            Sign in to continue
          </Text>
        </View>

        {status === 'idle' && (
          <View className="w-full max-w-sm gap-3">
            <Pressable
              className="items-center rounded-xl bg-neutral-900 px-6 py-4 active:opacity-80 dark:bg-white"
              onPress={() => {
                void start();
              }}
            >
              <Text className="text-base font-semibold text-white dark:text-neutral-900">
                Sign In
              </Text>
            </Pressable>
          </View>
        )}

        {status === 'pending' && code && (
          <View className="w-full max-w-sm items-center gap-4">
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Your sign-in code:
            </Text>
            <Text className="text-3xl font-bold tracking-widest text-neutral-900 dark:text-white">
              {code}
            </Text>
            <Pressable
              className="rounded-lg border border-neutral-200 px-4 py-2 active:opacity-80 dark:border-neutral-800"
              onPress={() => {
                void copyCode();
              }}
            >
              <Text className="text-sm text-neutral-600 dark:text-neutral-400">Copy Code</Text>
            </Pressable>
            <Text className="text-center text-xs text-neutral-400 dark:text-neutral-500">
              A browser window has been opened. Sign in there to authorize this device.
            </Text>
            <Pressable onPress={cancel}>
              <Text className="text-sm text-neutral-400 dark:text-neutral-500">Cancel</Text>
            </Pressable>
          </View>
        )}

        {status === 'pending' && !code && (
          <View className="items-center gap-2">
            <Text className="text-sm text-neutral-500 dark:text-neutral-400">
              Starting sign in…
            </Text>
          </View>
        )}

        {(status === 'denied' || status === 'expired' || status === 'error') && (
          <View className="w-full max-w-sm items-center gap-4">
            <Text className="text-sm text-red-500">{error}</Text>
            <Pressable
              className="items-center rounded-xl bg-neutral-900 px-6 py-4 active:opacity-80 dark:bg-white"
              onPress={() => {
                void start();
              }}
            >
              <Text className="text-base font-semibold text-white dark:text-neutral-900">
                Try Again
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
