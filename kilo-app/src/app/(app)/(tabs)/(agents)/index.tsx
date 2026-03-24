import { useNavigation } from 'expo-router';
import { Bot } from 'lucide-react-native';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ProfileAvatarButton } from '@/components/profile-avatar-button';

export default function AgentSessionList() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Agents',
      headerRight: () => <ProfileAvatarButton />,
    });
  }, [navigation]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <EmptyState
        icon={Bot}
        title="No sessions yet"
        description="Your agent sessions will appear here"
      />
    </View>
  );
}
