// Verificação de perfil: o servidor sorteia um gesto, a pessoa tira uma selfie
// fazendo o gesto e o suporte compara com as fotos do perfil. Aprovou uma vez,
// vale para sempre. Sem verificação a pessoa só curte e passa.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Button, H1, Highlight, P, Screen } from '@/components/ui';
import { api, ApiError, type ModerationStatus } from '@/lib/api';
import { takeAndUploadSelfie } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { brand } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const PERKS = [
  ['★ Curtir com mensagem', `${brand.freeMessages} por dia no grátis, ${brand.premiumMessages} no Premium.`],
  ['Receber mensagens', 'Quem não verificou não recebe curtidas com mensagem.'],
  ['Conversar depois do match', 'O chat só abre entre dois perfis verificados.'],
  ['Assinar o Premium', `${brand.premiumActions} ações por dia e mais visibilidade.`],
];

export default function Verificacao() {
  const c = useColors();
  const router = useRouter();
  const { session, refreshProfile } = useSession();
  const [st, setSt] = useState<ModerationStatus | null>(null);
  const [gesture, setGesture] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.moderationStatus().then((s) => {
      setSt(s);
      if (s.verification?.status === 'aguardando_selfie') setGesture(s.verification.gesture);
      if (s.verified) refreshProfile();
    }).catch(() => {});
  }, [refreshProfile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const start = async () => {
    setBusy(true);
    try { setGesture((await api.verificationChallenge()).gesture); }
    catch (e) { Alert.alert('Ops', e instanceof ApiError ? e.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  const shoot = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const path = await takeAndUploadSelfie(session.user.id);
      if (!path) return;
      await api.submitVerification(path);
      setGesture(null);
      load();
    } catch (e) {
      Alert.alert('Não foi possível enviar',
        e instanceof Error && e.message === 'CAMERA_DENIED'
          ? 'Libere a câmera nas configurações do celular para tirar a selfie.'
          : e instanceof ApiError ? e.message : 'Tente novamente.');
    } finally { setBusy(false); }
  };

  if (!st) return <Screen style={{ alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.text} /></Screen>;

  const v = st.verification?.status;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        {st.verified ? (
          <>
            <H1>Perfil <Highlight>verificado</Highlight> ✓</H1>
            <P muted>Tudo liberado: curtida com mensagem, conversas e Premium. A verificação vale para sempre.</P>
            <Button title="Voltar" onPress={() => router.back()} />
          </>
        ) : v === 'pendente' ? (
          <>
            <H1>Selfie <Highlight>em análise</Highlight></H1>
            <P muted>Nossa equipe compara a selfie com as fotos do seu perfil, normalmente em até 24 horas. Enquanto isso você pode curtir e passar perfis.</P>
            <Button title="Ok" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <H1>{brand.verifyTitle}</H1>
            <P muted>{brand.verifyPitch}</P>
            {v === 'recusada' ? (
              <Text style={[font.small, { color: c.danger }]}>
                A última selfie não foi aprovada{st.verification?.note ? `: ${st.verification.note}` : ''}. Tente de novo com boa luz e o rosto inteiro.
              </Text>
            ) : null}

            <View style={{ gap: space.md }}>
              {PERKS.map(([t, d]) => (
                <View key={t} style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: c.border }}>
                  <Text style={[font.bodyBold, { color: c.text }]}>{t}</Text>
                  <Text style={[font.small, { color: c.textMuted }]}>{d}</Text>
                </View>
              ))}
            </View>

            {gesture ? (
              <View style={{ gap: space.md, backgroundColor: c.primary, borderRadius: radius.lg, padding: space.xl }}>
                <Text style={[font.label, { color: c.onPrimary, opacity: 0.8 }]}>Faça este gesto na selfie</Text>
                <Text style={[font.h2, { color: c.onPrimary }]}>{gesture}</Text>
                <Text style={[font.small, { color: c.onPrimary, opacity: 0.85 }]}>
                  Rosto inteiro, boa luz, sem óculos escuros. A selfie só é vista pela equipe de segurança e não aparece no seu perfil.
                </Text>
                <Button title="Tirar selfie" variant="accent" onPress={shoot} loading={busy} />
              </View>
            ) : (
              <Button title="Começar verificação" variant="accent" onPress={start} loading={busy} />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
