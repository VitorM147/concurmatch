// Regressões da auditoria ESAA-Security RUN-SEC-0003 (migration 0016).
// Cada teste reproduz uma prova de conceito de security/reports/phase2/evidence/run3-baseline-poc.txt
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc, withMfa } from './harness.mjs';
import { decidePhoto, sniffImage } from '../functions/_shared/photo-decision.js';

let db;
before(async () => {
  db = await createDb();
  // Equivalente local do storage.objects do Supabase (onde ficam os arquivos)
  await db.exec(`create schema storage;
    create table storage.objects (bucket_id text, name text, created_at timestamptz default now())`);
});

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const anon = (sql, params = [], ip = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.sub', '', true)`);
  if (ip) await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': `${ip}, 10.0.0.1` })]);
  await tx.exec('set local role anon');
  return tx.query(sql, params);
});
const join = (email, state, city, gender = null, ip = null, website = null) =>
  anon(`select public.join_waitlist($1, $2, $3, $4, true, $5) j`, [email, state, city, gender, website], ip);

// ---------------------------------------------------------------- Lista de espera
test('E1: e-mail repetido não troca a cidade nem o gênero de quem já está na lista', async () => {
  await join('vitima@exemplo.com', 'SP', 'São Paulo', 'mulher');
  const r = (await join('vitima@exemplo.com', 'AC', 'Rio Branco', 'homem')).rows[0].j;
  assert.equal(r.ok, true, 'resposta igual: não revela quem está na lista');
  const w = (await db.query(`select state, city, gender::text from public.waitlist where email = 'vitima@exemplo.com'`)).rows[0];
  assert.deepEqual(w, { state: 'SP', city: 'São Paulo', gender: 'mulher' });
});

test('E2: robô de um IP só para no limite dele; outra pessoa continua entrando', async () => {
  for (let i = 0; i < 5; i++) await join(`bot${i}@spam.io`, 'DF', 'Brasília', null, '203.0.113.7');
  await rejects(join('bot99@spam.io', 'DF', 'Brasília', null, '203.0.113.7'), /RATE_LIMITED/);
  const ok = (await join('pessoa@real.com', 'DF', 'Brasília', 'mulher', '198.51.100.20')).rows[0].j;
  assert.equal(ok.ok, true);
});

test('lista de espera: campo-isca preenchido responde ok e não grava', async () => {
  const r = (await join('robo@isca.io', 'RJ', 'Rio de Janeiro', null, '192.0.2.1', 'https://spam.example')).rows[0].j;
  assert.equal(r.ok, true);
  const n = (await db.query(`select count(*)::int n from public.waitlist where email = 'robo@isca.io'`)).rows[0].n;
  assert.equal(n, 0);
});

test('lista de espera: guarda só o hash do IP, nunca o IP', async () => {
  await join('hash@exemplo.com', 'BA', 'Salvador', null, '198.51.100.99');
  const w = (await db.query(`select ip_hash from public.waitlist where email = 'hash@exemplo.com'`)).rows[0];
  assert.match(w.ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!w.ip_hash.includes('198.51'));
});

// ---------------------------------------------------------------- Painel do suporte
test('E3: admin sem segundo fator não decide nada; com MFA decide', async () => {
  const admin = await woman();
  await db.query('insert into public.admins (user_id) values ($1)', [admin]);
  const victim = await man();
  await rejects(rpc(db, admin, 'admin_resolve', [victim, 'banir', 'teste']), /MFA_REQUIRED/);
  await rejects(rpc(db, admin, 'admin_queue'), /MFA_REQUIRED/);
  const st = (await rpc(db, admin, 'admin_status'))[0].admin_status;
  assert.deepEqual(st, { admin: true, mfa_ok: false });
  withMfa(admin);
  await rpc(db, admin, 'admin_resolve', [victim, 'restaurar', 'conferido com MFA']);
  assert.deepEqual((await rpc(db, admin, 'admin_status'))[0].admin_status, { admin: true, mfa_ok: true });
});

test('quem não é admin continua recebendo NOT_ADMIN, mesmo com MFA', async () => {
  const u = withMfa(await woman());
  await rejects(rpc(db, u, 'admin_queue'), /NOT_ADMIN/);
  assert.deepEqual((await rpc(db, u, 'admin_status'))[0].admin_status, { admin: false, mfa_ok: false });
});

// ---------------------------------------------------------------- Verificação
test('E4: selfie enviada antes do desafio é recusada', async () => {
  const u = await woman({ verified: false });
  await db.query(`insert into storage.objects (bucket_id, name, created_at) values ('photos', $1, now() - interval '30 days')`,
    [`${u}/verificacao-antiga.jpg`]);
  await rpc(db, u, 'verification_challenge');
  await rejects(rpc(db, u, 'submit_verification', [`${u}/verificacao-antiga.jpg`]), /SELFIE_TOO_OLD/);
});

test('E5: caminho de selfie que não existe é recusado; selfie nova é aceita', async () => {
  const u = await man({ verified: false });
  await rpc(db, u, 'verification_challenge');
  await rejects(rpc(db, u, 'submit_verification', [`${u}/verificacao-fantasma.jpg`]), /SELFIE_NOT_FOUND/);
  await db.query(`insert into storage.objects (bucket_id, name) values ('photos', $1)`, [`${u}/verificacao-nova.jpg`]);
  const r = (await rpc(db, u, 'submit_verification', [`${u}/verificacao-nova.jpg`]))[0].submit_verification;
  assert.equal(r.status, 'pendente');
});

// ---------------------------------------------------------------- Fotos
test('foto: o robô confere o tipo real do arquivo (bytes), não a extensão', () => {
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), 'png');
  assert.equal(sniffImage(new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ')), 'webp');
  assert.equal(sniffImage(new TextEncoder().encode('<?php system($_GET[1]); ?>')), null);
  assert.equal(sniffImage(new TextEncoder().encode('<svg onload=alert(1)>')), null);
});

test('foto: decisão pelas notas da Moderation API', () => {
  assert.deepEqual(decidePhoto({ sexual: 0.95 }), { flagged: true, reason: 'sexual' });
  assert.deepEqual(decidePhoto({ 'sexual/minors': 0.4 }), { flagged: true, reason: 'menor' });
  assert.deepEqual(decidePhoto({ 'violence/graphic': 0.9 }), { flagged: true, reason: 'violencia' });
  assert.deepEqual(decidePhoto({ sexual: 0.1, violence: 0.05 }), { flagged: false, reason: null });
});

test('foto reprovada sai do perfil; sinal de menor esconde o perfil e abre denúncia automática', async () => {
  const u = await woman();
  const ph = (await db.query('select id from public.photos where user_id = $1', [u])).rows[0].id;
  const pend = (await db.query('select public.photo_check_pending(50) j')).rows[0].j;
  assert.ok(pend.some((x) => x.id === ph), 'foto nova entra na fila do robô');
  const r = (await db.query(`select public.apply_photo_check($1, true, 'menor', '{}') j`, [ph])).rows[0].j;
  assert.equal(r.action, 'reprovada');
  assert.equal((await db.query('select approved from public.photos where id = $1', [ph])).rows[0].approved, false);
  assert.ok((await db.query('select moderation_hidden_at from public.profiles where id = $1', [u])).rows[0].moderation_hidden_at);
  const rep = (await db.query(`select count(*)::int n from public.reports where reported_id = $1 and reason = 'menor_de_idade'`, [u])).rows[0].n;
  assert.equal(rep, 1);
  assert.equal((await db.query(`select public.apply_photo_check($1, false, null, '{}') j`, [ph])).rows[0].j.action, 'ignorada');
});

// ---------------------------------------------------------------- Alertas
test('alertas: cada alerta importante vai para o canal uma vez só, sem conteúdo de conversa', async () => {
  const a = await woman(), b = await man();
  await rpc(db, a, 'report_user', [b, 'servico_sexual_ou_cobranca', 'pediu pix', null]);
  const first = (await db.query('select public.alerts_to_notify(200) j')).rows[0].j;
  assert.ok(first.some((x) => x.kind === 'sexual_service_report'));
  assert.ok(first.every((x) => Object.keys(x).sort().join() === 'at,kind'), 'só tipo e horário');
  const again = (await db.query('select public.alerts_to_notify(200) j')).rows[0].j;
  assert.equal(again.length, 0);
});

// ---------------------------------------------------------------- Retenção
test('retenção: lista de espera antiga e hash de IP vencido são apagados', async () => {
  await join('antigo@exemplo.com', 'PE', 'Recife', null, '198.51.100.50');
  await join('recente@exemplo.com', 'PE', 'Recife', null, '198.51.100.51');
  await db.query(`update public.waitlist set created_at = now() - interval '400 days' where email = 'antigo@exemplo.com'`);
  await db.query(`update public.waitlist set created_at = now() - interval '40 days' where email = 'recente@exemplo.com'`);
  await db.query('select public.purge_expired_data()');
  const rows = (await db.query(`select email, ip_hash from public.waitlist where email in ('antigo@exemplo.com', 'recente@exemplo.com')`)).rows;
  assert.deepEqual(rows, [{ email: 'recente@exemplo.com', ip_hash: null }]);
});

// ---------------------------------------------------------------- Menor privilégio
test('funções novas do robô não ficam expostas ao app nem ao site', async () => {
  const u = await woman();
  for (const sql of [
    'select public.photo_check_pending(10)',
    `select public.apply_photo_check(gen_random_uuid(), true, null, null)`,
    'select public.alerts_to_notify(10)',
    'select public.request_ip_hash()',
    'select public.purge_expired_data()',
  ]) {
    await rejects(asUser(db, u, sql), /permission denied/);
    await rejects(anon(sql), /permission denied/);
  }
  await rejects(anon('select * from public.waitlist'), /permission denied/);
});
