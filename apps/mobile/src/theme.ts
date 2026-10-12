// Design tokens — identidade ConMatch, opção "Azul profundo": confiança, foco e modernidade.
// Azul profundo como base, rosa como destaque (o lado romântico), azul claro e cinza como fundo.
// Títulos em Playfair Display, interface em Inter (carregadas em app/_layout.tsx).
import { useColorScheme } from 'react-native';

export const palette = {
  azul: '#0B2545',         // azul profundo — principal
  azulModerno: '#1E40AF',  // secundária
  rosa: '#F43F5E',         // destaque
  azulClaro: '#E0E7FF',    // fundo de chips e áreas de apoio
  claro: '#F8FAFC',        // cinza claro — superfície / texto sobre azul
  grafite: '#1F2937',      // texto
  white: '#FFFFFF',
};

export const light = {
  bg: palette.claro,
  surface: palette.white,
  surfaceAlt: palette.azulClaro,
  text: palette.grafite,
  textMuted: '#4B5563',
  border: '#D6DEF0',
  primary: palette.azul,
  onPrimary: palette.white,
  accent: palette.rosa,
  onAccent: palette.white,
  chip: palette.azulClaro,
  onChip: palette.azul,
  like: palette.rosa,
  star: palette.azul,
  pass: '#64748B',
  danger: '#B91C1C',
};

export const dark: typeof light = {
  bg: '#061629',
  surface: palette.azul,
  surfaceAlt: '#13315C',
  text: palette.claro,
  textMuted: '#B6C2DA',
  border: '#1E3A66',
  primary: palette.claro,
  onPrimary: palette.azul,
  accent: palette.rosa,
  onAccent: palette.white,
  chip: '#13315C',
  onChip: palette.azulClaro,
  like: palette.rosa,
  star: palette.azulClaro,
  pass: '#B6C2DA',
  danger: '#FCA5A5',
};

export type Colors = typeof light;

// Nomes exportados por @expo-google-fonts (cada peso é uma família no Android)
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayItalic: 'PlayfairDisplay_700Bold_Italic',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const font = {
  title: { fontSize: 30, fontFamily: fonts.display, letterSpacing: -0.3 },
  h2: { fontSize: 20, fontFamily: fonts.display },
  body: { fontSize: 16, fontFamily: fonts.regular },
  bodyBold: { fontSize: 16, fontFamily: fonts.semibold },
  small: { fontSize: 13, fontFamily: fonts.medium },
  label: { fontSize: 12, fontFamily: fonts.semibold, letterSpacing: 1, textTransform: 'uppercase' as const },
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
