import { Feather, Ionicons } from '@expo/vector-icons';
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
import { ActivityIndicator, Alert, Animated, FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { useApp, getProfile, ChatMessage } from '@/components/AppProvider';
import { getStoredSessionToken, useAuth } from '@/components/AuthProvider';
import { friendlyApiError, useErrorModal } from '@/components/ErrorModal';
import { Avatar, Header, PressScale, Shell } from '@/components/ui';
import { UnlockChatButton } from '@/components/UnlockChatButton';
import { API_BASE_URL, USE_LIVE_API } from '@/constants/config';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MIN_COMPOSER_INPUT_HEIGHT = 44;
const MAX_COMPOSER_INPUT_HEIGHT = 84;

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [composerInputHeight, setComposerInputHeight] = useState(
    MIN_COMPOSER_INPUT_HEIGHT,
  );
  const [sending, setSending] = useState(false);
  const [failedMessageId, setFailedMessageId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editingMessage, setEditingMessage] = useState<ConnectionMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [chatActionsVisible, setChatActionsVisible] = useState(false);
  const chatModalY = useRef(new Animated.Value(300)).current;
  const chatBackdropOpacity = useRef(new Animated.Value(0)).current;
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

  const updateComposerInputHeight = (contentHeight: number) => {
    const measuredTextHeight = Math.max(0, contentHeight - 16);
    const lineCount = Math.max(1, Math.ceil(measuredTextHeight / 20));
    setComposerInputHeight(
      Math.min(
        MAX_COMPOSER_INPUT_HEIGHT,
        MIN_COMPOSER_INPUT_HEIGHT + (lineCount - 1) * 20,
      ),
    );
  };

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
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!chatActionsVisible) return;
    chatModalY.setValue(300);
    chatBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(chatModalY, {
        toValue: 0,
        damping: 18,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(chatBackdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [chatActionsVisible, chatBackdropOpacity, chatModalY]);

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
    setChatActionsVisible(false);
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
    setChatActionsVisible(true);
  }, []);

  const finishFailedMessageAnimation = useCallback((messageId: string) => {
    queryClient.setQueryData<ConnectionMessagePage>(
      getGetConnectionMessagesQueryKey(conversationId),
      (current) =>
        current
          ? { ...current, items: current.items.filter((item) => item.id !== messageId) }
          : current,
    );
    setFailedMessageId(null);
    void queryClient.invalidateQueries({
      queryKey: getGetConnectionMessagesQueryKey(conversationId),
    });
  }, [conversationId, queryClient]);

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
    setComposerInputHeight(MIN_COMPOSER_INPUT_HEIGHT);
    Keyboard.dismiss();
    setSending(true);
    try {
      const result = await createConnectionMessage(conversationId, {
        body,
        clientMessageId,
      });
      appendMessage(result);
    } catch (error) {
      setFailedMessageId(optimisticMessage.id);
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
        <Shell scroll={false} contentBottomPadding={0}>
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
              <Feather name="more-horizontal" size={20} color={colors.foreground} />
            </Pressable>
          }
        />
        <KeyboardAvoidingView
          style={styles.root}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
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
            style={styles.messageList}
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
            renderItem={({ item }) => (
              <AnimatedMessageBubble
                message={item}
                currentUserId={account?.userId ?? ''}
                status={
                  item.id === failedMessageId
                    ? 'failed'
                    : item.id.startsWith('optimistic-')
                      ? 'sending'
                      : 'idle'
                }
                onLongPress={() => showMessageActions(item)}
                onFailureAnimationComplete={finishFailedMessageAnimation}
              />
            )}
          />
          <View
            style={[
              styles.composer,
              {
                paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8),
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              scrollEnabled={composerInputHeight >= MAX_COMPOSER_INPUT_HEIGHT}
              onContentSizeChange={(event) =>
                updateComposerInputHeight(event.nativeEvent.contentSize.height)
              }
              placeholder="Write a thoughtful message…"
              placeholderTextColor={colors.mutedForeground}
              style={[
                styles.field,
                { color: colors.foreground, height: composerInputHeight },
              ]}
              onSubmitEditing={() => void sendLiveMessage()}
              returnKeyType="send"
              maxLength={2000}
            />
            <PressScale
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={sending || !text.trim()}
              onPress={() => void sendLiveMessage()}
              style={[
                styles.send,
                { backgroundColor: colors.primary, opacity: sending || !text.trim() ? 0.55 : 1 },
              ]}
              testID="button-send-message"
            >
              <Feather name="send" size={20} color={colors.primaryForeground} />
            </PressScale>
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
          <View style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}>
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
        <Modal
          transparent
          animationType="none"
          visible={chatActionsVisible}
          onRequestClose={() => setChatActionsVisible(false)}
        >
          <View style={styles.chatOptionsRoot}>
            <Animated.View style={[styles.chatOptionsBackdrop, { opacity: chatBackdropOpacity, backgroundColor: colors.overlay }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss chat options"
                onPress={() => setChatActionsVisible(false)}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
            <Animated.View
              style={[
                styles.chatOptionsSheet,
                { backgroundColor: colors.surface, transform: [{ translateY: chatModalY }] },
              ]}
            >
              {[
                {
                  label: 'Block',
                  icon: 'ban' as const,
                  color: colors.destructive,
                  onPress: blockOtherUser,
                },
                {
                  label: 'Report',
                  icon: 'flag' as const,
                  color: colors.onSurface,
                  onPress: () => {
                    setChatActionsVisible(false);
                    const otherProfile = connectionQuery.data?.otherProfile;
                    if (!otherProfile) return;
                    router.push({
                      pathname: '/report',
                      params: { userId: otherProfile.userId, connectionId: conversationId },
                    });
                  },
                },
                {
                  label: 'Clear Chat',
                  icon: 'trash' as const,
                  color: colors.destructive,
                  onPress: () => {
                    setChatActionsVisible(false);
                    confirmClearChat();
                  },
                },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={action.onPress}
                  style={styles.chatOption}
                  testID={`chat-option-${action.label.toLowerCase().replace(' ', '-')}`}
                >
                  <View style={[styles.chatOptionIcon, { backgroundColor: colors.surfaceVariant }]}>
                    <Ionicons name={action.icon} size={24} color={action.color} />
                  </View>
                  <Text style={[styles.chatOptionLabel, { color: colors.onSurface }]}>
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </Animated.View>
          </View>
        </Modal>
      </Shell>
    );
  }

  if (!profile || !match) return <View />;
  const send = () => {
    sendMessage(match.id, text);
    setText('');
    setComposerInputHeight(MIN_COMPOSER_INPUT_HEIGHT);
    Keyboard.dismiss();
  };
  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <Header title={profile.name} back />
      <FlatList
        style={styles.messageList}
        data={[...messages].reverse()}
        inverted
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }: { item: ChatMessage }) => {
          const mine = item.sender === 'me';
          return (
            <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <View style={[styles.bubble, mine ? [styles.outgoing, { backgroundColor: colors.primary }] : [styles.incoming, { backgroundColor: colors.surfaceVariant }]]}>
                <Text style={{ color: mine ? colors.primaryForeground : colors.onSurface, lineHeight: 20, flexWrap: 'wrap' }}>{item.text}</Text>
                <Text style={{ color: mine ? colors.primaryForeground : colors.onSurfaceVariant, opacity: mine ? 0.68 : 1, fontSize: 12, marginTop: 4, textAlign: 'right' }}>{item.time}</Text>
              </View>
            </View>
          );
        }}
        ListHeaderComponent={<View style={{ height: 32 }} />}
      />
      <View style={[styles.composer, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 8), backgroundColor: colors.surface, borderColor: colors.divider }]}>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          multiline
          scrollEnabled={composerInputHeight >= MAX_COMPOSER_INPUT_HEIGHT}
          onContentSizeChange={(event) =>
            updateComposerInputHeight(event.nativeEvent.contentSize.height)
          }
          placeholder="Write a thoughtful message…"
          placeholderTextColor={colors.onSurfaceVariant}
          style={[
            styles.field,
            { color: colors.onSurface, height: composerInputHeight },
          ]}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <PressScale onPress={send} style={[styles.send, { backgroundColor: colors.primary }]}>
          <Feather name="send" size={20} color={colors.primaryForeground} />
        </PressScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function AnimatedMessageBubble({
  message,
  currentUserId,
  status,
  onLongPress,
  onFailureAnimationComplete,
}: {
  message: ConnectionMessage;
  currentUserId: string;
  status: 'idle' | 'sending' | 'failed';
  onLongPress: () => void;
  onFailureAnimationComplete: (messageId: string) => void;
}) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const pulse = useRef<Animated.CompositeAnimation | null>(null);
  const mine = message.senderUserId === currentUserId;

  useEffect(() => {
    const isRecent = Date.now() - new Date(message.createdAt).getTime() < 1_500;
    if (!isRecent && status === 'idle') {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    return () => {
      pulse.current?.stop();
      pulse.current = null;
    };
  }, [message.createdAt, message.id, opacity, translateY]);

  useEffect(() => {
    if (status === 'sending') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.6, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      );
      pulse.current = animation;
      const timer = setTimeout(() => animation.start(), 180);
      return () => {
        clearTimeout(timer);
        animation.stop();
        if (pulse.current === animation) pulse.current = null;
      };
    }

    pulse.current?.stop();
    pulse.current = null;
    if (status === 'failed') {
      opacity.setValue(1);
      const shake = Animated.sequence([
        Animated.timing(translateX, { toValue: -4, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateX, { toValue: 4, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateX, { toValue: -4, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateX, { toValue: 4, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(translateX, { toValue: 0, duration: 60, useNativeDriver: Platform.OS !== 'web' }),
      ]);
      shake.start(({ finished }) => {
        if (finished) onFailureAnimationComplete(message.id);
      });
      return () => shake.stop();
    }
    opacity.setValue(1);
    return undefined;
  }, [message.id, onFailureAnimationComplete, opacity, status, translateX]);

  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Animated.View
        style={[
          styles.bubble,
          mine
            ? [styles.outgoing, { backgroundColor: colors.primary }]
            : [styles.incoming, { backgroundColor: colors.surfaceVariant }],
          { opacity, transform: [{ translateY }, { translateX }] },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${mine ? 'Your' : 'Their'} message. Hold for options.`}
          onLongPress={onLongPress}
          delayLongPress={350}
        >
          <Text style={{ color: mine ? colors.primaryForeground : colors.onSurface, lineHeight: 20, flexWrap: 'wrap' }}>
            {message.body}
          </Text>
          <Text
            style={{
              color: mine ? colors.primaryForeground : colors.onSurfaceVariant,
              opacity: mine ? 0.68 : 1,
              fontSize: 12,
              marginTop: 4,
              textAlign: 'right',
            }}
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function createClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  messageList: { flex: 1 },
  list: { paddingTop: 8, paddingBottom: 8 },
  bubble: { maxWidth: '75%', flexShrink: 1, marginHorizontal: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, marginBottom: 12 },
  incoming: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  outgoing: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, borderTopWidth: 1 },
  field: { flex: 1, minHeight: MIN_COMPOSER_INPUT_HEIGHT, maxHeight: MAX_COMPOSER_INPUT_HEIGHT, fontSize: 14, lineHeight: 20, paddingHorizontal: 8, paddingVertical: 8, textAlignVertical: 'center' },
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
  },
  toastText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 22,
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
  chatOptionsRoot: { flex: 1, justifyContent: 'flex-end' },
  chatOptionsBackdrop: { ...StyleSheet.absoluteFill },
  chatOptionsSheet: {
    height: 160,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  chatOption: { flex: 1, alignItems: 'center', gap: 8 },
  chatOptionIcon: { width: 56, height: 56, borderRadius: 28, padding: 16, alignItems: 'center', justifyContent: 'center' },
  chatOptionLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});