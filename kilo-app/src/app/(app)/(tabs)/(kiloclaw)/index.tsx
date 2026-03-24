import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function KiloClawInstanceList() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">KiloClaw</Text>
      <Text variant="muted">Your instances will appear here</Text>
    </View>
  );
}
