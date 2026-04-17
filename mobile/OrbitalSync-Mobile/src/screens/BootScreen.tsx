import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, BOOT_GATES, TYPOGRAPHY } from '../constants/config';
import OrbVisualizer from '../components/OrbVisualizer';

interface BootScreenProps {
  gates: Record<string, boolean>;
  onComplete: () => void;
}

interface GateItemProps {
  label: string;
  ready: boolean;
  index: number;
}

function GateItem({ label, ready, index }: GateItemProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay: 450 + index * 90,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 380,
        delay: 450 + index * 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  useEffect(() => {
    if (ready) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => loop.stop();
  }, [ready, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.gateItem, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.gateIconWrap}>
        {ready ? (
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={14}
            color="rgba(74, 222, 128, 0.9)"
          />
        ) : (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <MaterialCommunityIcons
              name="loading"
              size={14}
              color="rgba(255,255,255,0.2)"
            />
          </Animated.View>
        )}
      </View>
      <Text style={[styles.gateLabel, ready ? styles.gateLabelReady : styles.gateLabelPending]}>
        {label}
      </Text>
    </Animated.View>
  );
}

export default function BootScreen({ gates, onComplete }: BootScreenProps) {
  const [allReady, setAllReady] = useState(false);
  const [statusText, setStatusText] = useState('Inicializando subsistemas...');
  const [progress, setProgress] = useState(0);

  const fadeOut = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentScale = useRef(new Animated.Value(0.94)).current;
  const ringSpin = useRef(new Animated.Value(0)).current;
  const exitedRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const doneCount = useMemo(
    () => BOOT_GATES.filter((gate) => gates[gate.id] === true).length,
    [gates]
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 720,
        useNativeDriver: true,
      }),
      Animated.timing(contentScale, {
        toValue: 1,
        duration: 720,
        useNativeDriver: true,
      }),
    ]).start();

  }, [contentOpacity, contentScale]);

  useEffect(() => {
    if (gates.integrations) setStatusText('Integracoes conectadas');
    else if (gates.history) setStatusText('Carregando integracoes...');
    else if (gates.settings) setStatusText('Restaurando historico...');
    else if (gates.socket) setStatusText('Carregando configuracao...');
    else setStatusText('Inicializando subsistemas...');
  }, [gates]);

  useEffect(() => {
    const pct = Math.round((doneCount / BOOT_GATES.length) * 100);
    setProgress(Math.min(99, pct));
  }, [doneCount]);

  useEffect(() => {
    const ready = BOOT_GATES.every((gate) => gates[gate.id] === true);
    if (!ready || allReady || exitedRef.current) return;

    exitedRef.current = true;
    setAllReady(true);
    setProgress(100);
    setStatusText('Pronto');

    finishTimerRef.current = setTimeout(() => {
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start(() => onCompleteRef.current());
    }, 520);
  }, [allReady, fadeOut, gates]);

  useEffect(() => {
    return () => {
      if (finishTimerRef.current) {
        clearTimeout(finishTimerRef.current);
      }
    };
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}> 
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      <Animated.View
        style={[
          styles.content,
          {
            opacity: contentOpacity,
            transform: [{ scale: contentScale }],
          },
        ]}
      >
        <View style={styles.orbShell}>
          <OrbVisualizer
            isListening
            isSpeaking={false}
            isThinking={false}
            audioLevel={0.22}
          />
        </View>

        <View style={styles.brandWrap}>
          <Text style={styles.brand}>OrbitalSync</Text>
          <View style={styles.brandDivider} />
        </View>

        <View style={styles.gatesInline}>
          {BOOT_GATES.map((gate, index) => (
            <GateItem
              key={gate.id}
              label={gate.label}
              ready={!!gates[gate.id]}
              index={index}
            />
          ))}
        </View>

        <Text style={styles.statusText}>{statusText}</Text>

        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progress}%`,
                  backgroundColor: allReady
                    ? 'rgba(74,222,128,0.6)'
                    : 'rgba(255,255,255,0.24)',
                },
              ]}
            />
          </View>
        </View>
      </Animated.View>

      {allReady ? <Text style={styles.readyText}>SISTEMA PRONTO</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  orbShell: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
  },
  brandWrap: {
    alignItems: 'center',
    gap: 6,
    marginTop: -4,
  },
  brand: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: TYPOGRAPHY.sansMedium,
    letterSpacing: 4.5,
    textTransform: 'uppercase',
  },
  brandDivider: {
    width: 34,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  gatesInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
    maxWidth: 360,
  },
  gateItem: {
    alignItems: 'center',
    gap: 5,
    minWidth: 64,
  },
  gateIconWrap: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateLabel: {
    textTransform: 'uppercase',
    fontSize: 8,
    letterSpacing: 1.6,
    fontFamily: TYPOGRAPHY.sansMedium,
    textAlign: 'center',
  },
  gateLabelReady: {
    color: 'rgba(255,255,255,0.4)',
  },
  gateLabelPending: {
    color: 'rgba(255,255,255,0.16)',
  },
  statusText: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: TYPOGRAPHY.monoMedium,
    textAlign: 'center',
    marginTop: 2,
  },
  progressWrap: {
    width: 192,
    marginTop: 1,
  },
  progressTrack: {
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    borderRadius: 2,
  },
  readyText: {
    position: 'absolute',
    bottom: 48,
    color: COLORS.accent,
    fontSize: 11,
    fontFamily: TYPOGRAPHY.mono,
    letterSpacing: 3,
  },
});
