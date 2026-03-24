import { useNavigation } from 'expo-router';
import { Server } from 'lucide-react-native';
import { useLayoutEffect } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';
import { ProfileAvatarButton } from '@/components/profile-avatar-button';

export default function KiloClawInstanceList() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'KiloClaw',
      headerRight: () => <ProfileAvatarButton />,
    });
  }, [navigation]);

  return (
    <View className="flex-1 items-center justify-center bg-background">
      <EmptyState
        icon={Server}
        title="No instances yet"
        description="Your KiloClaw instances will appear here"
      />
    </View>
  );
}
