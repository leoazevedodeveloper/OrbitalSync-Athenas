import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  Animated,
  Keyboard,
  Platform,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { COLORS, BACKEND_ORIGIN, TYPOGRAPHY } from '../constants/config';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: string;
  timestamp?: number;
}

interface ChatModuleProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isThinking: boolean;
  transcription?: string;
  onCloseChat?: () => void;
}

function MessageBubble({ msg, onImagePress }: { msg: ChatMessage; onImagePress?: (url: string) => void }) {
  const isUser = msg.role === 'user';
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  if (msg.role === 'system') {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemText}>{msg.content}</Text>
      </View>
    );
  }

  const imageUrl = msg.image?.startsWith('http')
    ? msg.image
    : msg.image
    ? `${BACKEND_ORIGIN}/api/generated-image?relpath=${encodeURIComponent(msg.image)}`
    : null;

  return (
    <Animated.View
      style={[
        styles.bubbleWrapper,
        isUser ? styles.bubbleWrapperUser : styles.bubbleWrapperAI,
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.messageBlock}>
        <View style={[styles.metaRow, isUser ? styles.metaRowUser : styles.metaRowAI]}>
          <Ionicons
            name={isUser ? 'person-circle-outline' : 'sparkles-outline'}
            size={13}
            color={isUser ? 'rgba(16,185,129,0.95)' : 'rgba(103,232,249,0.92)'}
          />
          <Text style={[styles.metaSender, isUser ? styles.metaSenderUser : styles.metaSenderAI]}>
            {isUser ? 'VOCE' : 'ATHENAS'}
          </Text>
          {msg.timestamp ? (
            <Text style={styles.metaTime}>
              {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          ) : null}
        </View>

        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAI]}>
          {imageUrl && (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => onImagePress?.(imageUrl)}
              accessibilityRole="button"
              accessibilityLabel="Expandir imagem"
            >
              <Image source={{ uri: imageUrl }} style={styles.bubbleImage} resizeMode="cover" />
              <View style={styles.bubbleImageHint}>
                <Ionicons name="expand-outline" size={13} color="rgba(255,255,255,0.95)" />
                <Text style={styles.bubbleImageHintText}>Expandir</Text>
              </View>
            </TouchableOpacity>
          )}
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAI]}>
            {msg.content}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function ThinkingIndicator() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    Animated.parallel([animate(dot1, 0), animate(dot2, 200), animate(dot3, 400)]).start();
  }, []);

  return (
    <View style={styles.thinkingWrapper}>
      <View style={[styles.metaRow, styles.metaRowAI]}>
        <Ionicons name="sparkles-outline" size={13} color="rgba(103,232,249,0.92)" />
        <Text style={[styles.metaSender, styles.metaSenderAI]}>ATHENAS</Text>
      </View>
      <View style={[styles.bubble, styles.bubbleAI, styles.thinkingBubble]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.thinkingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
}

export default function ChatModule({ messages, onSendMessage, isThinking, transcription, onCloseChat }: ChatModuleProps) {
  const [inputText, setInputText] = useState('');
  const [composerHeight, setComposerHeight] = useState(118);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [savingImage, setSavingImage] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // Scroll para o fim quando o painel abre (aguarda a animação de 320ms terminar)
  useEffect(() => {
    const t = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 380);
    return () => clearTimeout(t);
  }, []);

  // Scroll para o fim em novas mensagens
  useEffect(() => {
    if (messages.length > 0 || isThinking) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, isThinking]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onKeyboardShow = (event: any) => {
      const kbHeight = Number(event?.endCoordinates?.height ?? 0);
      const safeAdjusted = Platform.OS === 'ios'
        ? Math.max(0, kbHeight - insets.bottom)
        : Math.max(0, kbHeight);

      Animated.timing(keyboardOffsetAnim, {
        toValue: safeAdjusted,
        duration: Platform.OS === 'ios' ? 240 : 180,
        useNativeDriver: true,
      }).start();

      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
    };

    const onKeyboardHide = () => {
      Animated.timing(keyboardOffsetAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? 220 : 160,
        useNativeDriver: true,
      }).start();
    };

    const showSub = Keyboard.addListener(showEvent, onKeyboardShow);
    const hideSub = Keyboard.addListener(hideEvent, onKeyboardHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom, keyboardOffsetAnim]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    onSendMessage(text);
  };

  const handleSaveImage = async () => {
    if (!imagePreviewUrl || savingImage) return;

    try {
      setSavingImage(true);
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permissão necessária', 'Permita acesso às fotos para salvar a imagem.');
        return;
      }

      const cacheDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!cacheDir) {
        throw new Error('Diretório local indisponível para download.');
      }

      const sanitized = imagePreviewUrl.split('?')[0] || imagePreviewUrl;
      const extMatch = sanitized.match(/\.([a-zA-Z0-9]+)$/);
      const ext = (extMatch?.[1] || 'jpg').toLowerCase();
      const localUri = `${cacheDir}orbital_${Date.now()}.${ext}`;

      const downloaded = await FileSystem.downloadAsync(imagePreviewUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(downloaded.uri);

      Alert.alert('Imagem salva', 'A imagem foi salva na sua galeria.');
    } catch (error) {
      Alert.alert('Erro ao salvar', 'Não foi possível salvar a imagem no momento.');
    } finally {
      setSavingImage(false);
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <MessageBubble msg={item} onImagePress={(url) => setImagePreviewUrl(url)} />
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <View style={styles.headerLeft}>
          <View style={styles.headerBadge}>
            <Ionicons name="sparkles" size={16} color="rgba(103,232,249,0.95)" />
          </View>
          <View>
            <Text style={styles.headerTitle}>ATHENAS</Text>
            <Text style={styles.headerSubtitle}>
              {isThinking ? 'Processando...' : transcription ? 'Ouvindo sua voz...' : 'Aguardando'}
            </Text>
          </View>
        </View>
        {onCloseChat ? (
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onCloseChat}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Fechar chat"
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.82)" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.contentViewport}>
        <Animated.View style={[styles.contentArea, { transform: [{ translateY: Animated.multiply(keyboardOffsetAnim, -1) }] }]}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.listContent, { paddingBottom: composerHeight + 16 }]}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Olá! Como posso ajudar?</Text>
              </View>
            }
            ListFooterComponent={isThinking ? <ThinkingIndicator /> : null}
          />

          <View
            onLayout={(event) => {
              const nextHeight = Math.ceil(event.nativeEvent.layout.height);
              if (nextHeight > 0 && nextHeight !== composerHeight) {
                setComposerHeight(nextHeight);
              }
            }}
            style={styles.composerArea}
          >
            {transcription ? (
              <View style={styles.transcriptionBar}>
                <Ionicons name="mic" size={14} color={COLORS.accent} />
                <Text style={styles.transcriptionText} numberOfLines={1}>
                  {transcription}
                </Text>
              </View>
            ) : null}

            <View style={styles.inputRow}>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Mensagem... Enter envia"
                  placeholderTextColor={COLORS.textSecondary}
                  multiline
                  maxLength={2000}
                  onSubmitEditing={handleSend}
                  blurOnSubmit={false}
                />
              </View>
              <TouchableOpacity
                onPress={handleSend}
                disabled={!inputText.trim()}
                style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={inputText.trim() ? ['#f4f4f5', '#ffffff'] : ['#18181b', '#18181b']}
                  style={styles.sendBtnGradient}
                >
                  <Ionicons name="send" size={16} color={inputText.trim() ? '#0a0a0a' : COLORS.textSecondary} />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>

      <Modal
        visible={!!imagePreviewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <View style={[styles.previewBackdrop, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }]}>
          <View style={styles.previewTopBar}>
            <TouchableOpacity
              style={styles.previewIconBtn}
              onPress={() => setImagePreviewUrl(null)}
              accessibilityRole="button"
              accessibilityLabel="Fechar pré-visualização"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.previewImageWrap}>
            {imagePreviewUrl ? (
              <Image source={{ uri: imagePreviewUrl }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.previewSaveBtn, savingImage && styles.previewSaveBtnDisabled]}
              onPress={handleSaveImage}
              disabled={savingImage}
              accessibilityRole="button"
              accessibilityLabel="Salvar imagem"
            >
              {savingImage ? (
                <ActivityIndicator size="small" color="#f8fafc" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#f8fafc" />
                  <Text style={styles.previewSaveBtnText}>Salvar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.26)',
    overflow: 'hidden',
  },
  contentViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  contentArea: {
    flex: 1,
  },
  headerCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(2,6,23,0.58)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
    elevation: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'rgba(255,255,255,0.95)',
    fontFamily: TYPOGRAPHY.sans,
    fontSize: 12,
    letterSpacing: 2,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.48)',
    fontFamily: TYPOGRAPHY.monoMedium,
    fontSize: 11,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(9,9,11,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 12,
  },
  list: {
    flex: 1,
  },
  bubbleWrapper: {
    flexDirection: 'row',
    marginVertical: 1,
  },
  bubbleWrapperUser: {
    justifyContent: 'flex-end',
  },
  bubbleWrapperAI: {
    justifyContent: 'flex-start',
  },
  messageBlock: {
    width: '100%',
    maxWidth: '86%',
    gap: 7,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  metaRowAI: {
    justifyContent: 'flex-start',
  },
  metaRowUser: {
    justifyContent: 'flex-end',
  },
  metaSender: {
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: TYPOGRAPHY.sans,
  },
  metaSenderAI: {
    color: 'rgba(165,243,252,0.95)',
  },
  metaSenderUser: {
    color: 'rgba(167,243,208,0.95)',
  },
  metaTime: {
    color: 'rgba(212,212,216,0.72)',
    fontSize: 10,
    fontFamily: TYPOGRAPHY.monoMedium,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  bubbleUser: {
    backgroundColor: '#f4f4f5',
    borderBottomRightRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bubbleAI: {
    backgroundColor: 'rgba(9,9,11,0.92)',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.22)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: TYPOGRAPHY.sansMedium,
  },
  bubbleTextUser: {
    color: '#09090b',
  },
  bubbleTextAI: {
    color: '#f4f4f5',
  },
  bubbleImage: {
    width: 220,
    height: 160,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  bubbleImageHint: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(2,6,23,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  bubbleImageHintText: {
    color: 'rgba(248,250,252,0.95)',
    fontSize: 10,
    fontFamily: TYPOGRAPHY.sansMedium,
  },
  systemMsg: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginVertical: 4,
  },
  systemText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: TYPOGRAPHY.monoMedium,
    textAlign: 'center',
    letterSpacing: 1,
  },
  thinkingWrapper: {
    alignSelf: 'flex-start',
    gap: 7,
    marginTop: 2,
    marginBottom: 8,
    marginLeft: 2,
  },
  thinkingBubble: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  thinkingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(103,232,249,0.95)',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontFamily: TYPOGRAPHY.sans,
    letterSpacing: 1,
  },
  transcriptionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.24)',
  },
  transcriptionText: {
    color: COLORS.accent,
    fontSize: 13,
    fontFamily: TYPOGRAPHY.sansMedium,
    flex: 1,
    fontStyle: 'italic',
  },
  composerArea: {
    paddingBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: 'rgba(2,6,23,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
  },
  input: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: TYPOGRAPHY.sansMedium,
  },
  sendBtn: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnGradient: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(1,3,8,0.95)',
  },
  previewTopBar: {
    paddingHorizontal: 14,
    alignItems: 'flex-end',
  },
  previewIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImageWrap: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewActions: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSaveBtn: {
    minWidth: 132,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(8,145,178,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.65)',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  previewSaveBtnDisabled: {
    opacity: 0.65,
  },
  previewSaveBtnText: {
    color: '#f8fafc',
    fontSize: 14,
    letterSpacing: 0.6,
    fontFamily: TYPOGRAPHY.sans,
  },
});
