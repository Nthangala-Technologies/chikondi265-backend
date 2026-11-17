import { Feather } from '@expo/vector-icons';
import type { Connection } from '@workspace/api-client-react';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UnlockChatButton } from '@/components/UnlockChatButton';
import { defaultAvatarForUser } from '@/components/AppProvider';
import { useAuth } from '@/components/AuthProvider';
import { PhotoAvatar } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

type Props = {
  connection: Connection;
  mode: 'matches' | 'messages';
};

export function LiveConnectionCard({ connection, mode }: Props) {
  const colors = useColors();
  const { account } = useAuth();
  const profile = connection.otherProfile;
  const chatEnabled = connection.chatEnabledAt !== null;
  const name = profile?.displayName ?? 'Profile unavailable';
  const messagePreview = connection.lastMessage
    ? connection.lastMessage.senderUserId === account?.userId
      ? `You: ${connection.lastMessage.body}`
      : connection.lastMessage.body
    : null;
  const messageTime = connection.lastMessage
    ? formatLastMessageTime(connection.lastMessage.createdAt)
    : null;

  const content = (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {profile ? (
        <PhotoAvatar
          photo={profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(profile.userId)}
          size={46}
        />
        ) : (
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Feather name="user" size={20} color="#fff" />
        </View>
      )}
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        <View style={styles.previewRow}>
          <Text
            style={[styles.status, { color: colors.mutedForeground }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {mode === 'messages'
              ? chatEnabled
                ? messagePreview ?? 'No messages yet'
                : 'Unlock chat — MWK 5,000'
              : chatEnabled
                ? 'Chat unlocked'
                : 'You matched'}
          </Text>
          {mode === 'messages' && chatEnabled && messageTime ? (
            <Text style={[styles.timestamp, { color: colors.mutedForeground }]}>
              {messageTime}
            </Text>
          ) : null}
        </View>
      </View>
      {mode === 'matches' ? (
        <UnlockChatButton
          connectionId={connection.id}
          chatEnabled={chatEnabled}
          disabled={!profile}
          onOpenChat={() =>
            router.push({
              pathname: '/chat/[matchId]',
              params: { matchId: connection.id },
            })
          }
          testID={`button-chat-${connection.id}`}
          compact
        />
      ) : (
        <Feather name={chatEnabled ? 'chevron-right' : 'lock'} size={18} color={colors.mutedForeground} />
      )}
    </View>
  );

  if (mode === 'matches') return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => profile && router.push({ pathname: '/chat/[matchId]', params: { matchId: connection.id } })}
      disabled={!profile}
      testID={`button-message-${connection.id}`}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    marginBottom: 10,
  },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  status: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17 },
  timestamp: { fontSize: 10, lineHeight: 15 },
});

function formatLastMessageTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const elapsedDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (elapsedDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
