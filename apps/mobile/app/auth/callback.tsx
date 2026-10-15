import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button, H1, P, Screen } from '@/components/ui';
import { parseAuthCallback } from '@/lib/authLinks';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { space } from '@/theme';

export default function AuthCallback() {
  const url = Linking.useURL();
  const router = useRouter();
  const { setRecovery } = useSession();
  const [error, setError] = useState(false);
  const handled = useRef<{ url: string; result: Promise<boolean> } | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    if (handled.current?.url !== url) handled.current = { url, result: (async () => {
        const link = parseAuthCallback(url, Linking.createURL('/auth/callback'));
        const result = link.code ? await supabase.auth.exchangeCodeForSession(link.code)
          : link.tokenHash && link.type ? await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type })
          : await supabase.auth.setSession({ access_token: link.accessToken!, refresh_token: link.refreshToken! });
        if (result.error || !result.data.session) throw new Error('AUTH_LINK_FAILED');
        return link.recovery;
    })() };
    handled.current.result.then((recovery) => {
      if (alive) { setRecovery(recovery); router.replace(recovery ? '/redefinir-senha' : '/'); }
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [url, router, setRecovery]);
  return <Screen><View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
    <H1>{error ? 'Link inválido ou expirado' : 'Confirmando seu acesso'}</H1>
    {error ? <><P>Solicite um novo link e abra-o neste aparelho.</P>
      <Button title="Voltar ao acesso" onPress={() => router.replace('/entrar')} /></> : <ActivityIndicator />}
  </View></Screen>;
}
