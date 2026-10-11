// Componentes base do Design System
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type ViewStyle,
} from 'react-native';
import { font, radius, space, useColors } from '@/theme';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger';

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: {
  title: string; onPress: () => void; variant?: Variant; loading?: boolean; disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = { primary: c.primary, accent: c.accent, ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.onPrimary, accent: c.onAccent, ghost: c.text, danger: '#fff' }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={onPress}
      disabled={off}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Text style={[font.small, { color: c.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.textMuted}
        accessibilityLabel={label}
        {...props}
        style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }, props.style]}
      />
      {hint ? <Text style={[font.small, { color: c.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, {
        backgroundColor: selected ? c.accent : c.surface,
        borderColor: selected ? c.accent : c.border,
      }]}
    >
      <Text style={[font.small, { color: selected ? c.onAccent : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup<T extends string | number>({ options, value, onChange, multi }: {
  options: { value: T; label: string }[];
  value: T | T[] | null;
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const isSel = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={styles.chips}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} selected={isSel(o.value)} onPress={() => {
          if (!multi) return onChange(o.value);
          const arr = Array.isArray(value) ? value : [];
          onChange(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value]);
        }} />
      ))}
    </View>
  );
}

export function Screen({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ flex: 1, backgroundColor: c.bg }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text accessibilityRole="header" style={[font.title, { color: c.text }]}>{children}</Text>;
}

export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const c = useColors();
  return <Text style={[font.body, { color: muted ? c.textMuted : c.text, lineHeight: 22 }]}>{children}</Text>;
}

/** Destaque "marca-texto" — assinatura visual do app */
export function Highlight({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={{ backgroundColor: c.accent, color: c.onAccent, fontWeight: '800' }}> {children} </Text>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <H1>{title}</H1>
      {body ? <P muted>{body}</P> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: { height: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.lg, fontSize: 16 },
  chip: { paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderRadius: radius.pill, borderWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
});
