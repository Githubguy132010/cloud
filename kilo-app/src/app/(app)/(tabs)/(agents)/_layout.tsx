import { Stack } from 'expo-router';

export default function AgentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: 'hsl(0, 0%, 3.9%)' },
        headerTintColor: 'hsl(0, 0%, 98%)',
      }}
    />
  );
}
