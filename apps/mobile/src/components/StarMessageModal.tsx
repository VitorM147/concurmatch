// Botão estrela: curtir com uma mensagem de até 100 caracteres.
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { brand } from '@/brand';
import type { Candidate } from '@/lib/api';
import { font, fonts, radius, space, useColors } from '@/theme';
import { Button } from './ui';

// Mesma regra do servidor (like_message_allowed): aviso imediato, o banco decide.
const BLOCKED = [
  /(https?:\/\/|www\.)/i,
  /[a-z0-9-]+\.(com|br|net|org|me|io|app|link|ly|gg|xyz|site|online|info)\b/i,
  /[a-z0-9._%+-]+@[a-z0-9.-]+/i,
  /(^|\s)@[a-z0-9._]{2,}/i,
  /([0-9][\s().+-]*){8,}/,
];
export const messageProblem = (t: string) =>
  BLOCKED.some((r) => r.test(t)) ? 'Sem links, e-mails, @perfis ou telefone por aqui.' : null;

export function StarMessageModal({ who, onSend, onClose }: {
  who: Candidate | null;
  onSend: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const c = useColors();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { if (who) setText(''); }, [who?.id]);

  const clean = text.replace(/\s+/g, ' ').trim();
  const problem = clean ? messageProblem(clean) : null;
  const max = brand.starMax;

  const send = async () => {
    if (!clean || problem) return;
    setSending(true);
    try { await onSend(clean); } finally { setSending(false); }
  };

  return (
    <Modal visible={!!who} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
        <View style={[styles.sheet, { backgroundColor: c.bg }]}>
          <View style={[styles.grabber, { backgroundColor: c.border }]} />
          <Text style={[font.h2, { color: c.text }]} accessibilityRole="header">
            {brand.starTitle}{who ? ` para ${who.display_name}` : ''}
          </Text>
          <Text style={[font.small, { color: c.textMuted, lineHeight: 18 }]}>{brand.starHint}</Text>

          <TextInput
            value={text}
            onChangeText={(t) => setText(t.slice(0, max))}
            maxLength={max}
            multiline
            autoFocus
            placeholder={brand.starPlaceholder}
            placeholderTextColor={c.textMuted}
            accessibilityLabel="Sua mensagem"
            accessibilityHint={`Até ${max} caracteres`}
            style={[styles.input, { backgroundColor: c.surface, borderColor: problem ? c.danger : c.border, color: c.text }]}
          />
          <View style={styles.meta}>
            <Text style={[font.small, { color: c.danger, flex: 1 }]}>{problem ?? ''}</Text>
            <Text style={[font.small, { color: text.length >= max ? c.danger : c.textMuted }]}
              accessibilityLabel={`${text.length} de ${max} caracteres`}>
              {text.length}/{max}
            </Text>
          </View>

          <Button title="Enviar curtida com mensagem" onPress={send} loading={sending}
            disabled={!clean || !!problem} />
          <Button title="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(11,37,69,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: space.xl, paddingBottom: space.xxl, gap: space.md,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: space.xs },
  input: {
    minHeight: 96, borderWidth: 1, borderRadius: radius.md, padding: space.lg,
    fontSize: 16, fontFamily: fonts.regular, textAlignVertical: 'top',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
