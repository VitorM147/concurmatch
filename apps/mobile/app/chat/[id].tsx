// Conversa em tempo real (Supabase Realtime). Independe do Discovery:
// se a descoberta cair, quem já deu match continua conversando.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafetySheet } from '@/components/SafetySheet';
import { Screen } from '@/components/ui';
import { api, ApiError, type Message } from '@/lib/api';
import { useSession } from '@/lib/session';
import { brand } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const ICEBREAKERS = [
  'Qual matéria está tirando seu sono?',
  'Café ou energético na reta final?',
  'Se passar, qual a primeira coisa que vai fazer?',
];

export default function Chat() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const me = session?.user.id ?? '';
  const { id, name, other } = useLocalSearchParams<{ id: string; name: string; other: string }>();

  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [safety, setSafety] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  useEffect(() => {
    let alive = true;
    api.messages(id).then((m) => { if (alive) setMsgs(m); }).catch(() => {});
    api.markRead(id).catch(() => {});
    const unsub = api.subscribeMessages(id, (m) => {
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      if (m.sender_id !== me) api.markRead(id).catch(() => {});
    });
    return () => { alive = false; unsub(); };
  }, [id, me]);

  const send = async (body = text) => {
    const t = body.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const m = await api.send(id, me, t);
      setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText('');
    } catch (e) {
      Alert.alert('Mensagem não enviada', e instanceof ApiError ? e.message : 'Tente novamente.');
    } finally { setSending(false); }
  };

  return (
    <Screen>
      <Stack.Screen options={{
        title: name ?? 'Conversa',
        headerRight: () => (
          <Pressable onPress={() => setSafety(true)} accessibilityLabel="Opções de segurança" hitSlop={12}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: '900' }}>⋯</Text>
          </Pressable>
        ),
      }} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'flex-end', gap: space.md }}>
              <Text style={[font.h2, { color: c.text, textAlign: 'center' }]}>{brand.matchSubtitle}</Text>
              <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>Quebre o gelo:</Text>
              {ICEBREAKERS.map((q) => (
                <Pressable key={q} onPress={() => send(q)}
                  style={[styles.ice, { borderColor: c.border, backgroundColor: c.surface }]}>
                  <Text style={[font.body, { color: c.text }]}>{q}</Text>
                </Pressable>
              ))}
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === me;
            return (
              <View style={[styles.bubble, mine
                ? { alignSelf: 'flex-end', backgroundColor: c.primary }
                : { alignSelf: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }]}>
                <Text style={[font.body, { color: mine ? c.onPrimary : c.text }]}>{item.body}</Text>
                <Text style={[styles.time, { color: mine ? c.onPrimary : c.textMuted }]}>
                  {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {mine && item.read_at ? ' · lida' : ''}
                </Text>
              </View>
            );
          }}
        />

        <View style={[styles.composer, { borderTopColor: c.border, paddingBottom: insets.bottom + space.sm, backgroundColor: c.bg }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Mensagem"
            placeholderTextColor={c.textMuted}
            multiline
            maxLength={2000}
            accessibilityLabel="Escrever mensagem"
            style={[styles.input, { backgroundColor: c.surface, color: c.text, borderColor: c.border }]}
          />
          <Pressable onPress={() => send()} disabled={!text.trim() || sending} accessibilityLabel="Enviar"
            style={[styles.send, { backgroundColor: c.accent, opacity: text.trim() ? 1 : 0.4 }]}>
            <Text style={{ color: c.onAccent, fontWeight: '900', fontSize: 18 }}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SafetySheet visible={safety} targetId={other} targetName={name ?? 'esta pessoa'} matchId={id}
        onClose={() => setSafety(false)} onDone={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, gap: 2 },
  time: { fontSize: 11, opacity: 0.7, alignSelf: 'flex-end' },
  ice: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
