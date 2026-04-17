import React, { useRef, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants/config';

interface ToolsBarProps {
  micMuted: boolean;
  onToggleMic: () => void;
  onOpenSettings: () => void;
  onOpenChat: () => void;
  chatVisible: boolean;
  isListening: boolean;
}

interface ToolButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
  large?: boolean;
  pulsing?: boolean;
}

function ToolButton({ icon, label, onPress, active, danger, accent, large, pulsing }: ToolButtonProps) {
  const pulseScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (pulsing) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseScale, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseScale.setValue(1);
    }
  }, [pulsing]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const size = large ? 52 : 42;
  const iconSize = large ? 22 : 18;

  const bgColors: [string, string] = danger
    ? ['rgba(127,29,29,0.55)', 'rgba(153,27,27,0.65)']
    : accent
    ? ['rgba(6,78,59,0.55)', 'rgba(6,95,70,0.65)']
    : active
    ? ['rgba(8,145,178,0.45)', 'rgba(14,116,144,0.55)']
    : ['rgba(9,9,11,0.7)', 'rgba(9,9,11,0.9)'];

  return (
    <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        style={styles.toolBtnOuter}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <LinearGradient
          colors={bgColors}
          style={[
            styles.toolBtn,
            { width: size, height: size, borderRadius: size / 2 },
            (danger || accent || active) && styles.toolBtnActive,
          ]}
        >
          <Ionicons
            name={icon}
            size={iconSize}
            color={
              danger
                ? '#fca5a5'
                : accent
                ? COLORS.accent
                : active
                ? COLORS.orbGlow
                : COLORS.textSecondary
            }
          />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToolsBar({
  micMuted,
  onToggleMic,
  onOpenSettings,
  onOpenChat,
  chatVisible,
  isListening,
}: ToolsBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <View style={styles.row}>
        <ToolButton
          icon={micMuted ? 'mic-off' : 'mic'}
          label={micMuted ? 'Mudo' : 'Mic'}
          onPress={onToggleMic}
          active={!micMuted}
          pulsing={isListening && !micMuted}
          accent={isListening && !micMuted}
        />

        <ToolButton
          icon={chatVisible ? 'chatbubbles' : 'chatbubbles-outline'}
          label="Chat"
          onPress={onOpenChat}
          active={chatVisible}
          large
        />

        <ToolButton
          icon="settings-outline"
          label="Config"
          onPress={onOpenSettings}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  toolBtnOuter: {
    alignItems: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  toolBtnActive: {
    borderColor: 'rgba(103,232,249,0.36)',
  },
});
