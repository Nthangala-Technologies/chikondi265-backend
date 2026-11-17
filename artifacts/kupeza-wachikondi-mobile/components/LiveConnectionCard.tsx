import { Feather } from '@expo/vector-icons';
import type { Connection } from '@workspace/api-client-react';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { UnlockChatButton } from '@/components/UnlockChatButton';
import { defaultAvatarForUser } from '@/components/AppProvider';
import { PhotoAvatar } from '@/components/ui';
import { useColors } from '@/hooks/useColors';

type Props = {
  connection: Connection;
  mode: 'matches' | 'messages';
};

export function LiveConnectionCard({ connection, mode }: Props) {
  const colors = useColors();
  const profile = connection.otherProfile;
  const chatEnabled = connection.chatEnabledAt !== null;
  const name = profile?.displayName ?? 'Profile unavailable';
  const preview = connection.lastMessage?.body ?? (chatEnabled ? 'Say hi' : 'Unlock chat to start messaging');
  const messageTime = connection.lastMessage
    ? formatLastMessageTime(connection.lastMessage.createdAt)
    : '';
  const openChat = () => {
    if (!profile || !chatEnabled) return;
    router.push({
      pathname: '/chat/[matchId]',
      params: { matchId: connection.id },
    });
  };

  const row = (
    <View style={styles.row}>
      {profile ? (
        <PhotoAvatar
          photo={profile.photoUrl ?? profile.photoId ?? defaultAvatarForUser(profile.userId)}
          size={52}
        />
      ) : (
        <View style={[styles.avatar, { backgroundColor: colors.surfaceVariant }]}>
          <Feather name="user" size={20} color={colors.onSurfaceVariant} />
        </View>
      )}
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: colors.onSurface }]} numberOfLines={1}>
            {name}
          </Text>
          {messageTime ? (
            <Text style={[styles.timestamp, { color: colors.onSurfaceVariant }]}>
              {messageTime}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.preview,
            { color: colors.onSurfaceVariant },
            !connection.lastMessage && styles.emptyPreview,
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {preview}
        </Text>
      </View>
      {mode === 'matches' ? (
        <UnlockChatButton
          connectionId={connection.id}
          chatEnabled={chatEnabled}
          disabled={!profile}
          onOpenChat={openChat}
          testID={`button-chat-${connection.id}`}
          compact
        />
      ) : !chatEnabled ? (
        <Feather name="lock" size={20} color={colors.onSurfaceVariant} />
      ) : null}
      <View style={[styles.divider, { backgroundColor: colors.divider }]} />
    </View>
  );

  if (mode === 'matches') return row;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${preview}`}
      android_ripple={{ color: colors.ripple }}
      onPress={openChat}
      disabled={!profile}
      testID={`button-message-${connection.id}`}
    >
      {row}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
  timestamp: { fontSize: 12 },
  preview: { fontSize: 14, lineHeight: 18 },
  emptyPreview: { fontStyle: 'italic' },
  divider: { position: 'absolute', left: 72, right: 0, bottom: 0, height: 1 },
});

function formatLastMessageTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24 && date.toDateString() === new Date().toDateString()) {
    return `${hours}h`;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (elapsed < 7 * 86_400_000) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
