import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getSocket } from '../lib/socket';
import OrbVisualizer from '../components/OrbVisualizer';
import ChatModule, { ChatMessage } from '../components/ChatModule';
import ToolsBar from '../components/ToolsBar';
import SettingsModal from '../components/SettingsModal';
import ConfirmationModal, { ToolConfirmation } from '../components/ConfirmationModal';
import { COLORS, TYPOGRAPHY, DEBUG_MOBILE_LOGS } from '../constants/config';

function debugLog(message: string, payload?: unknown) {
  if (!DEBUG_MOBILE_LOGS) return;
  if (payload === undefined) {
    console.log(`[OrbitalSync][main] ${message}`);
    return;
  }
  console.log(`[OrbitalSync][main] ${message}`, payload);
}

let msgCounter = 0;
const makeId = () => `msg_${++msgCounter}_${Date.now()}`;

function normalizeRole(value: unknown): 'user' | 'assistant' | 'system' {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'user' || raw === 'usuario' || raw === 'you') return 'user';
  if (raw === 'assistant' || raw === 'athenas' || raw === 'ai' || raw === 'model') return 'assistant';
  if (raw === 'system') return 'system';
  return 'assistant';
}

function normalizeTimestamp(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  // Backend JSONL stores seconds; convert to ms when needed.
  return n < 1e12 ? n * 1000 : n;
}

function normalizeHistoryMessage(raw: any): ChatMessage {
  return {
    id: makeId(),
    role: normalizeRole(raw?.role ?? raw?.sender),
    content: String(raw?.content ?? raw?.text ?? ''),
    image: raw?.image ?? raw?.image_relpath,
    timestamp: normalizeTimestamp(raw?.timestamp),
  };
}

export default function MainScreen() {
  const socket = getSocket();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [micMuted, setMicMuted] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcription, setTranscription] = useState('');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [toolConfirmation, setToolConfirmation] = useState<ToolConfirmation | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatMounted, setChatMounted] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('connecting');
  const [statusText, setStatusText] = useState('Conectando...');

  const chatPanelAnim = useRef(new Animated.Value(0)).current;
  const assistantStreamMsgIdRef = useRef<string | null>(null);

  // Audio streaming from backend (PCM16 24000Hz mono)
  const pcmChunksRef = useRef<string[]>([]);
  const pcmFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSoundRef = useRef<Audio.Sound | null>(null);

  const addMessage = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: makeId(), timestamp: Date.now() }]);
  }, []);

  const playPcmChunks = useCallback(async (chunks: string[]) => {
    if (chunks.length === 0) return;
    try {
      let totalLen = 0;
      const decoded = chunks.map((b64) => {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        totalLen += arr.length;
        return arr;
      });

      // WAV: PCM16, 24000 Hz, mono
      const sampleRate = 24000;
      const wav = new Uint8Array(44 + totalLen);
      const v = new DataView(wav.buffer);
      wav.set([82,73,70,70], 0);              v.setUint32(4, 36 + totalLen, true);
      wav.set([87,65,86,69], 8);
      wav.set([102,109,116,32], 12);          v.setUint32(16, 16, true);
      v.setUint16(20, 1, true);               v.setUint16(22, 1, true);
      v.setUint32(24, sampleRate, true);      v.setUint32(28, sampleRate * 2, true);
      v.setUint16(32, 2, true);              v.setUint16(34, 16, true);
      wav.set([100,97,116,97], 36);           v.setUint32(40, totalLen, true);
      let off = 44;
      for (const chunk of decoded) { wav.set(chunk, off); off += chunk.length; }

      let bin = '';
      for (let i = 0; i < wav.length; i++) bin += String.fromCharCode(wav[i]);
      const wavB64 = btoa(bin);

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: false });
      if (activeSoundRef.current) {
        await activeSoundRef.current.unloadAsync().catch(() => {});
        activeSoundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/wav;base64,${wavB64}` },
        { shouldPlay: true, volume: 1.0 }
      );
      activeSoundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (activeSoundRef.current === sound) activeSoundRef.current = null;
          // Áudio terminou — volta ao estado de espera
          setIsSpeaking(false);
          setIsListening(true);
        }
      });
    } catch (e) {
      debugLog('playPcmChunks error', e);
      setIsSpeaking(false);
    }
  }, []);

  const appendAssistantChunk = useCallback((chunk: string) => {
    const clean = String(chunk || '');
    if (!clean.trim()) return;

    const currentId = assistantStreamMsgIdRef.current;
    if (!currentId) {
      const id = makeId();
      assistantStreamMsgIdRef.current = id;
      setMessages((prev) => [
        ...prev,
        {
          id,
          role: 'assistant',
          content: clean,
          timestamp: Date.now(),
        },
      ]);
      return;
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === currentId
          ? { ...msg, content: `${msg.content}${clean}`, timestamp: Date.now() }
          : msg
      )
    );
  }, []);

  useEffect(() => {
    const handleConnected = () => {
      debugLog('socket connected, booting sync');
      assistantStreamMsgIdRef.current = null;
      setConnectionStatus('connected');
      setStatusText('Conectado');
      socket.emit('orbital_sync_boot');
      socket.emit('get_settings');
      socket.emit('get_chat_history');
    };

    socket.on('connect', handleConnected);

    // MainScreen can mount after BootScreen while socket is already connected.
    // In that case, the 'connect' event won't fire again, so sync UI immediately.
    if (socket.connected) {
      handleConnected();
    }

    socket.on('disconnect', () => {
      debugLog('socket disconnected');
      setConnectionStatus('disconnected');
      setStatusText('Desconectado');
      setIsListening(false);
      setIsSpeaking(false);
    });

    socket.on('connect_error', () => {
      debugLog('socket connect_error');
      setConnectionStatus('disconnected');
      setStatusText('Erro de conexão');
    });

    socket.on('status', (data: { state?: string; text?: string; listening?: boolean; speaking?: boolean; thinking?: boolean }) => {
      debugLog('status event', data);
      const statusTextValue = (data as any).text ?? (data as any).msg;
      if (statusTextValue) setStatusText(String(statusTextValue));
      if (data.state === 'listening' || data.listening) {
        setIsListening(true);
        setIsSpeaking(false);
        setIsThinking(false);
        assistantStreamMsgIdRef.current = null;
      } else if (data.state === 'speaking' || data.speaking) {
        setIsListening(false);
        setIsSpeaking(true);
        setIsThinking(false);
      } else if (data.state === 'thinking' || data.thinking) {
        setIsListening(false);
        setIsSpeaking(false);
        setIsThinking(true);
      } else if (data.state === 'idle' || data.state === 'waiting') {
        setIsListening(false);
        setIsSpeaking(false);
        setIsThinking(false);
      }
    });

    socket.on('audio_pcm', (data: { data: string }) => {
      if (!data?.data) return;
      pcmChunksRef.current.push(data.data);
      if (pcmFlushTimerRef.current) clearTimeout(pcmFlushTimerRef.current);
      pcmFlushTimerRef.current = setTimeout(() => {
        const chunks = pcmChunksRef.current;
        pcmChunksRef.current = [];
        pcmFlushTimerRef.current = null;
        playPcmChunks(chunks);
      }, 400);
    });

    socket.on('audio_data', (data: { level?: number; speaking?: boolean; data?: number[] }) => {
      if (data.level !== undefined || data.speaking !== undefined) {
        debugLog('audio_data event', data);
      }
      if (Array.isArray(data.data) && data.data.length > 0) {
        const avg = data.data.reduce((sum, v) => sum + Number(v || 0), 0) / data.data.length;
        setAudioLevel(Math.max(0, Math.min(1, avg / 255)));
      }
      if (data.level !== undefined) setAudioLevel(Math.max(0, Math.min(1, Number(data.level) || 0)));
      if (data.speaking !== undefined) setIsSpeaking(data.speaking);
    });

    socket.on('transcription', (data: { text?: string; final?: boolean; sender?: string }) => {
      debugLog('transcription event', data);
      const sender = String((data as any).sender ?? '').trim().toLowerCase();
      const text = String(data.text ?? '');

      if (!text) return;

      if (sender === 'athenas' || sender === 'assistant' || sender === 'ai' || sender === 'model') {
        setIsThinking(false);
        setIsSpeaking(true);
        setTranscription('');
        appendAssistantChunk(text);
        return;
      }

      setTranscription(text);
      if (data.final) {
        setTranscription('');
        setIsThinking(true);
        assistantStreamMsgIdRef.current = null;
      }
    });

    socket.on('settings', (data: Record<string, any>) => {
      debugLog('settings received', data);
      setSettings(data);
    });

    socket.on('chat_history', (data: { messages?: any[] }) => {
      debugLog('chat_history received', { count: data.messages?.length ?? 0 });
      assistantStreamMsgIdRef.current = null;
      if (!data.messages?.length) {
        setMessages([]);
        return;
      }
      const mapped: ChatMessage[] = data.messages.map(normalizeHistoryMessage);
      setMessages(mapped);
    });

    socket.on('tool_confirmation_request', (data: ToolConfirmation) => {
      debugLog('tool confirmation request', data);
      setToolConfirmation(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    });

    socket.on('error', (data: { message?: string; msg?: string }) => {
      const message = data.message ?? data.msg;
      if (message) {
        addMessage({ role: 'system', content: `Erro: ${message}` });
      }
    });

    return () => {
      socket.off('connect', handleConnected);
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('status');
      socket.off('audio_pcm');
      socket.off('audio_data');
      socket.off('transcription');
      socket.off('settings');
      socket.off('chat_history');
      socket.off('tool_confirmation_request');
      socket.off('error');
      if (pcmFlushTimerRef.current) clearTimeout(pcmFlushTimerRef.current);
    };
  }, []);

  const toggleChat = useCallback(() => {
    if (chatVisible) {
      setChatVisible(false);
      Animated.timing(chatPanelAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setChatMounted(false);
      });
      return;
    }

    setChatMounted(true);
    setChatVisible(true);
    chatPanelAnim.setValue(0);
    Animated.timing(chatPanelAnim, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chatVisible, chatPanelAnim]);

  const toggleMic = useCallback(() => {
    const next = !micMuted;
    setMicMuted(next);
    debugLog('emit set_voice_detection', { enabled: !next });
    socket.emit('set_voice_detection', { enabled: !next });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [micMuted]);

  const handleSendMessage = useCallback((text: string) => {
    debugLog('emit user_input', { text });
    assistantStreamMsgIdRef.current = null;
    addMessage({ role: 'user', content: text });
    // Cancela áudio anterior se a Athena ainda estava falando
    if (activeSoundRef.current) {
      activeSoundRef.current.stopAsync().catch(() => {});
      activeSoundRef.current.unloadAsync().catch(() => {});
      activeSoundRef.current = null;
    }
    if (pcmFlushTimerRef.current) {
      clearTimeout(pcmFlushTimerRef.current);
      pcmFlushTimerRef.current = null;
      pcmChunksRef.current = [];
    }
    setIsSpeaking(false);
    setIsThinking(true);
    socket.emit('user_input', { text });
  }, [addMessage, socket]);

  const handleUpdateSetting = useCallback((key: string, value: any) => {
    debugLog('emit update_settings', { [key]: value });
    setSettings((prev) => ({ ...prev, [key]: value }));
    socket.emit('update_settings', { [key]: value });
  }, []);

  const handleConfirmTool = useCallback(() => {
    debugLog('emit confirm_tool', { confirmed: true });
    socket.emit('confirm_tool', { confirmed: true });
    setToolConfirmation(null);
  }, []);

  const handleDenyTool = useCallback(() => {
    debugLog('emit confirm_tool', { confirmed: false });
    socket.emit('confirm_tool', { confirmed: false });
    setToolConfirmation(null);
  }, []);

  const chatOpacity = chatPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const chatTranslateY = chatPanelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandText}>ATHENAS</Text>
          <Text style={styles.versionText}>OrbitalSync · Mobile</Text>
        </View>
        <View style={styles.statusPill}>
          <View style={[
            styles.statusDot,
            {
              backgroundColor:
                connectionStatus === 'connected' ? COLORS.accent :
                connectionStatus === 'connecting' ? COLORS.warn :
                COLORS.danger
            }
          ]} />
          <Text style={styles.statusPillText}>{statusText}</Text>
        </View>
      </View>

      <View style={styles.body}>
        {/* Orb Area — toque fecha o chat quando estiver aberto */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => { if (chatVisible) toggleChat(); }}
        >
          <View style={styles.orbArea}>
            <OrbVisualizer
              isListening={isListening && !micMuted}
              isSpeaking={isSpeaking}
              isThinking={isThinking}
              audioLevel={audioLevel}
            />

            <View style={styles.sessionInfo}>
              <View style={[styles.sessionDot, {
                backgroundColor: isSpeaking ? COLORS.orbPrimary : isThinking ? COLORS.warn : (isListening && !micMuted) ? COLORS.accent : COLORS.textDim,
              }]} />
              <Text style={styles.sessionText}>
                {isSpeaking ? 'Falando...' : isThinking ? 'Pensando...' : (isListening && !micMuted) ? 'Ouvindo...' : 'Aguardando'}
              </Text>
            </View>
          </View>
        </Pressable>

        {chatMounted && (
          <Animated.View
            pointerEvents={chatVisible ? 'auto' : 'none'}
            style={[
              styles.chatOverlay,
              {
                opacity: chatOpacity,
                transform: [{ translateY: chatTranslateY }],
              },
            ]}
          >
            <ChatModule
              messages={messages}
              onSendMessage={handleSendMessage}
              isThinking={isThinking}
              transcription={transcription}
              onCloseChat={toggleChat}
            />
          </Animated.View>
        )}
      </View>

      {!chatVisible && (
        <ToolsBar
          micMuted={micMuted}
          onToggleMic={toggleMic}
          onOpenSettings={() => setSettingsVisible(true)}
          onOpenChat={toggleChat}
          chatVisible={chatVisible}
          isListening={isListening && !micMuted}
        />
      )}

      {/* Modals */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        settings={settings}
        onUpdateSetting={handleUpdateSetting}
        connectionStatus={connectionStatus}
      />

      <ConfirmationModal
        confirmation={toolConfirmation}
        onConfirm={handleConfirmTool}
        onDeny={handleDenyTool}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandText: {
    color: COLORS.orbGlow,
    fontSize: 18,
    fontFamily: TYPOGRAPHY.sans,
    letterSpacing: 5,
  },
  versionText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: TYPOGRAPHY.monoMedium,
    letterSpacing: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.bgCard,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusPillText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontFamily: TYPOGRAPHY.sansMedium,
    letterSpacing: 0.5,
  },
  orbArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    gap: 20,
  },
  body: {
    flex: 1,
    position: 'relative',
  },
  sessionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  sessionText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: TYPOGRAPHY.sans,
    letterSpacing: 1,
  },
  chatOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.28)',
    overflow: 'hidden',
  },
});
