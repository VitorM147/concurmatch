import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandSymbol, Logo } from '@/components/Brand';
import { Button, Field, H1, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { brand } from '@/brand';
import { font, palette, radius, space, useColors } from '@/theme';

export default function Entrar() {
  const c = useColors();
  const [mode, setMode] = useState<'login' | 'cadastro'>('cadastro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const strong = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || (mode === 'cadastro' && !strong) || (mode === 'login' && !password)) {
      Alert.alert('Confira os dados', mode === 'cadastro'
        ? 'Use um e-mail válido e uma senha com 8+ caracteres, letra maiúscula, minúscula e número.'
        : 'Informe e-mail e senha.');
      return;
    }
    setBusy(true);
    const { data, error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      Alert.alert('Não foi possível continuar',
        // Mensagem genérica: não revela se o e-mail existe (AP-003)
        mode === 'login' ? 'E-mail ou senha incorretos.' : 'Não foi possível criar a conta. Tente novamente em instantes.');
    } else if (mode === 'cadastro' && !data.session) {
      Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação. Depois é só entrar.');
      setMode('login');
    }
  };

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.xl }}>
            <View style={{ gap: space.md, backgroundColor: palette.azul, borderRadius: radius.lg, padding: space.xl }}>
              <BrandSymbol size={56} />
              <Logo size={40} onDark />
              <Text style={[font.body, { color: palette.azulClaro, lineHeight: 22 }]}>{brand.tagline}</Text>
            </View>

            <View style={{ gap: space.lg }}>
              <H1>{mode === 'cadastro' ? 'Criar conta' : 'Entrar'}</H1>
              <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none"
                keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
              <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete={mode === 'cadastro' ? 'new-password' : 'current-password'}
                hint={mode === 'cadastro' ? 'Mínimo de 8 caracteres, com maiúscula, minúscula e número.' : undefined} />
              <Button title={mode === 'cadastro' ? 'Criar conta' : 'Entrar'} onPress={submit} loading={busy} variant="accent" />
              <Pressable accessibilityRole="button" onPress={() => setMode(mode === 'login' ? 'cadastro' : 'login')}>
                <Text style={[font.body, { color: c.text, textAlign: 'center', textDecorationLine: 'underline' }]}>
                  {mode === 'login' ? 'Ainda não tem conta? Criar conta' : 'Já tem conta? Entrar'}
                </Text>
              </Pressable>
            </View>

            <Text style={[font.small, { color: c.textMuted, textAlign: 'center' }]}>
              Apenas maiores de 18 anos. Ao continuar você concorda com os Termos de Uso e a Política de Privacidade.
            </Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
