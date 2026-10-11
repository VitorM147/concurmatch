import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '@/lib/session';
import { useColors } from '@/theme';

// Guarda de rotas: sem sessão → /entrar; sem perfil ou sem foto → /onboarding; senão → app
function Gate() {
  const { ready, session, profile, hasPhoto } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (!ready) return;
    const root = segments[0];
    if (!session) {
      if (root !== 'entrar') router.replace('/entrar');
    } else if (!profile || !hasPhoto) {
      if (root !== 'onboarding') router.replace('/onboarding');
    } else if (root === 'entrar' || root === 'onboarding') {
      router.replace('/');
    }
  }, [ready, session, profile, hasPhoto, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: c.bg },
      headerTintColor: c.text,
      headerShadowVisible: false,
      contentStyle: { backgroundColor: c.bg },
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="entrar" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: '' }} />
      <Stack.Screen name="premium" options={{ presentation: 'modal', title: 'Premium' }} />
      <Stack.Screen name="seguranca" options={{ title: 'Central de segurança' }} />
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
