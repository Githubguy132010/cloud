import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/lib/auth/auth-context';
import { useDeviceAuth } from '@/lib/auth/use-device-auth';
import { View } from '@/tw';

export function LoginScreen() {
  const { signIn } = useAuth();
  const { status, token, code, error, start, cancel, copyCode } = useDeviceAuth();

  useEffect(() => {
    if (status === 'approved' && token) {
      void signIn(token);
    }
  }, [status, token, signIn]);

  return (
    <View className="flex-1 items-center justify-center gap-8 bg-background px-6">
      <View className="items-center gap-3">
        <Text variant="h1">Kilo</Text>
        <Text variant="muted" className="text-lg">
          Sign in to continue
        </Text>
      </View>

      {status === 'idle' && (
        <View className="w-full max-w-sm gap-3">
          <Button
            size="lg"
            onPress={() => {
              void start();
            }}
          >
            <Text>Sign In</Text>
          </Button>
        </View>
      )}

      {status === 'pending' && code && (
        <View className="w-full max-w-sm items-center gap-4">
          <Text variant="muted">Your sign-in code:</Text>
          <Text variant="h2" className="border-b-0 pb-0 tracking-widest">
            {code}
          </Text>
          <Button
            variant="outline"
            size="sm"
            onPress={() => {
              void copyCode();
            }}
          >
            <Text>Copy Code</Text>
          </Button>
          <Text variant="muted" className="text-center text-xs">
            A browser window has been opened. Sign in there to authorize this device.
          </Text>
          <Button variant="ghost" onPress={cancel}>
            <Text>Cancel</Text>
          </Button>
        </View>
      )}

      {status === 'pending' && !code && (
        <View className="items-center gap-2">
          <Text variant="muted">Starting sign in…</Text>
        </View>
      )}

      {(status === 'denied' || status === 'expired' || status === 'error') && (
        <View className="w-full max-w-sm items-center gap-4">
          <Text className="text-sm text-destructive">{error}</Text>
          <Button
            size="lg"
            onPress={() => {
              void start();
            }}
          >
            <Text>Try Again</Text>
          </Button>
        </View>
      )}
    </View>
  );
}
