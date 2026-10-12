import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic } from '@expo-google-fonts/playfair-display';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SessionProvider, useSession } from '@/lib/session';
import { fonts, useColors } from '@/theme';

// Guarda de rotas: sem sessão → /entrar; sem perfil ou sem foto → /onboarding; senão → app
function Gate() {
  const { ready, session, profile, hasPhoto } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
    PlayfairDisplay_700Bold, PlayfairDisplay_700Bold_Italic,
  });

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

  // Se a fonte falhar, segue com a do sistema em vez de travar na abertura
  if (!ready || (!fontsLoaded && !fontError)) {
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
      headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
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
