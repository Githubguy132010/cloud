import { useEffect, useState } from 'react';
import { Keyboard, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { SettingsCard } from '@/components/kiloclaw/settings-card';
import { ScreenHeader } from '@/components/screen-header';
import { Skeleton } from '@/components/ui/skeleton';
import { useKiloClawMutations, useKiloClawSecretCatalog } from '@/lib/hooks/use-kiloclaw';

export default function SecretsScreen() {
  const mutations = useKiloClawMutations();
  const catalogQuery = useKiloClawSecretCatalog();
  const isLoading = catalogQuery.isPending;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardWillShow', e => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Secrets" />
      <View className="flex-1">
        <ScrollView
          contentContainerClassName="pt-4 gap-3"
          contentInset={{ bottom: keyboardHeight > 0 ? keyboardHeight + 10 : 0 }}
          scrollIndicatorInsets={{ bottom: keyboardHeight > 0 ? keyboardHeight + 10 : 0 }}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <Animated.View exiting={FadeOut.duration(150)} className="gap-3 px-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-24 w-full rounded-lg" />
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(200)} className="gap-3">
              {catalogQuery.data?.map(secret => (
                <SettingsCard
                  key={secret.id}
                  item={secret}
                  mutations={mutations}
                  removeAlertTitle="Remove Secret"
                  removeAlertMessage={`Remove ${secret.label}? This tool will lose access to its credentials.`}
                  successMessage={`${secret.label} saved`}
                />
              ))}
            </Animated.View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}
