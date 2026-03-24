import { useLocalSearchParams } from 'expo-router';
import { MessageSquare } from 'lucide-react-native';
import { View } from 'react-native';

import { EmptyState } from '@/components/empty-state';

export default function ChatScreen() {
  const { 'instance-id': instanceId } = useLocalSearchParams<{ 'instance-id': string }>();

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <EmptyState
        icon={MessageSquare}
        title="Chat coming soon"
        description={`Instance: ${instanceId}`}
      />
    </View>
  );
}
