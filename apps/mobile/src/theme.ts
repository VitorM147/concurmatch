// Design tokens — identidade "caderno de concurseiro":
// tinta de caneta (azul-marinho), papel e marca-texto (amarelo).
import { useColorScheme } from 'react-native';

const palette = {
  ink: '#14213D',
  ink2: '#2B3A5C',
  paper: '#FAF7F0',
  paperDark: '#0E1424',
  highlighter: '#FFD23F',
  approved: '#1F9D6B',
  rejected: '#D64545',
  white: '#FFFFFF',
};

export const light = {
  bg: palette.paper,
  surface: palette.white,
  surfaceAlt: '#F0ECE2',
  text: palette.ink,
  textMuted: '#5B6680',
  border: '#E2DCCD',
  primary: palette.ink,
  onPrimary: palette.white,
  accent: palette.highlighter,
  onAccent: palette.ink,
  like: palette.approved,
  pass: palette.rejected,
  danger: palette.rejected,
};

export const dark: typeof light = {
  bg: palette.paperDark,
  surface: '#172038',
  surfaceAlt: '#1F2A45',
  text: '#F2EFE6',
  textMuted: '#A3ACC2',
  border: '#2B3754',
  primary: palette.highlighter,
  onPrimary: palette.ink,
  accent: palette.highlighter,
  onAccent: palette.ink,
  like: '#2FC48A',
  pass: '#F06464',
  danger: '#F06464',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 } as const;
export const font = {
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  h2: { fontSize: 20, fontWeight: '700' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
