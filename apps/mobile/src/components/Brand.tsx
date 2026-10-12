// Símbolo (duas pessoas formando um coração) e logotipo "ConMatch".
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { brand } from '@/brand';
import { fonts, palette, useColors } from '@/theme';

// Metade esquerda e direita do coração; cada uma com sua "cabeça".
const LEFT = 'M50 92 C28 76 10 62 10 46 C10 36 18 29 28 29 C38 29 46 35 50 42 Z';
const RIGHT = 'M50 92 C72 76 90 62 90 46 C90 36 82 29 72 29 C62 29 54 35 50 42 Z';

export function BrandSymbol({ size = 32, left = palette.claro, right = palette.rosa, outline }: {
  size?: number; left?: string; right?: string; outline?: string;
}) {
  const stroke = outline ? { stroke: outline, strokeWidth: 3 } : {};
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no">
      <Circle cx={28} cy={16} r={9} fill={left} {...stroke} />
      <Circle cx={72} cy={16} r={9} fill={right} {...stroke} />
      <Path d={LEFT} fill={left} {...stroke} />
      <Path d={RIGHT} fill={right} {...stroke} />
    </Svg>
  );
}

/** "Con" reto + "Match" itálico + símbolo */
export function Logo({ size = 24, color, onDark }: { size?: number; color?: string; onDark?: boolean }) {
  const c = useColors();
  const fg = color ?? (onDark ? palette.claro : c.primary);
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel={brand.name}>
      <Text style={[styles.word, { color: fg, fontSize: size, fontFamily: fonts.display }]}>Con</Text>
      <Text style={[styles.word, { color: fg, fontSize: size, fontFamily: fonts.displayItalic }]}>Match</Text>
      <View style={{ marginLeft: size * 0.18, marginTop: -size * 0.3 }}>
        <BrandSymbol size={size * 0.7} left={onDark ? palette.claro : c.surface} right={palette.rosa}
          outline={onDark ? undefined : fg} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  word: { includeFontPadding: false },
});
