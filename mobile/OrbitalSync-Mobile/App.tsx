import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts as useQuicksandFonts, Quicksand_500Medium, Quicksand_700Bold } from '@expo-google-fonts/quicksand';
import { useFonts as useMonoFonts, IBMPlexMono_500Medium, IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono';

import BootScreen from './src/screens/BootScreen';
import MainScreen from './src/screens/MainScreen';
import { getSocket } from './src/lib/socket';
import { BOOT_GATES, COLORS } from './src/constants/config';

type BootGates = Record<string, boolean>;

export default function App() {
  const [quicksandLoaded] = useQuicksandFonts({
    Quicksand_500Medium,
    Quicksand_700Bold,
  });
  const [monoLoaded] = useMonoFonts({
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });

  const [booted, setBooted] = useState(false);
  const [gates, setGates] = useState<BootGates>(() =>
    Object.fromEntries(BOOT_GATES.map((g) => [g.id, false]))
  );

  const socket = getSocket();

  useEffect(() => {
    const advanceGate = (id: string) => {
      setGates((prev) => ({ ...prev, [id]: true }));
    };

    socket.on('connect', () => {
      advanceGate('socket');
    });

    socket.on('settings', () => {
      advanceGate('settings');
    });

    socket.on('chat_history', () => {
      advanceGate('history');
    });

    socket.on('integration_test_result', () => {
      advanceGate('integrations');
    });

    // Se não tiver resposta das integrações em 5s, avança mesmo assim
    const intTimer = setTimeout(() => advanceGate('integrations'), 5000);

    // Se socket não conectar em 8s, marca todas e vai em frente
    const fallbackTimer = setTimeout(() => {
      setGates(Object.fromEntries(BOOT_GATES.map((g) => [g.id, true])));
    }, 8000);

    return () => {
      clearTimeout(intTimer);
      clearTimeout(fallbackTimer);
      socket.off('connect');
      socket.off('settings');
      socket.off('chat_history');
      socket.off('integration_test_result');
    };
  }, []);

  if (!quicksandLoaded || !monoLoaded) {
    return <View style={styles.root} />;
  }

  if (!booted) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <BootScreen gates={gates} onComplete={() => setBooted(true)} />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <MainScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});
