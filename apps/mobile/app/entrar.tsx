import { useState } from 'react';
import * as Linking from 'expo-linking';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandSymbol, Logo } from '@/components/Brand';
import { Button, Field, H1, Screen } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { strongPassword } from '@/lib/authLinks';
import { brand } from '@/brand';
import { font, palette, radius, space, useColors } from '@/theme';

export default function Entrar() {
  const c = useColors();
  const [mode, setMode] = useState<'login' | 'cadastro' | 'recuperar'>('cadastro');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const strong = strongPassword(password);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || (mode === 'cadastro' && !strong) || (mode === 'login' && !password)) {
      Alert.alert('Confira os dados', mode === 'cadastro'
        ? 'Use um e-mail válido e uma senha com 8+ caracteres, letra maiúscula, minúscula e número.'
        : 'Informe e-mail e senha.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'recuperar') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: Linking.createURL('/auth/callback', { queryParams: { flow: 'recovery' } }),
        });
        if (error) throw error;
        Alert.alert('Confira seu e-mail', 'Se houver uma conta para esse endereço, você receberá um link. Abra-o neste aparelho.');
        setMode('login');
        return;
      }
      const { data, error } = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password,
          options: { emailRedirectTo: Linking.createURL('/auth/callback') } });
      if (error) {
        Alert.alert('Não foi possível continuar',
          // Mensagem genérica: não revela se o e-mail existe (AP-003)
          mode === 'login' ? 'E-mail ou senha incorretos.' : 'Não foi possível criar a conta. Tente novamente em instantes.');
      } else if (mode === 'cadastro' && !data.session) {
        Alert.alert('Confirme seu e-mail', 'Enviamos um link de confirmação. Depois é só entrar.');
        setMode('login');
      }
    } catch { Alert.alert('Não foi possível continuar', 'Confira a conexão e tente novamente em instantes.'); }
    finally { setBusy(false); }
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
              <H1>{mode === 'cadastro' ? 'Criar conta' : mode === 'recuperar' ? 'Recuperar acesso' : 'Entrar'}</H1>
              <Field label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none"
                keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
              {mode !== 'recuperar' ? <Field label="Senha" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete={mode === 'cadastro' ? 'new-password' : 'current-password'}
                hint={mode === 'cadastro' ? 'Mínimo de 8 caracteres, com maiúscula, minúscula e número.' : undefined} /> : null}
              <Button title={mode === 'cadastro' ? 'Criar conta' : mode === 'recuperar' ? 'Enviar link de recuperação' : 'Entrar'} onPress={submit} loading={busy} variant="accent" />
              {mode === 'login' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode('recuperar')}>
                <Text style={[font.body, { color: c.text, textAlign: 'center' }]}>Esqueci minha senha</Text>
              </Pressable> : null}
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setMode(mode === 'login' ? 'cadastro' : 'login')}>
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
