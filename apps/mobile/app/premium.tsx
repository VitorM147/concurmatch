// Paywall. A cobrança real entra via assinatura das lojas (Apple/Google) —
// recomendado RevenueCat, que grava o direito em public.entitlements por webhook.
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Button, H1, Highlight, P, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { brand } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const PERKS = [
  [`${brand.premiumActions} ações por dia`, `Curtir e passar: ${brand.premiumActions} por dia, contra ${brand.freeActions} no grátis.`],
  [`${brand.premiumMessages} curtidas com mensagem por dia`, `No grátis são ${brand.freeMessages}. Chame atenção antes do match.`],
  ['Veja quem curtiu você', 'Dê match direto, sem esperar o card aparecer.'],
  ['Voltar o último perfil', 'Passou sem querer? Desfaça.'],
  ['Modo Lotação ampliado', 'Veja mais gente da cidade onde você vai ser lotado(a).'],
];

export default function Premium() {
  const c = useColors();
  const router = useRouter();
  const { profile } = useSession();
  const verified = !!profile?.verified;
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <H1>Seja <Highlight>Premium</Highlight></H1>
        <P muted>Mais chances de dar ConMatch.</P>
        <View style={{ gap: space.md }}>
          {PERKS.map(([t, d]) => (
            <View key={t} style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: c.border }}>
              <Text style={[font.bodyBold, { color: c.text }]}>{t}</Text>
              <Text style={[font.small, { color: c.textMuted }]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={[font.title, { color: c.text, textAlign: 'center' }]}>{brand.premiumPrice}</Text>
        {verified ? (
          <Button title="Em breve" variant="accent" disabled onPress={() => {}} />
        ) : (
          <>
            <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>
              Para a segurança de todo mundo, só perfis verificados podem assinar.
            </Text>
            <Button title="Verificar meu perfil" variant="accent" onPress={() => router.push('/verificacao')} />
          </>
        )}
        <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>
          Renovação automática. Cancele quando quiser nas configurações da loja.
        </Text>
      </ScrollView>
    </Screen>
  );
}
