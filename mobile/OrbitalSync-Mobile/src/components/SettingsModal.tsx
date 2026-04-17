import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, BACKEND_IP, BACKEND_PORT, TYPOGRAPHY } from '../constants/config';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  settings: Record<string, any>;
  onUpdateSetting: (key: string, value: any) => void;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}

interface SettingRowProps {
  label: string;
  description?: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        {description && <Text style={styles.settingDesc}>{description}</Text>}
      </View>
      <View style={styles.settingControl}>{children}</View>
    </View>
  );
}

export default function SettingsModal({
  visible,
  onClose,
  settings,
  onUpdateSetting,
  connectionStatus,
}: SettingsModalProps) {
  const statusColor =
    connectionStatus === 'connected'
      ? COLORS.accent
      : connectionStatus === 'connecting'
      ? COLORS.warn
      : COLORS.danger;

  const statusLabel =
    connectionStatus === 'connected'
      ? 'Conectado'
      : connectionStatus === 'connecting'
      ? 'Conectando...'
      : 'Desconectado';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <LinearGradient
            colors={['rgba(9,9,11,0.98)', '#000000']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />

          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Configurações</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
                <Text style={styles.statusAddr}>
                  {' '}· {BACKEND_IP}:{BACKEND_PORT}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>BACKEND</Text>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.warn} />
              <Text style={styles.infoText}>
                Para mudar o IP do backend, edite{'\n'}
                <Text style={styles.monoText}>src/constants/config.ts</Text>
                {'\n'}e recompile o app.
              </Text>
            </View>

            <Text style={styles.sectionTitle}>ÁUDIO</Text>
            <SettingRow
              label="Detecção de voz (VAD)"
              description="Inicia/para o áudio automaticamente pela voz"
            >
              <Switch
                value={settings?.voice_detection ?? true}
                onValueChange={(v) => onUpdateSetting('voice_detection', v)}
                trackColor={{ false: COLORS.border, true: COLORS.orbPrimary }}
                thumbColor={COLORS.textPrimary}
              />
            </SettingRow>

            <SettingRow
              label="TTS (voz da IA)"
              description="A IA fala as respostas em voz alta"
            >
              <Switch
                value={settings?.tts_enabled ?? true}
                onValueChange={(v) => onUpdateSetting('tts_enabled', v)}
                trackColor={{ false: COLORS.border, true: COLORS.orbPrimary }}
                thumbColor={COLORS.textPrimary}
              />
            </SettingRow>

            <Text style={styles.sectionTitle}>FERRAMENTAS</Text>
            <SettingRow
              label="Confirmação de tools"
              description="Pedir confirmação antes de executar ferramentas"
            >
              <Switch
                value={settings?.confirm_tools ?? true}
                onValueChange={(v) => onUpdateSetting('confirm_tools', v)}
                trackColor={{ false: COLORS.border, true: COLORS.orbPrimary }}
                thumbColor={COLORS.textPrimary}
              />
            </SettingRow>

            <Text style={styles.sectionTitle}>SOBRE</Text>
            <View style={styles.aboutBox}>
              <Text style={styles.aboutTitle}>ATHENAS · OrbitalSync Mobile</Text>
              <Text style={styles.aboutText}>Interface mobile para o assistente de IA.</Text>
              <Text style={styles.aboutText}>Backend: {BACKEND_IP}:{BACKEND_PORT}</Text>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    height: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontFamily: TYPOGRAPHY.sans,
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontFamily: TYPOGRAPHY.sans,
  },
  statusAddr: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: TYPOGRAPHY.monoMedium,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  sectionTitle: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: TYPOGRAPHY.mono,
    letterSpacing: 3,
    marginTop: 24,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontFamily: TYPOGRAPHY.sans,
  },
  settingDesc: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: TYPOGRAPHY.sansMedium,
    marginTop: 2,
  },
  settingControl: {
    flexShrink: 0,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: 10,
    padding: 14,
  },
  infoText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    flex: 1,
    lineHeight: 20,
  },
  monoText: {
    color: COLORS.orbGlow,
    fontFamily: TYPOGRAPHY.mono,
    fontSize: 12,
  },
  aboutBox: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  aboutTitle: {
    color: COLORS.orbGlow,
    fontSize: 14,
    fontFamily: TYPOGRAPHY.sans,
    letterSpacing: 2,
  },
  aboutText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: TYPOGRAPHY.sansMedium,
  },
});
