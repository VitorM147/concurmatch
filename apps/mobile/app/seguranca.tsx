import { ScrollView, Text, View } from 'react-native';
import { Screen } from '@/components/ui';
import { font, radius, space, useColors } from '@/theme';

const TIPS = [
  ['Conheça antes de encontrar', 'Converse pelo app e faça uma chamada de vídeo antes do primeiro encontro.'],
  ['Primeiro encontro em lugar público', 'Cafés, bibliotecas, shoppings. Avise alguém de confiança onde vai estar.'],
  ['Nunca envie dinheiro', 'Ninguém legítimo pede Pix, empréstimo ou dados bancários. Denuncie na hora.'],
  ['Proteja seus dados', 'Não passe endereço, CPF ou local de trabalho exato nas primeiras conversas.'],
  ['Denunciar é anônimo', 'Toque em ⋯ na conversa. A pessoa é bloqueada na hora e nossa equipe revisa.'],
  ['Emergência', 'Em perigo, ligue 190. Violência contra a mulher: 180.'],
];

export default function Seguranca() {
  const c = useColors();
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.md }}>
        {TIPS.map(([t, d]) => (
          <View key={t} style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, gap: space.xs, borderWidth: 1, borderColor: c.border }}>
            <Text style={[font.body, { color: c.text, fontWeight: '700' }]}>{t}</Text>
            <Text style={[font.small, { color: c.textMuted, lineHeight: 19 }]}>{d}</Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
