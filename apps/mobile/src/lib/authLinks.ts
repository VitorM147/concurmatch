export const strongPassword = (value: string) =>
  value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);

export type AuthCallback = {
  recovery: boolean; code?: string; tokenHash?: string;
  type?: 'signup' | 'email' | 'recovery'; accessToken?: string; refreshToken?: string;
};

/** Only the app's configured callback may establish a session. Never log its URL. */
export function parseAuthCallback(raw: string, expectedRedirect: string): AuthCallback {
  const url = new URL(raw), expected = new URL(expectedRedirect);
  const path = (p: string) => p.replace(/\/$/, '');
  if (url.protocol !== expected.protocol || url.host !== expected.host || path(url.pathname) !== path(expected.pathname)) {
    throw new Error('INVALID_AUTH_CALLBACK');
  }
  const params = new URLSearchParams(url.search);
  const hash = new URLSearchParams(url.hash.slice(1));
  for (const key of params.keys()) if (params.getAll(key).length > 1) throw new Error('INVALID_AUTH_CALLBACK');
  for (const key of hash.keys()) if (hash.getAll(key).length > 1) throw new Error('INVALID_AUTH_CALLBACK');
  for (const [key, value] of hash) {
    if (params.has(key) && params.get(key) !== value) throw new Error('INVALID_AUTH_CALLBACK');
    params.set(key, value);
  }
  if (params.has('error') || params.has('error_code')) throw new Error('AUTH_LINK_EXPIRED');
  const type = params.get('type');
  const recovery = type === 'recovery' || params.get('flow') === 'recovery';
  const code = params.get('code');
  if (code) return { recovery, code };
  const tokenHash = params.get('token_hash');
  if (tokenHash && (type === 'signup' || type === 'email' || type === 'recovery')) return { recovery, tokenHash, type };
  const accessToken = params.get('access_token'), refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { recovery, accessToken, refreshToken };
  throw new Error('INVALID_AUTH_CALLBACK');
}
