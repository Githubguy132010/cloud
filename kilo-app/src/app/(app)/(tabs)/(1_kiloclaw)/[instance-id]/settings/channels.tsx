import { Check, MessageSquare, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { ScreenHeader } from '@/components/screen-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import {
  useKiloClawMutations,
  useKiloClawPairing,
  useKiloClawStatus,
} from '@/lib/hooks/use-kiloclaw';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

const CHANNELS = [
  { key: 'telegramBotToken', label: 'Telegram', description: 'Bot token from @BotFather' },
  {
    key: 'discordBotToken',
    label: 'Discord',
    description: 'Bot token from Discord developer portal',
  },
  { key: 'slackBotToken', label: 'Slack Bot', description: 'Bot OAuth token (xoxb-)' },
  { key: 'slackAppToken', label: 'Slack App', description: 'App-level token (xapp-)' },
] as const;

type ChannelKey = (typeof CHANNELS)[number]['key'];

const CHANNEL_LABELS: Record<string, string> = {
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  github: 'GitHub',
};

function ChannelTokenField({
  label,
  description,
  value,
  onChange,
  onSave,
  onClear,
  isSaving,
}: Readonly<{
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onClear: () => void;
  isSaving: boolean;
}>) {
  const colors = useThemeColors();
  const hasValue = value.trim().length > 0;

  return (
    <View className="gap-2 px-4 py-3">
      <View>
        <Text className="text-sm font-medium">{label}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <TextInput
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          placeholder="Paste token..."
          placeholderTextColor={colors.mutedForeground}
          value={value}
          onChangeText={onChange}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        {hasValue && (
          <Button size="sm" disabled={isSaving} onPress={onSave}>
            <Check size={14} color={colors.primaryForeground} />
          </Button>
        )}
        <Button variant="ghost" size="sm" onPress={onClear}>
          <X size={14} color={colors.mutedForeground} />
        </Button>
      </View>
    </View>
  );
}

export default function ChannelsScreen() {
  const colors = useThemeColors();
  const statusQuery = useKiloClawStatus();
  const pairingQuery = useKiloClawPairing();
  const mutations = useKiloClawMutations();
  const [tokens, setTokens] = useState<Record<string, string>>({});

  const isLoading = statusQuery.isPending;

  if (isLoading) {
    return (
      <View className="flex-1 bg-background">
        <ScreenHeader title="Channels" />
        <Animated.View layout={LinearTransition} className="flex-1 px-4 pt-4 gap-3">
          <Animated.View exiting={FadeOut.duration(150)}>
            <Skeleton className="h-16 w-full rounded-lg" />
          </Animated.View>
        </Animated.View>
      </View>
    );
  }

  const channelCount = statusQuery.data?.channelCount ?? 0;
  const pairingRequests = pairingQuery.data?.requests ?? [];

  function clearTokenFromState(key: ChannelKey) {
    setTokens(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
  }

  function handleSaveToken(key: ChannelKey) {
    const value = (tokens[key] ?? '').trim();
    if (!value) return;
    mutations.patchChannels.mutate(
      { [key]: value },
      {
        onSuccess: () => {
          clearTokenFromState(key);
        },
      }
    );
  }

  function handleClearToken(key: ChannelKey) {
    Alert.alert('Remove Token', 'Clear this channel token? The channel will be disconnected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          clearTokenFromState(key);
          // eslint-disable-next-line unicorn/no-null -- tRPC schema requires null for token removal
          mutations.patchChannels.mutate({ [key]: null });
        },
      },
    ]);
  }

  function handleApprove(channel: string, code: string) {
    const label = CHANNEL_LABELS[channel] ?? channel;
    Alert.alert(
      'Approve Pairing Request',
      `Allow ${label} (code: ${code}) to connect to your instance?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => {
            mutations.approvePairingRequest.mutate({ channel, code });
          },
        },
      ]
    );
  }

  return (
    <Animated.View layout={LinearTransition} className="flex-1 bg-background">
      <ScreenHeader title="Channels" />
      <ScrollView contentContainerClassName="px-0 py-4 gap-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeIn.duration(200)} className="gap-4">
          <View className="px-4">
            <Text className="text-xs text-muted-foreground">
              {channelCount} channel{channelCount === 1 ? '' : 's'} connected. Paste a token and tap
              the checkmark to save, or tap X to remove an existing token.
            </Text>
          </View>

          {/* Channel token fields */}
          <View className="rounded-lg bg-secondary mx-4">
            {CHANNELS.map((ch, i) => (
              <View key={ch.key}>
                {i > 0 && <View className="ml-4 h-px bg-border" />}
                <ChannelTokenField
                  label={ch.label}
                  description={ch.description}
                  value={tokens[ch.key] ?? ''}
                  onChange={v => {
                    setTokens(prev => ({ ...prev, [ch.key]: v }));
                  }}
                  onSave={() => {
                    handleSaveToken(ch.key);
                  }}
                  onClear={() => {
                    handleClearToken(ch.key);
                  }}
                  isSaving={mutations.patchChannels.isPending}
                />
              </View>
            ))}
          </View>

          {/* Pairing requests */}
          {pairingRequests.length > 0 && (
            <View className="gap-3 px-4">
              <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Pending Pairing Requests
              </Text>
              <View className="rounded-lg bg-secondary overflow-hidden">
                {pairingRequests.map((request, index) => (
                  <View key={`${request.channel}-${request.code}`}>
                    {index > 0 && <View className="ml-4 h-px bg-border" />}
                    <View className="flex-row items-center gap-3 px-4 py-3">
                      <MessageSquare size={18} color={colors.foreground} />
                      <View className="flex-1 gap-0.5">
                        <Text className="text-sm font-medium">
                          {CHANNEL_LABELS[request.channel] ?? request.channel}
                        </Text>
                        <Text variant="muted" className="text-xs">
                          Code: {request.code}
                        </Text>
                      </View>
                      <Button
                        size="sm"
                        onPress={() => {
                          handleApprove(request.channel, request.code);
                        }}
                      >
                        <Text>Approve</Text>
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}
