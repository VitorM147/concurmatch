// Ícones das abas (traço simples, herdam a cor da aba)
import type { ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

const PATHS: Record<string, string> = {
  descobrir: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Zm3.5 5.5l-2 5l-5 2l2-5l5-2Z',
  conexoes: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  mensagens: 'M4 5h16v11H9l-5 4V5Z',
  perfil: 'M4 20c0-4 3.6-6 8-6s8 2 8 6',
};

export function TabIcon({ name, color, size = 24 }: { name: keyof typeof PATHS; color: ColorValue; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round">
      <Path d={PATHS[name]} />
      {name === 'perfil' ? <Circle cx={12} cy={8} r={4} /> : null}
    </Svg>
  );
}
