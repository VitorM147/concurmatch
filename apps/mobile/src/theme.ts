// Design tokens — identidade ConMatch: vinho, rosa antigo, champanhe e marfim.
// Títulos em Playfair Display, interface em Inter (carregadas em app/_layout.tsx).
import { useColorScheme } from 'react-native';

export const palette = {
  vinho: '#6B1E29',        // principal
  rosa: '#B85C6B',         // rosa antigo
  champanhe: '#C9A89A',
  marfim: '#F8F2EC',       // fundo
  vinhoEscuro: '#2E0E14',  // texto
  white: '#FFFFFF',
};

export const light = {
  bg: palette.marfim,
  surface: palette.white,
  surfaceAlt: '#F1E6DD',
  text: palette.vinhoEscuro,
  textMuted: '#7A5A5F',
  border: '#E6D6CC',
  primary: palette.vinho,
  onPrimary: palette.marfim,
  accent: palette.rosa,
  onAccent: palette.white,
  chip: '#F3E4E1',
  onChip: palette.vinho,
  like: palette.vinho,
  star: palette.rosa,
  pass: '#8C7B76',
  danger: '#B3261E',
};

export const dark: typeof light = {
  bg: '#1E0A0E',
  surface: palette.vinhoEscuro,
  surfaceAlt: '#3A161D',
  text: palette.marfim,
  textMuted: '#C9A89A',
  border: '#4A2028',
  primary: palette.marfim,
  onPrimary: palette.vinho,
  accent: '#D27A88',
  onAccent: palette.vinhoEscuro,
  chip: '#4A2028',
  onChip: palette.marfim,
  like: '#E59AA6',
  star: '#D27A88',
  pass: '#C9A89A',
  danger: '#F2B8B5',
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
