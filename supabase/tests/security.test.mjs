// Testes de regressão da auditoria ESAA-Security (RUN-SEC-0001).
// Cada teste reproduz uma prova de conceito que FUNCIONAVA antes do 0005
// e agora precisa ser bloqueada. O ID do check do playbook está no nome.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const setConfig = (k, v) => db.query('update public.app_config set value = $2 where key = $1', [k, JSON.stringify(v)]);

test('AZ-002/FU-006: não dá para usar a foto de outra pessoa no próprio perfil', async () => {
  const victim = await woman(), attacker = await woman();
  await rejects(asUser(db, attacker,
    'insert into public.photos (user_id, storage_path, position) values ($1, $2, 1)', [attacker, `${victim}/0.jpg`]),
    /photos_path_owner/);
  await rejects(asUser(db, attacker,
    'insert into public.photos (user_id, storage_path, position) values ($1, $2, 1)', [attacker, `${attacker}/../${victim}/0.jpg`]),
    /photos_path_owner/);
  await asUser(db, attacker,
    'insert into public.photos (user_id, storage_path, position) values ($1, $2, 1)', [attacker, `${attacker}/1712-1.jpg`]);
});

test('BL-001: quem foi ocultado pela moderação não consegue voltar sozinho', async () => {
  const bad = await man();
  for (let i = 0; i < 3; i++) await rpc(db, await woman({ ageHours: 48 }), 'report_user', [bad, 'perfil_falso', null, null]);
  await rejects(asUser(db, bad, 'update public.profiles set moderation_hidden_at = null where id = $1', [bad]), /permission denied/);
  await asUser(db, bad, 'update public.profiles set is_visible = true where id = $1', [bad]);
  const viewer = await woman();
  const found = (await rpc(db, viewer, 'discover', [50])).map((r) => r.id);
  assert.ok(!found.includes(bad), 'continua fora do Descobrir');
  await rejects(rpc(db, viewer, 'swipe_like', [bad]), /TARGET_UNAVAILABLE/);
});

test('BL-004: conta recém-criada não derruba perfil com uma denúncia', async () => {
  const target = await man();
  const fresh = await woman({ photo: false });
  await rpc(db, fresh, 'report_user', [target, 'menor_de_idade', null, null]);
  const { rows } = await db.query('select moderation_hidden_at, is_visible from public.profiles where id = $1', [target]);
  assert.equal(rows[0].moderation_hidden_at, null);
  assert.equal(rows[0].is_visible, true);
  const alerts = await db.query(`select count(*)::int n from public.security_alerts where subject_id = $1`, [target]);
  assert.equal(alerts.rows[0].n, 1, 'mesmo assim gera alerta para revisão humana');
});

test('BL-004: várias contas novas (sybil) também não ocultam', async () => {
  const target = await man();
  for (let i = 0; i < 5; i++) await rpc(db, await woman(), 'report_user', [target, 'assedio', null, null]);
  const { rows } = await db.query('select moderation_hidden_at from public.profiles where id = $1', [target]);
  assert.equal(rows[0].moderation_hidden_at, null);
  const spike = await db.query(`select count(*)::int n from public.security_alerts where subject_id = $1 and kind = 'report_spike'`, [target]);
  assert.ok(spike.rows[0].n >= 1, 'pico de denúncias vira alerta');
});

test('AZ-005: usuário não consulta bloqueios entre terceiros', async () => {
  const a = await woman(), b = await man(), spy = await man();
  await rpc(db, a, 'block_user', [b]);
  await rejects(asUser(db, spy, 'select public.is_blocked_pair($1, $2)', [a, b]), /permission denied/);
});

test('AZ-005: funções internas não ficam expostas ao app', async () => {
  const u = await woman();
  for (const sql of [
    'select public.purge_expired_data()',
    `select public.enforce_rate_limit($1, 'like', interval '1 minute', 1)`,
    'select public.is_trusted_reporter($1)',
    `select public.setting('free_likes_per_day')`,
  ]) {
    await rejects(asUser(db, u, sql, sql.includes('$1') ? [u] : []), /permission denied/);
  }
});

test('DA-005: perfil só é criado com os três consentimentos LGPD', async () => {
  await rejects(createUser(db, { consent: false }), /CONSENT_REQUIRED/);
});

test('AZ-002: denúncia não aceita match de outras pessoas', async () => {
  const a = await woman(), b = await man(), x = await woman(), y = await man();
  await rpc(db, x, 'swipe_like', [y]);
  const m = (await rpc(db, y, 'swipe_like', [x]))[0].swipe_like.match_id;
  await rejects(rpc(db, a, 'report_user', [b, 'outro', null, m]), /INVALID_MATCH/);
});

test('AP-001: passar perfis tem limite por minuto (anti-raspagem)', async () => {
  await setConfig('passes_per_minute', 5);
  const city = { state: 'BA', city: 'Salvador', lat: -12.97, lng: -38.5 };
  const me = await man(city);
  for (let i = 0; i < 5; i++) await rpc(db, me, 'swipe_pass', [await woman({ ...city, photo: false })]);
  await rejects(rpc(db, me, 'swipe_pass', [await woman({ ...city, photo: false })]), /RATE_LIMITED/);
  const alert = await db.query(`select count(*)::int n from public.security_alerts where subject_id = $1 and kind = 'rate_limit'`, [me]);
  assert.equal(alert.rows[0].n, 1);
  await setConfig('passes_per_minute', 120);
});

test('BL-002: Premium também tem teto anti-bot por minuto', async () => {
  await setConfig('likes_per_minute', 3);
  const me = await man();
  await db.query(`insert into public.entitlements (user_id, premium_until) values ($1, now() + interval '1 day')`, [me]);
  for (let i = 0; i < 3; i++) await rpc(db, me, 'swipe_like', [await woman()]);
  await rejects(rpc(db, me, 'swipe_like', [await woman()]), /RATE_LIMITED/);
  await setConfig('likes_per_minute', 60);
});

test('DA-005: titular exporta os próprios dados (LGPD art. 18)', async () => {
  const a = await woman(), b = await man();
  await rpc(db, a, 'swipe_like', [b]);
  const { match_id } = (await rpc(db, b, 'swipe_like', [a]))[0].swipe_like;
  await asUser(db, a, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)', [match_id, a, 'oi']);
  const data = (await rpc(db, a, 'export_my_data'))[0].export_my_data;
  assert.equal(data.profile.id, a);
  assert.equal(data.consents.length, 4);
  assert.equal(data.likes_given.length, 1);
  assert.equal(data.messages_sent[0].body, 'oi');
  assert.ok(!('banned_at' in data.profile) && !('moderation_hidden_at' in data.profile), 'não expõe campos internos de moderação');
});

test('DA-003: retenção apaga conversas antigas de matches desfeitos, mas preserva as denunciadas', async () => {
  const a = await woman(), b = await man(), c = await man();
  await rpc(db, a, 'swipe_like', [b]); const m1 = (await rpc(db, b, 'swipe_like', [a]))[0].swipe_like.match_id;
  await rpc(db, a, 'swipe_like', [c]); const m2 = (await rpc(db, c, 'swipe_like', [a]))[0].swipe_like.match_id;
  await rpc(db, a, 'unmatch', [m1]);
  await rpc(db, a, 'report_user', [c, 'assedio', null, m2]);           // denúncia aberta ligada ao m2
  await db.query(`update public.matches set unmatched_at = now() - interval '200 days' where id in ($1, $2)`, [m1, m2]);
  const res = (await db.query('select public.purge_expired_data() as r')).rows[0].r;
  assert.ok(res.matches >= 1);
  const left = await db.query('select id from public.matches where id in ($1, $2)', [m1, m2]);
  assert.deepEqual(left.rows.map((r) => r.id), [m2]);
});

test('Moderação: conta em revisão não envia mensagens', async () => {
  const a = await woman(), b = await man();
  await rpc(db, a, 'swipe_like', [b]);
  const { match_id } = (await rpc(db, b, 'swipe_like', [a]))[0].swipe_like;
  await db.query('update public.profiles set moderation_hidden_at = now() where id = $1', [b]);
  await rejects(asUser(db, b, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)',
    [match_id, b, 'oi']), /ACCOUNT_UNDER_REVIEW/);
});
