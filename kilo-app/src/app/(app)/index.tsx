import { Pressable, ScrollView, Text, View } from '@/tw';

export default function HomeScreen() {
  return (
    <ScrollView className="flex-1 bg-white dark:bg-neutral-950" contentContainerClassName="flex-1">
      <View className="flex-1 items-center justify-center gap-8 px-6">
        <View className="items-center gap-3">
          <Text className="text-4xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Kilo
          </Text>
          <Text className="text-lg text-neutral-500 dark:text-neutral-400">
            Powered by NativeWind
          </Text>
        </View>

        <View className="w-full max-w-sm gap-3">
          <Pressable className="items-center rounded-xl bg-neutral-900 px-6 py-4 active:opacity-80 dark:bg-white">
            <Text className="text-base font-semibold text-white dark:text-neutral-900">
              Get Started
            </Text>
          </Pressable>

          <Pressable className="items-center rounded-xl border border-neutral-200 px-6 py-4 active:opacity-80 dark:border-neutral-800">
            <Text className="text-base font-semibold text-neutral-900 dark:text-white">
              Learn More
            </Text>
          </Pressable>
        </View>

        <View className="flex-row items-center gap-4">
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text className="text-sm text-neutral-400 dark:text-neutral-500">
            Tailwind CSS v4 + React Native
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
