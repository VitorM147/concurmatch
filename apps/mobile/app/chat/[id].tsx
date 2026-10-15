// Conversa em tempo real (Supabase Realtime). Independe do Discovery:
// se a descoberta cair, quem já deu match continua conversando.
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafetySheet } from '@/components/SafetySheet';
import { Button, Screen } from '@/components/ui';
import { api, ApiError, type Message } from '@/lib/api';
import { mergeMessages } from '@/lib/messageHistory';
import { useSession } from '@/lib/session';
import { brand, chatSuggestions } from '@/brand';
import { font, fonts, radius, space, useColors } from '@/theme';

export default function Chat() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useSession();
  const me = session?.user.id ?? '';
  const { id, name, other } = useLocalSearchParams<{ id: string; name: string; other: string }>();

  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [safety, setSafety] = useState(false);
  // Chat só entre dois perfis verificados
  const [otherLocked, setOtherLocked] = useState(false);
  const meLocked = !profile?.verified;
  const list = useRef<FlatList<Message>>(null);

  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const syncRef = useRef<() => void>(() => {});
  const newest = useRef(0);
  const scrollToLatest = useRef(true);

  useEffect(() => {
    let alive = true, syncing = false, needsSync = false;
    setMsgs([]); newest.current = 0; setLoading(true); setHistoryError(false); setHasOlder(false);
    const receive = (messages: Message[]) => {
      if (!alive) return;
      newest.current = Math.max(newest.current, ...messages.map((m) => m.id));
      setMsgs((previous) => mergeMessages(previous, messages));
    };
    const sync = async () => {
      if (!alive) return;
      if (syncing) { needsSync = true; return; }
      syncing = true;
      try {
        if (!newest.current) {
          const page = await api.messages(id);
          if (alive) setHasOlder(page.length === 50);
          receive(page);
        } else {
          // Repair gaps after reconnect, not just the last 50 messages.
          let cursor = newest.current;
          while (alive) {
            const page = await api.messagesSince(id, cursor);
            receive(page);
            if (page.length < 100) break;
            cursor = page[page.length - 1].id;
          }
          // Refresh read receipts for the recent page as well.
          receive(await api.messages(id));
        }
        await api.markRead(id);
        if (alive) { setHistoryError(false); setOtherLocked(false); }
      } catch { if (alive) setHistoryError(true); }
      finally {
        syncing = false; if (alive) setLoading(false);
        if (needsSync && alive) { needsSync = false; void sync(); }
      }
    };
    syncRef.current = () => { void sync(); };
    const unsub = api.subscribeMessages(id, (message) => {
      // Realtime must not advance the catch-up cursor while a gap is being repaired.
      if (alive) setMsgs((previous) => mergeMessages(previous, [message]));
      if (message.sender_id !== me && !message.read_at) api.markRead(id).catch(() => { if (alive) setHistoryError(true); });
    }, () => { void sync(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    void sync();
    return () => { alive = false; unsub(); appState.remove(); };
  }, [id, me]);

  const loadOlder = async () => {
    if (loadingOlder || !msgs.length || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const page = await api.messages(id, msgs[0].id);
      setMsgs((previous) => mergeMessages(previous, page));
      setHasOlder(page.length === 50);
    } catch { Alert.alert('Não foi possível carregar o histórico', 'Tente novamente.'); }
    finally { setLoadingOlder(false); }
  };

  const send = async (body = text) => {
    const t = body.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const m = await api.send(id, me, t);
      setMsgs((prev) => mergeMessages(prev, [m]));
      list.current?.scrollToOffset({ offset: 0, animated: true });
      setText('');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'OTHER_NOT_VERIFIED') setOtherLocked(true);
      else if (e instanceof ApiError && e.code === 'VERIFICATION_REQUIRED') router.push('/verificacao');
      else Alert.alert('Mensagem não enviada', e instanceof ApiError ? e.message : 'Tente novamente.');
    } finally { setSending(false); }
  };

  return (
    <Screen>
      <Stack.Screen options={{
        title: name ?? 'Conversa',
        headerRight: () => (
          <Pressable onPress={() => setSafety(true)} accessibilityLabel="Opções de segurança" hitSlop={12}>
            <Text style={{ color: c.text, fontSize: 22, fontFamily: fonts.bold }}>⋯</Text>
          </Pressable>
        ),
      }} />

      {historyError ? <View style={{ padding: space.md, gap: space.sm }}>
        <Text style={[font.small, { color: c.text }]}>Não conseguimos sincronizar a conversa. Suas mensagens foram preservadas.</Text>
        <Button title="Tentar sincronizar" variant="ghost" onPress={() => syncRef.current()} />
      </View> : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          ref={list}
          inverted
          data={[...msgs].reverse()}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: space.lg, gap: space.sm, flexGrow: 1 }}
          onScroll={(event) => { scrollToLatest.current = event.nativeEvent.contentOffset.y < 100; }}
          onContentSizeChange={() => { if (scrollToLatest.current) list.current?.scrollToOffset({ offset: 0 }); }}
          ListFooterComponent={hasOlder ? <Button title="Carregar mensagens anteriores" variant="ghost" onPress={loadOlder} loading={loadingOlder} /> : null}
          ListEmptyComponent={loading ? <ActivityIndicator /> :
            <View style={{ flex: 1, justifyContent: 'flex-end', gap: space.sm, paddingBottom: space.lg }}>
              <Text style={[font.h2, { color: c.text, textAlign: 'center' }]}>{brand.matchSubtitle}</Text>
              <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>{brand.matchCta}</Text>
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

        {meLocked || otherLocked ? (
          <View style={[styles.lock, { backgroundColor: c.surfaceAlt, paddingBottom: insets.bottom + space.lg }]}>
            <Text style={[font.bodyBold, { color: c.text, textAlign: 'center' }]}>
              {meLocked ? 'Verifique seu perfil para conversar' : `${name ?? 'Essa pessoa'} ainda não verificou o perfil`}
            </Text>
            <Text style={[font.small, { color: c.textMuted, textAlign: 'center', lineHeight: 18 }]}>
              {meLocked
                ? 'No ConMatch, só perfis verificados conversam. Leva um minuto: um gesto e uma selfie.'
                : 'A conversa abre assim que a verificação for concluída. Assim as duas pessoas sabem com quem estão falando.'}
            </Text>
            {meLocked ? <Button title="Verificar meu perfil" variant="accent" onPress={() => router.push('/verificacao')} /> : null}
          </View>
        ) : null}

        {!(meLocked || otherLocked) && msgs.length < 3 ? (
          <View style={{ gap: space.xs, paddingTop: space.sm }}>
            <Text style={[font.label, { color: c.textMuted, paddingHorizontal: space.lg }]}>Sugestões para conversar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm }}>
              {chatSuggestions.map((q) => (
                <Pressable key={q} onPress={() => setText(q)} accessibilityRole="button"
                  accessibilityHint="Coloca a sugestão no campo de mensagem"
                  style={[styles.ice, { backgroundColor: c.chip }]}>
                  <Text style={[font.small, { color: c.onChip }]}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {meLocked || otherLocked ? null : <View style={[styles.composer, { borderTopColor: c.border, paddingBottom: insets.bottom + space.sm, backgroundColor: c.bg }]}>
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
            style={[styles.send, { backgroundColor: c.primary, opacity: text.trim() ? 1 : 0.4 }]}>
            <Text style={{ color: c.onPrimary, fontFamily: fonts.bold, fontSize: 18 }}>↑</Text>
          </Pressable>
        </View>}
      </KeyboardAvoidingView>

      <SafetySheet visible={safety} targetId={other} targetName={name ?? 'esta pessoa'} matchId={id}
        onClose={() => setSafety(false)} onDone={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.sm + 2, gap: 2 },
  time: { fontSize: 11, opacity: 0.7, alignSelf: 'flex-end' },
  ice: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingTop: 12, paddingBottom: 12, fontSize: 16, fontFamily: fonts.regular },
  lock: { padding: space.xl, gap: space.sm },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
