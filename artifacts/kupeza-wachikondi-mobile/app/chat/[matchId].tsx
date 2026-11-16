import { Feather } from '@expo/vector-icons';
import {
  createConnectionMessage,
  getConnectionMessagesAfterCursor,
  getGetConnectionMessagesQueryKey,
  useGetConnection,
  useGetConnectionMessages,
  type ConnectionMessage,
  type ConnectionMessagePage,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams } from 'expo-router';
import { useApp, getProfile, ChatMessage } from '@/components/AppProvider';
import { getStoredSessionToken } from '@/components/AuthProvider';
import { Avatar, Header, Shell } from '@/components/ui';
import { UnlockChatButton } from '@/components/UnlockChatButton';
import { API_BASE_URL, USE_LIVE_API } from '@/constants/config';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { matches, chats, sendMessage } = useApp();
  const queryClient = useQueryClient();
  const connectionQuery = useGetConnection(matchId ?? '', {
    query: { enabled: USE_LIVE_API && Boolean(matchId) },
  });
  const chatEnabled = Boolean(
    USE_LIVE_API && matchId && connectionQuery.data?.chatEnabledAt,
  );
  const [socketConnected, setSocketConnected] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesQuery = useGetConnectionMessages(matchId ?? '', {
    query: {
      enabled: chatEnabled,
      refetchInterval: chatEnabled && !socketConnected ? 5_000 : false,
    },
  });
  const [text, setText] = useState('');
  const match = matches.find((item) => item.id === matchId);
  const profile = match ? getProfile(match.profileId) : undefined;
  const messages = match ? chats[match.id] ?? [] : [];
  const input = useRef<TextInputInstance>(null);
  const conversationId = matchId ?? '';

  const appendMessage = useCallback(
    (message: ConnectionMessage) => {
      queryClient.setQueryData<ConnectionMessagePage>(
        getGetConnectionMessagesQueryKey(conversationId),
        (current) => {
          if (!current || current.items.some((item) => item.id === message.id)) {
            return current;
          }
          return {
            ...current,
            items: [...current.items, message]
              .sort(
                (left, right) =>
                  new Date(right.createdAt).getTime() -
                  new Date(left.createdAt).getTime(),
              )
              .slice(0, 30),
          };
        },
      );
    },
    [conversationId, queryClient],
  );

  useEffect(() => {
    if (!chatEnabled || !conversationId || !API_BASE_URL) {
      setSocketConnected(false);
      return;
    }

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let retryDelay = 1_000;

    const connect = async () => {
      const token = await getStoredSessionToken();
      if (!active || !token) return;

      const endpoint = new URL('/ws', API_BASE_URL);
      endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
      endpoint.searchParams.set('token', token);
      endpoint.searchParams.set('connectionId', conversationId);
      socket = new WebSocket(endpoint.toString());

      socket.onopen = () => {
        retryDelay = 1_000;
        setSocketConnected(true);
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(String(event.data)) as {
            type?: string;
            message?: ConnectionMessage;
          };
          if (frame.type === 'message' && frame.message) {
            appendMessage(frame.message);
          }
        } catch {
          // Ignore malformed frames; HTTP polling remains available.
        }
      };
      socket.onerror = () => setSocketConnected(false);
      socket.onclose = () => {
        setSocketConnected(false);
        if (active) {
          reconnectTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            void connect();
          }, retryDelay);
        }
      };
    };

    void connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
      setSocketConnected(false);
    };
  }, [appendMessage, chatEnabled, conversationId]);

  const sendLiveMessage = async () => {
    const body = text.trim();
    if (!body || sending || !conversationId) return;

    setSending(true);
    setSendError(null);
    try {
      const result = await createConnectionMessage(conversationId, {
        body,
        clientMessageId: createClientMessageId(),
      });
      appendMessage(result);
      setText('');
      Keyboard.dismiss();
    } catch {
      setSendError('Your message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const loadOlderMessages = async () => {
    const cursor = messagesQuery.data?.nextCursor;
    if (!cursor || loadingOlder || !conversationId) return;
    setLoadingOlder(true);
    try {
      const older = await getConnectionMessagesAfterCursor(conversationId, cursor);
      queryClient.setQueryData<ConnectionMessagePage>(
        getGetConnectionMessagesQueryKey(conversationId),
        (current) => {
          if (!current) return older;
          const byId = new Map(
            [...current.items, ...older.items].map((message) => [
              message.id,
              message,
            ]),
          );
          return {
            items: [...byId.values()].sort(
              (left, right) =>
                new Date(right.createdAt).getTime() -
                new Date(left.createdAt).getTime(),
            ),
            nextCursor: older.nextCursor,
          };
        },
      );
    } catch {
      setSendError('Earlier messages could not be loaded.');
    } finally {
      setLoadingOlder(false);
    }
  };

  if (USE_LIVE_API) {
    if (connectionQuery.isPending) {
      return (
        <Shell>
          <Header title="Messages" back />
          <View style={{ minHeight: 260, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </Shell>
      );
    }
    if (connectionQuery.isError || !connectionQuery.data) {
      return (
        <Shell>
          <Header title="Messages" back />
          <Text style={{ color: colors.mutedForeground, padding: 20, lineHeight: 21 }}>
            This conversation couldn’t be loaded. Check your connection and try again.
          </Text>
        </Shell>
      );
    }

    const connection = connectionQuery.data;
    const otherProfile = connection.otherProfile;
    const title = otherProfile?.displayName ?? 'Conversation';
    if (!connection.chatEnabledAt) {
      return (
        <Shell>
          <Header title={title} back />
          <View style={{ minHeight: 320, alignItems: 'center', justifyContent: 'center', padding: 26, gap: 12 }}>
            <Feather name="lock" size={24} color={colors.primary} />
            <Text style={{ color: colors.foreground, fontFamily: 'Inter_700Bold', fontSize: 20, textAlign: 'center' }}>
              Chat is locked
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
              Complete checkout to start messaging.
            </Text>
            <UnlockChatButton
              connectionId={connection.id}
              chatEnabled={false}
            />
          </View>
        </Shell>
      );
    }

    return (
      <Shell>
        <Header title={title} back />
        <KeyboardAvoidingView style={styles.root} behavior="padding">
          {messagesQuery.data?.nextCursor ? (
            <Pressable
              accessibilityRole="button"
              disabled={loadingOlder}
              onPress={() => void loadOlderMessages()}
              style={{ alignItems: 'center', paddingVertical: 10 }}
            >
              <Text style={{ color: colors.primary, fontSize: 13 }}>
                {loadingOlder ? 'Loading…' : 'Load earlier messages'}
              </Text>
            </Pressable>
          ) : null}
          <FlatList
            data={messagesQuery.data?.items ?? []}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={{ color: colors.mutedForeground, textAlign: 'center', padding: 24 }}>
                No messages yet. Start the conversation.
              </Text>
            }
            renderItem={({ item }) => {
              const outgoing = item.senderUserId !== otherProfile?.userId;
              return (
                <View
                  style={[
                    styles.bubble,
                    outgoing
                      ? styles.outgoing
                      : [styles.incoming, { backgroundColor: colors.card }],
                  ]}
                >
                  <Text
                    style={{
                      color: outgoing ? '#fff' : colors.foreground,
                      lineHeight: 20,
                    }}
                  >
                    {item.body}
                  </Text>
                  <Text
                    style={{
                      color: outgoing ? 'rgba(255,255,255,0.65)' : colors.mutedForeground,
                      fontSize: 10,
                      marginTop: 4,
                    }}
                  >
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />
          {sendError ? (
            <Text style={{ color: colors.mutedForeground, paddingHorizontal: 18, paddingBottom: 8 }}>
              {sendError}
            </Text>
          ) : null}
          <View
            style={[
              styles.composer,
              {
                paddingBottom: Math.max(insets.bottom, 8),
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Write a thoughtful message…"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.field, { color: colors.foreground }]}
              onSubmitEditing={() => void sendLiveMessage()}
              returnKeyType="send"
              maxLength={2000}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={sending || !text.trim()}
              onPress={() => void sendLiveMessage()}
              style={[
                styles.send,
                { backgroundColor: colors.primary, opacity: sending || !text.trim() ? 0.55 : 1 },
              ]}
            >
              <Feather name="send" size={17} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Shell>
    );
  }

  if (!profile || !match) return <View />;
  const send = () => { sendMessage(match.id, text); setText(''); Keyboard.dismiss(); };
  return <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior="padding"><Header title={profile.name} back /><FlatList data={[...messages].reverse()} inverted keyExtractor={(item) => item.id} contentContainerStyle={styles.list} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" renderItem={({ item }: { item: ChatMessage }) => <View style={[styles.bubble, item.sender === 'me' ? styles.outgoing : [styles.incoming, { backgroundColor: colors.card }]]}><Text style={{ color: item.sender === 'me' ? '#fff' : colors.foreground, lineHeight: 20 }}>{item.text}</Text><Text style={{ color: item.sender === 'me' ? 'rgba(255,255,255,0.65)' : colors.mutedForeground, fontSize: 10, marginTop: 4 }}>{item.time}</Text></View>} ListHeaderComponent={<View style={{ height: 30 }} />} /><View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.card, borderColor: colors.border }]}><TextInput ref={input} value={text} onChangeText={setText} placeholder="Write a thoughtful message…" placeholderTextColor={colors.mutedForeground} style={[styles.field, { color: colors.foreground }]} onSubmitEditing={send} returnKeyType="send" /><Pressable onPress={send} style={[styles.send, { backgroundColor: colors.primary }]}><Feather name="send" size={17} color="#fff" /></Pressable></View></KeyboardAvoidingView>;
}

function createClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
const styles = StyleSheet.create({ root: { flex: 1 }, list: { paddingHorizontal: 18, paddingBottom: 10 }, bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: 10 }, incoming: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 }, outgoing: { alignSelf: 'flex-end', backgroundColor: '#bd5578', borderBottomRightRadius: 5 }, composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 }, field: { flex: 1, minHeight: 44, fontSize: 14, paddingHorizontal: 8 }, send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });