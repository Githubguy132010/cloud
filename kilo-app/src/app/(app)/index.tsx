import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { ScrollView, View } from '@/tw';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="flex-1">
      <View className="flex-1 items-center justify-center gap-8 px-6">
        <View className="items-center gap-3">
          <Text variant="h1">Kilo</Text>
          <Text variant="muted" className="text-lg">
            Powered by NativeWind
          </Text>
        </View>

        <View className="w-full max-w-sm gap-3">
          <Button size="lg">
            <Text>Get Started</Text>
          </Button>

          <Button variant="outline" size="lg">
            <Text>Learn More</Text>
          </Button>
        </View>

        <View className="flex-row items-center gap-4">
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text variant="muted">Tailwind CSS v4 + React Native</Text>
        </View>
      </View>
    </ScrollView>
  );
}
