// Ações de segurança: denunciar (já bloqueia), bloquear, desfazer match.
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/api';
import { reportReasons } from '@/brand';
import { font, radius, space, useColors } from '@/theme';
import { Button, ChipGroup, Field } from './ui';

export function SafetySheet({ visible, targetId, targetName, matchId, onClose, onDone }: {
  visible: boolean; targetId: string; targetName: string; matchId?: string;
  onClose: () => void; onDone: () => void;
}) {
  const c = useColors();
  const [mode, setMode] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => { setMode('menu'); setReason(null); setDetails(''); onClose(); };

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); Alert.alert('Pronto', msg); close(); onDone(); }
    catch (e: any) { Alert.alert('Ops', e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar" />
      <View style={[styles.sheet, { backgroundColor: c.surface }]}>
        {mode === 'menu' ? (
          <View style={{ gap: space.md }}>
            <Text style={[font.h2, { color: c.text }]}>Segurança</Text>
            <Button title={`Denunciar ${targetName}`} variant="danger" onPress={() => setMode('report')} />
            <Button title="Bloquear" variant="ghost" loading={busy}
              onPress={() => run(() => api.block(targetId), `${targetName} não vai mais ver você nem falar com você.`)} />
            {matchId ? (
              <Button title="Desfazer match" variant="ghost" loading={busy}
                onPress={() => run(() => api.unmatch(matchId), 'Match desfeito.')} />
            ) : null}
            <Button title="Cancelar" variant="ghost" onPress={close} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ gap: space.md }}>
            <Text style={[font.h2, { color: c.text }]}>Qual o problema?</Text>
            <Text style={[font.small, { color: c.textMuted }]}>
              A denúncia é anônima e também bloqueia a pessoa. Nossa equipe revisa cada caso.
            </Text>
            <ChipGroup options={reportReasons} value={reason} onChange={setReason} />
            <Field label="Detalhes (opcional)" value={details} onChangeText={setDetails} multiline maxLength={1000}
              style={{ height: 96, textAlignVertical: 'top', paddingTop: space.md }} />
            <Button title="Enviar denúncia" variant="danger" disabled={!reason} loading={busy}
              onPress={() => run(() => api.report(targetId, reason!, details, matchId),
                'Denúncia recebida. Obrigado por manter a comunidade segura.')} />
            <Button title="Voltar" variant="ghost" onPress={() => setMode('menu')} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { padding: space.xl, paddingBottom: space.xxl + space.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: '85%' },
});
