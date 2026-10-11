import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { secureStorage } from './secureStorage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Configure EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY no arquivo .env');
}

// CR-001 — nada de HTTP em claro (exceto Supabase local em desenvolvimento)
const isLocalDev = __DEV__ && /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?$/.test(url);
if (!url.startsWith('https://') && !isLocalDev) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL precisa usar https://');
}

// SC-002 — a chave do app é pública por design (a segurança está no RLS),
// mas a chave de serviço NUNCA pode ir para o aplicativo.
function assertPublicKey(key: string) {
  if (key.startsWith('sb_secret_')) throw new Error('Chave secreta do Supabase no app. Use a chave publishable/anon.');
  const payload = key.split('.')[1];
  if (!payload) return;
  try {
    const json = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (json.role === 'service_role') throw new Error('service_role no app. Use a chave anon.');
  } catch (e) {
    if (e instanceof Error && e.message.includes('app')) throw e;
  }
}
assertPublicKey(anonKey);

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Renova o token só com o app em primeiro plano (recomendação do Supabase para RN)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
