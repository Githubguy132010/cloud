import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: 'hsl(0, 0%, 98%)',
        tabBarInactiveTintColor: 'hsl(0, 0%, 45%)',
        tabBarStyle: {
          backgroundColor: 'hsl(0, 0%, 3.9%)',
          borderTopColor: 'hsl(0, 0%, 14.9%)',
        },
      }}
    >
      <Tabs.Screen
        name="(kiloclaw)"
        options={{
          title: 'KiloClaw',
          tabBarIcon: ({ color }) => (
            <Text className="text-xl" style={{ color }}>
              💬
            </Text>
          ),
        }}
      />
      <Tabs.Screen
        name="(agents)"
        options={{
          title: 'Agents',
          tabBarIcon: ({ color }) => (
            <Text className="text-xl" style={{ color }}>
              🤖
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}
