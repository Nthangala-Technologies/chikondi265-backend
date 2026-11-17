import { Feather } from '@expo/vector-icons';
import {
  createConnectionMessage,
  getConnectionMessagesAfterCursor,
  getGetConnectionMessagesQueryKey,
  useClearConnectionMessages,
  useCreateBlock,
  useDeleteConnectionMessage,
  useEditConnectionMessage,
  useGetConnection,
  useGetConnectionMessages,
  type ConnectionMessage,
  type ConnectionMessagePage,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as ScreenCapture from 'expo-screen-capture';
import { ActivityIndicator, Alert, FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, getProfile, ChatMessage } from '@/components/AppProvider';
import { getStoredSessionToken, useAuth } from '@/components/AuthProvider';
import { friendlyApiError, useErrorModal } from '@/components/ErrorModal';
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
  const { account } = useAuth();
  const { showError } = useErrorModal();
  const queryClient = useQueryClient();
  const clearMessagesMutation = useClearConnectionMessages();
  const deleteMessageMutation = useDeleteConnectionMessage();
  const editMessageMutation = useEditConnectionMessage();
  const blockMutation = useCreateBlock();
  const connectionQuery = useGetConnection(matchId ?? '', {
    query: { enabled: USE_LIVE_API && Boolean(matchId) },
  });
  const chatEnabled = Boolean(
    USE_LIVE_API && matchId && connectionQuery.data?.chatEnabledAt,
  );
  const [socketFallbackActive, setSocketFallbackActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ConnectionMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const messagesQuery = useGetConnectionMessages(matchId ?? '', {
    query: {
      enabled: chatEnabled,
      refetchInterval: chatEnabled && socketFallbackActive ? 5_000 : false,
    },
  });
  const [text, setText] = useState('');
  const match = matches.find((item) => item.id === matchId);
  const profile = match ? getProfile(match.profileId) : undefined;
  const messages = match ? chats[match.id] ?? [] : [];
  const input = useRef<TextInputInstance>(null);
  const conversationId = matchId ?? '';
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), 2600);
  }, []);

  const removeMessageFromCache = useCallback(
    (messageId: string) => {
      queryClient.setQueryData<ConnectionMessagePage>(
        getGetConnectionMessagesQueryKey(conversationId),
        (current) =>
          current
            ? { ...current, items: current.items.filter((item) => item.id !== messageId) }
            : current,
      );
    },
    [conversationId, queryClient],
  );

  const clearMessagesFromCache = useCallback(() => {
    queryClient.setQueryData<ConnectionMessagePage>(
      getGetConnectionMessagesQueryKey(conversationId),
      { items: [], nextCursor: null },
    );
  }, [conversationId, queryClient]);

  const refreshChatData = useCallback(() => {
    void queryClient.invalidateQueries({ refetchType: 'active' });
  }, [queryClient]);

  const appendMessage = useCallback(
    (message: ConnectionMessage) => {
      queryClient.setQueryData<ConnectionMessagePage>(
        getGetConnectionMessagesQueryKey(conversationId),
        (current) => {
          const items = current?.items ?? [];
          const existingIndex = items.findIndex(
            (item) =>
              item.id === message.id ||
              item.clientMessageId === message.clientMessageId,
          );
          const nextItems =
            existingIndex >= 0
              ? items.map((item, index) =>
                  index === existingIndex ? message : item,
                )
              : [...items, message];
          return {
            nextCursor: current?.nextCursor ?? null,
            items: nextItems
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
    if (Platform.OS !== 'android') return;
    void ScreenCapture.preventScreenCaptureAsync('private-chat').catch(() => undefined);
    return () => {
      void ScreenCapture.allowScreenCaptureAsync('private-chat').catch(() => undefined);
    };
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const performDelete = useCallback(
    async (message: ConnectionMessage, scope: 'me' | 'everyone') => {
      if (Date.now() - new Date(message.createdAt).getTime() > 2 * 60 * 60 * 1000) {
        showToast('Messages older than 2 hours cannot be deleted.');
        return;
      }
      try {
        await deleteMessageMutation.mutateAsync({
          messageId: message.id,
          data: { scope },
        });
        removeMessageFromCache(message.id);
        refreshChatData();
      } catch (error) {
        showError(
          friendlyApiError(error, 'We couldn’t delete this message. Check your connection and try again.'),
          'Message not deleted',
        );
      }
    },
    [deleteMessageMutation, refreshChatData, removeMessageFromCache, showError, showToast],
  );

  const showMessageActions = useCallback(
    (message: ConnectionMessage) => {
      if (Date.now() - new Date(message.createdAt).getTime() > 2 * 60 * 60 * 1000) {
        showToast('Messages older than 2 hours cannot be deleted.');
        return;
      }
      const isSender = message.senderUserId === account?.userId;
      const actions = [
        ...(isSender
          ? [
              {
                text: 'Edit message',
                onPress: () => {
                  setEditingMessage(message);
                  setEditDraft(message.body);
                },
              },
            ]
          : []),
        {
          text: 'Delete for me',
          style: 'destructive' as const,
          onPress: () => void performDelete(message, 'me'),
        },
        ...(isSender
          ? [
              {
                text: 'Delete for everyone',
                style: 'destructive' as const,
                onPress: () => void performDelete(message, 'everyone'),
              },
            ]
          : []),
        { text: 'Cancel', style: 'cancel' as const },
      ];
      Alert.alert('Message options', 'Choose an action for this message.', actions);
    },
    [account?.userId, performDelete, showToast],
  );

  const performClear = useCallback(
    async (scope: 'me' | 'everyone') => {
      if (!conversationId) return;
      try {
        await clearMessagesMutation.mutateAsync({
          id: conversationId,
          data: { scope },
        });
        clearMessagesFromCache();
        refreshChatData();
      } catch (error) {
        showError(
          friendlyApiError(error, 'We couldn’t clear this chat. Check your connection and try again.'),
          'Chat not cleared',
        );
      }
    },
    [clearMessagesMutation, clearMessagesFromCache, conversationId, refreshChatData, showError],
  );

  const confirmClearChat = useCallback(() => {
    Alert.alert(
      'Clear chat?',
      'Choose whether to remove this chat from your history or for both participants.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear for me',
          style: 'destructive',
          onPress: () => void performClear('me'),
        },
        {
          text: 'Clear for everyone',
          style: 'destructive',
          onPress: () => void performClear('everyone'),
        },
      ],
    );
  }, [performClear]);

  const blockOtherUser = useCallback(() => {
    const otherUserId = connectionQuery.data?.otherProfile?.userId;
    if (!otherUserId) return;
    Alert.alert(
      'Block this person?',
      'You will no longer see each other in discovery or be able to use this chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block user',
          style: 'destructive',
          onPress: () => {
            void blockMutation
              .mutateAsync({ data: { blockedUserId: otherUserId } })
              .then(() => {
                refreshChatData();
                router.back();
              })
              .catch((error) =>
                showError(
                  friendlyApiError(error, 'We couldn’t block this person. Please try again.'),
                  'Could not block user',
                ),
              );
          },
        },
      ],
    );
  }, [blockMutation, connectionQuery.data?.otherProfile?.userId, refreshChatData, showError]);

  const showChatActions = useCallback(() => {
    const otherProfile = connectionQuery.data?.otherProfile;
    const choices = [
      { text: 'Clear Chat', onPress: confirmClearChat },
      { text: 'Block User', style: 'destructive' as const, onPress: blockOtherUser },
      ...(otherProfile
        ? [
            {
              text: 'Report User',
              onPress: () =>
                router.push({
                  pathname: '/report',
                  params: {
                    userId: otherProfile.userId,
                    connectionId: conversationId,
                  },
                }),
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Chat options', undefined, choices);
  }, [blockOtherUser, confirmClearChat, connectionQuery.data?.otherProfile, conversationId]);

  const saveEditedMessage = useCallback(async () => {
    if (!editingMessage || !editDraft.trim()) return;
    try {
      const updated = await editMessageMutation.mutateAsync({
        messageId: editingMessage.id,
        data: { body: editDraft.trim() },
      });
      appendMessage(updated);
      setEditingMessage(null);
      setEditDraft('');
      refreshChatData();
    } catch (error) {
      showError(
        friendlyApiError(error, 'We couldn’t update this message. Check your connection and try again.'),
        'Message not updated',
      );
    }
  }, [appendMessage, editDraft, editMessageMutation, editingMessage, refreshChatData, showError]);

  useEffect(() => {
    if (!chatEnabled || !conversationId || !API_BASE_URL) {
      setSocketFallbackActive(false);
      return;
    }

    let active = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let socket: WebSocket | undefined;
    let retryDelay = 1_000;
    const startPollingFallback = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        if (active) setSocketFallbackActive(true);
      }, 5_000);
    };

    const connect = async () => {
      startPollingFallback();
      try {
        const token = await getStoredSessionToken();
        if (!active || !token) return;

        const endpoint = new URL('/ws', API_BASE_URL);
        endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(endpoint.toString());

        socket.onopen = () => {
          socket?.send(
            JSON.stringify({
              type: 'auth',
              token,
              connectionId: conversationId,
            }),
          );
        };
        socket.onmessage = (event) => {
          try {
            const frame = JSON.parse(String(event.data)) as {
              type?: string;
              message?: ConnectionMessage;
              messageId?: string;
              scope?: 'me' | 'everyone';
              userId?: string;
            };
            if (frame.type === 'ready') {
              retryDelay = 1_000;
              if (fallbackTimer) clearTimeout(fallbackTimer);
              fallbackTimer = undefined;
              setSocketFallbackActive(false);
            } else if (frame.type === 'message' && frame.message) {
              appendMessage(frame.message);
            } else if (
              frame.type === 'message-deleted' &&
              frame.messageId &&
              (frame.scope === 'everyone' || frame.userId === account?.userId)
            ) {
              removeMessageFromCache(frame.messageId);
            } else if (
              frame.type === 'chat-cleared' &&
              (frame.scope === 'everyone' || frame.userId === account?.userId)
            ) {
              clearMessagesFromCache();
            }
          } catch {
            // Ignore malformed frames; the timed polling fallback remains available.
          }
        };
        socket.onerror = startPollingFallback;
        socket.onclose = () => {
          startPollingFallback();
          if (active) {
            reconnectTimer = setTimeout(() => {
              retryDelay = Math.min(retryDelay * 2, 30_000);
              void connect();
            }, retryDelay);
          }
        };
      } catch {
        startPollingFallback();
      }
    };

    setSocketFallbackActive(false);
    void connect();
    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      socket?.close();
    };
  }, [
    account?.userId,
    appendMessage,
    chatEnabled,
    clearMessagesFromCache,
    conversationId,
    removeMessageFromCache,
  ]);

  const sendLiveMessage = async () => {
    const body = text.trim();
    if (!body || sending || !conversationId) return;

    const clientMessageId = createClientMessageId();
    const optimisticMessage: ConnectionMessage = {
      id: `optimistic-${clientMessageId}`,
      connectionId: conversationId,
      senderUserId: account?.userId ?? '',
      clientMessageId,
      body,
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    appendMessage(optimisticMessage);
    setText('');
    Keyboard.dismiss();
    setSending(true);
    try {
      const result = await createConnectionMessage(conversationId, {
        body,
        clientMessageId,
      });
      appendMessage(result);
    } catch (error) {
      queryClient.setQueryData<ConnectionMessagePage>(
        getGetConnectionMessagesQueryKey(conversationId),
        (current) =>
          current
            ? {
                ...current,
                items: current.items.filter(
                  (message) => message.id !== optimisticMessage.id,
                ),
              }
            : current,
      );
      void queryClient.invalidateQueries({
        queryKey: getGetConnectionMessagesQueryKey(conversationId),
      });
      showError(
        friendlyApiError(
          error,
          'We couldn’t send your message. Please check your connection and try again.',
        ),
        'Message not sent',
      );
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
    } catch (error) {
      showError(
        friendlyApiError(
          error,
          'Earlier messages could not be loaded. Check your connection and try again.',
        ),
        'Messages unavailable',
      );
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
      <Shell scroll={false}>
        <Header
          title={title}
          back
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chat options"
              onPress={showChatActions}
              style={styles.headerAction}
              hitSlop={10}
            >
              <Feather name="more-horizontal" size={21} color={colors.foreground} />
            </Pressable>
          }
        />
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
              const outgoing = item.senderUserId === account?.userId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${outgoing ? 'Your' : title}'s message. Hold for options.`}
                  onLongPress={() => showMessageActions(item)}
                  delayLongPress={350}
                  style={[
                    styles.bubble,
                    outgoing
                      ? styles.outgoing
                      : [styles.incoming, { backgroundColor: colors.card }],
                  ]}
                >
                  <Text style={{ color: outgoing ? '#fff' : colors.foreground, lineHeight: 20 }}>
                    {item.body}
                  </Text>
                  <Text
                    style={{
                      color: outgoing ? 'rgba(255,255,255,0.65)' : colors.mutedForeground,
                      fontSize: 10,
                      marginTop: 4,
                      textAlign: 'right',
                    }}
                  >
                    {new Date(item.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
              );
            }}
          />
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
        {toastMessage ? (
          <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.toast}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        ) : null}
        <Modal
          transparent
          animationType="fade"
          visible={Boolean(editingMessage)}
          onRequestClose={() => setEditingMessage(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.editModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.editTitle, { color: colors.foreground }]}>Edit message</Text>
              <TextInput
                value={editDraft}
                onChangeText={setEditDraft}
                multiline
                maxLength={2000}
                autoFocus
                placeholder="Write your message"
                placeholderTextColor={colors.mutedForeground}
                style={[
                  styles.editInput,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.foreground,
                  },
                ]}
              />
              <View style={styles.editActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setEditingMessage(null);
                    setEditDraft('');
                  }}
                  style={styles.editAction}
                >
                  <Text style={{ color: colors.mutedForeground, fontFamily: 'Inter_600SemiBold' }}>
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!editDraft.trim() || editMessageMutation.isPending}
                  onPress={() => void saveEditedMessage()}
                  style={[
                    styles.saveEditAction,
                    { backgroundColor: colors.primary, opacity: !editDraft.trim() || editMessageMutation.isPending ? 0.55 : 1 },
                  ]}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }}>
                    {editMessageMutation.isPending ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
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
const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingHorizontal: 18, paddingBottom: 10 },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: 10 },
  incoming: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  outgoing: { alignSelf: 'flex-end', backgroundColor: '#bd5578', borderBottomRightRadius: 5 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  field: { flex: 1, minHeight: 44, fontSize: 14, paddingHorizontal: 8 },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    maxWidth: '92%',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#2d2332',
  },
  toastText: { color: '#fff', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(15, 12, 19, 0.48)',
  },
  editModal: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 14,
  },
  editTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  editInput: {
    minHeight: 120,
    maxHeight: 220,
    borderWidth: 1,
    borderRadius: 15,
    padding: 13,
    fontSize: 15,
    lineHeight: 21,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  editAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  saveEditAction: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, borderRadius: 13 },
});