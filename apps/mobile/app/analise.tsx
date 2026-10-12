// Perfil em análise: após denúncias, o perfil some do Descobrir até o suporte
// decidir. A pessoa pode mandar a versão dela; o suporte avalia junto com a
// conversa denunciada. Não mostramos quem denunciou nem o motivo.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text } from 'react-native';
import { Button, Field, H1, Highlight, P, Screen } from '@/components/ui';
import { api, ApiError, type ModerationStatus } from '@/lib/api';
import { font, space, useColors } from '@/theme';

export default function Analise() {
  const c = useColors();
  const router = useRouter();
  const [st, setSt] = useState<ModerationStatus | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.moderationStatus().then(setSt).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    if (text.trim().length < 10) return Alert.alert('Conte um pouco mais', 'Escreva pelo menos 10 caracteres.');
    setBusy(true);
    try { await api.submitAppeal(text); setText(''); load(); }
    catch (e) { Alert.alert('Ops', e instanceof ApiError ? e.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  if (!st) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.text} /></Screen>;

  if (!st.under_review) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
          <H1>Tudo <Highlight>certo</Highlight></H1>
          <P muted>{st.appeal?.status === 'aceito'
            ? 'Analisamos o caso e seu perfil voltou a aparecer no Descobrir. Obrigado pela paciência.'
            : 'Seu perfil não está em análise.'}</P>
          <Button title="Voltar" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <H1>Perfil <Highlight>em análise</Highlight></H1>
        <P muted>
          Recebemos denúncias sobre sua conta. Por segurança, seu perfil saiu do Descobrir e as conversas estão pausadas.
          A análise começa na hora: se as denúncias não se confirmarem, seu perfil volta sozinho. Ninguém é banido sem
          análise humana.
        </P>
        {!st.verified ? (
          <>
            <Text style={[font.body, { color: c.text, lineHeight: 22 }]}>
              Se a denúncia foi de perfil falso, verificar seu rosto resolve: o perfil volta na hora da aprovação.
            </Text>
            <Button title="Verificar meu perfil" onPress={() => router.push('/verificacao')} />
          </>
        ) : null}
        {st.appeal?.status === 'aberto' ? (
          <Text style={[font.body, { color: c.text, lineHeight: 22 }]}>
            Recebemos sua explicação. A equipe vai analisar junto com as conversas envolvidas e te responder por aqui.
          </Text>
        ) : st.appeal?.status === 'recusado' ? (
          <Text style={[font.body, { color: c.danger, lineHeight: 22 }]}>
            Analisamos o caso e a suspensão foi mantida. Em caso de dúvida, fale com o suporte.
          </Text>
        ) : (
          <>
            <Field label="Conte o que aconteceu" value={text} onChangeText={setText} multiline maxLength={1000}
              hint={`${text.length}/1000 · a equipe lê junto com o histórico da conversa`}
              style={{ height: 140, paddingTop: 12, textAlignVertical: 'top' }} />
            <Button title="Enviar minha explicação" variant="accent" onPress={send} loading={busy} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
