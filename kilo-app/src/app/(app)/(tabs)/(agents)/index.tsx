import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export default function AgentSessionList() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-6">
      <Text variant="h2">Cloud Agents</Text>
      <Text variant="muted">Your agent sessions will appear here</Text>
    </View>
  );
}
