// FE-001 (ESAA-Security): a sessão do Supabase (access + refresh token) fica no
// Keychain (iOS) / Keystore (Android) via expo-secure-store, não no AsyncStorage,
// que é texto puro no aparelho.
// O SecureStore recomenda valores de até 2 KB e a sessão passa disso, então o
// valor é dividido em pedaços: <chave>.n guarda a quantidade, <chave>.0..n-1 os pedaços.
import * as SecureStore from 'expo-secure-store';

const CHUNK = 1800;
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore só aceita [A-Za-z0-9._-] na chave
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function removeChunks(base: string) {
  const count = Number(await SecureStore.getItemAsync(`${base}.n`, OPTS)) || 0;
  await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${base}.${i}`, OPTS)));
  await SecureStore.deleteItemAsync(`${base}.n`, OPTS);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safe(key);
    const count = Number(await SecureStore.getItemAsync(`${base}.n`, OPTS));
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${base}.${i}`, OPTS)),
    );
    if (parts.some((p) => p === null)) {
      await removeChunks(base);      // gravação interrompida: descarta e força novo login
      return null;
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safe(key);
    await removeChunks(base);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${base}.${i}`, p, OPTS)));
    await SecureStore.setItemAsync(`${base}.n`, String(parts.length), OPTS);
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(safe(key));
  },
};
