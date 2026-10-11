// Paywall. A cobrança real entra via assinatura das lojas (Apple/Google) —
// recomendado RevenueCat, que grava o direito em public.entitlements por webhook.
import { ScrollView, Text, View } from 'react-native';
import { Button, H1, Highlight, P, Screen } from '@/components/ui';
import { brand } from '@/brand';
import { font, radius, space, useColors } from '@/theme';

const PERKS = [
  ['Curtidas ilimitadas', 'Sem o limite de 20 por dia.'],
  ['Veja quem curtiu você', 'Dê match direto, sem esperar o card aparecer.'],
  ['Voltar o último perfil', 'Passou sem querer? Desfaça.'],
  ['Modo Lotação ampliado', 'Veja mais gente da cidade onde você vai ser lotado(a).'],
];

export default function Premium() {
  const c = useColors();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.xl }}>
        <H1>Seja <Highlight>Premium</Highlight></H1>
        <P muted>Mais chances de dar ConMatch.</P>
        <View style={{ gap: space.md }}>
          {PERKS.map(([t, d]) => (
            <View key={t} style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: c.border }}>
              <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>{t}</Text>
              <Text style={[font.small, { color: c.textMuted }]}>{d}</Text>
            </View>
          ))}
        </View>
        <Text style={[font.title, { color: c.text, textAlign: 'center' }]}>{brand.premiumPrice}</Text>
        <Button title="Em breve" variant="accent" disabled onPress={() => {}} />
        <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>
          Renovação automática. Cancele quando quiser nas configurações da loja.
        </Text>
      </ScrollView>
    </Screen>
  );
}
