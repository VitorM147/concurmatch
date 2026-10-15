import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthCallback, strongPassword } from '../src/lib/authLinks.ts';
import { mergeMessages } from '../src/lib/messageHistory.ts';
const base = 'conmatch://auth/callback';

test('callback aceita confirmação e recuperação em fragmento, token hash ou PKCE', () => {
  assert.deepEqual(parseAuthCallback(`${base}#access_token=access&refresh_token=refresh&type=recovery`, base),
    { recovery: true, accessToken: 'access', refreshToken: 'refresh' });
  assert.deepEqual(parseAuthCallback(`${base}?token_hash=hash&type=signup`, base),
    { recovery: false, tokenHash: 'hash', type: 'signup' });
  assert.deepEqual(parseAuthCallback(`${base}?code=pkce&flow=recovery`, base), { recovery: true, code: 'pkce' });
});

test('callback rejeita domínio, rota, tokens incompletos, erros e parâmetros ambíguos', () => {
  for (const url of [
    'https://evil.invalid/auth/callback?code=abc', 'conmatch://outro/callback?code=abc',
    `${base}#access_token=sem-refresh`, `${base}?error_code=otp_expired`,
    `${base}?type=signup#type=recovery&token_hash=hash`, `${base}?code=a&code=b`,
  ]) assert.throws(() => parseAuthCallback(url, base));
});

test('regra de senha é a mesma no cadastro e na redefinição', () => {
  for (const weak of ['a', 'abcdefgh', 'Abcdefgh', '12345678']) assert.equal(strongPassword(weak), false);
  assert.equal(strongPassword('UmaSenha123'), true);
});

test('histórico une páginas e realtime sem duplicar nem perder confirmação de leitura', () => {
  const current = [{ id: 2, body: 'segunda', read_at: '2026-10-15' }];
  const merged = mergeMessages(current, [
    { id: 3, body: 'terceira', read_at: null }, { id: 1, body: 'primeira', read_at: null },
    { id: 2, body: 'segunda', read_at: null },
  ]);
  assert.deepEqual(merged.map((m) => m.id), [1, 2, 3]);
  assert.equal(merged[1].read_at, '2026-10-15');
  assert.equal(mergeMessages(merged, [{ id: 3, body: 'terceira', read_at: 'agora' }])[2].read_at, 'agora');
});
