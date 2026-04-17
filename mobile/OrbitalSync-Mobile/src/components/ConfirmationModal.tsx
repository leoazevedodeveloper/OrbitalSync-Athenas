import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, TYPOGRAPHY } from '../constants/config';

export interface ToolConfirmation {
  tool_name: string;
  description?: string;
  args?: Record<string, any>;
}

interface ConfirmationModalProps {
  confirmation: ToolConfirmation | null;
  onConfirm: () => void;
  onDeny: () => void;
}

export default function ConfirmationModal({ confirmation, onConfirm, onDeny }: ConfirmationModalProps) {
  if (!confirmation) return null;

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
  };

  const handleDeny = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    onDeny();
  };

  return (
    <Modal visible animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={[COLORS.bgPanel, COLORS.bgCard]}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
          <View style={styles.iconRow}>
            <LinearGradient colors={['#78350f', '#92400e']} style={styles.iconBg}>
              <Ionicons name="warning-outline" size={22} color={COLORS.warn} />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Confirmar Ação</Text>

          <View style={styles.toolBadge}>
            <Ionicons name="code-slash-outline" size={14} color={COLORS.orbGlow} />
            <Text style={styles.toolName}>{confirmation.tool_name}</Text>
          </View>

          {confirmation.description && (
            <Text style={styles.description}>{confirmation.description}</Text>
          )}

          {confirmation.args && Object.keys(confirmation.args).length > 0 && (
            <ScrollView style={styles.argsBox} nestedScrollEnabled>
              {Object.entries(confirmation.args).map(([k, v]) => (
                <View key={k} style={styles.argRow}>
                  <Text style={styles.argKey}>{k}:</Text>
                  <Text style={styles.argValue} numberOfLines={3}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.btnRow}>
            <TouchableOpacity onPress={handleDeny} style={styles.denyBtn} activeOpacity={0.75}>
              <Text style={styles.denyText}>Negar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} activeOpacity={0.75} style={styles.confirmBtnOuter}>
              <LinearGradient
                colors={['#047857', '#065f46']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmText}>Confirmar</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    overflow: 'hidden',
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 14,
  },
  iconRow: {
    alignItems: 'center',
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontFamily: TYPOGRAPHY.sans,
    textAlign: 'center',
    letterSpacing: 1,
  },
  toolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(8,145,178,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.35)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'center',
  },
  toolName: {
    color: COLORS.orbGlow,
    fontSize: 13,
    fontFamily: TYPOGRAPHY.mono,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontFamily: TYPOGRAPHY.sansMedium,
    textAlign: 'center',
    lineHeight: 21,
  },
  argsBox: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    padding: 12,
    maxHeight: 150,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  argRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 2,
  },
  argKey: {
    color: COLORS.orbGlow,
    fontSize: 12,
    fontFamily: TYPOGRAPHY.mono,
    flexShrink: 0,
  },
  argValue: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontFamily: TYPOGRAPHY.sansMedium,
    flex: 1,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  denyBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
  },
  denyText: {
    color: COLORS.danger,
    fontSize: 15,
    fontFamily: TYPOGRAPHY.sans,
  },
  confirmBtnOuter: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  confirmBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: TYPOGRAPHY.sans,
  },
});
