import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, H1, P, Screen } from '@/components/ui';
import { SessionProvider, useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { fonts, useColors } from '@/theme';

// Guarda de rotas: sem sessão → /entrar; sem perfil ou sem foto → /onboarding; senão → app
function Gate() {
  const { ready, session, profile, hasPhoto, profileError, refreshProfile, recovery } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic,
  });

  useEffect(() => {
    if (!ready || profileError) return;
    const root = segments[0];
    if (root === 'auth') return;
    if (recovery && session) {
      if (root !== 'redefinir-senha') router.replace('/redefinir-senha');
      return;
    }
    if (!session) {
      if (root !== 'entrar' && root !== 'redefinir-senha') router.replace('/entrar');
    } else if (!profile || !hasPhoto) {
      if (root !== 'onboarding') router.replace('/onboarding');
    } else if (root === 'entrar' || root === 'onboarding') {
      router.replace('/');
    }
  }, [ready, session, profile, hasPhoto, profileError, recovery, segments, router]);

  // Se a fonte falhar, segue com a do sistema em vez de travar na abertura
  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  if (profileError && segments[0] !== 'auth') return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <H1>Não conseguimos carregar seu perfil</H1>
      <P>Confira a conexão e tente novamente. Seu cadastro foi preservado.</P>
      <Button title="Tentar novamente" onPress={refreshProfile} />
    </View>
  </Screen>;

  if (session && profile?.banned_at && segments[0] !== 'auth' && !recovery) return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
      <H1>Conta indisponível</H1>
      <P>Se você solicitou a exclusão, ela está sendo processada. Para outros casos, entre em contato com o suporte.</P>
      <Button title="Sair" onPress={() => supabase.auth.signOut({ scope: 'local' })} />
    </View>
  </Screen>;

  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.bg },
      headerTintColor: c.text,
      headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: c.bg },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="auth/callback" options={{ title: 'Confirmar acesso' }} />
      <Stack.Screen name="redefinir-senha" options={{ title: 'Nova senha' }} />
      <Stack.Screen name="entrar" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: '' }} />
      <Stack.Screen name="premium" options={{ presentation: 'modal', title: 'Premium' }} />
      <Stack.Screen name="seguranca" options={{ title: 'Central de segurança' }} />
      <Stack.Screen name="verificacao" options={{ title: 'Verificação' }} />
      <Stack.Screen name="analise" options={{ title: 'Perfil em análise' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Gate />
    </SessionProvider>
  );
}
