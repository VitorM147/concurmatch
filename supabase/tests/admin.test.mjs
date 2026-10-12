// Painel do suporte, compromisso, selfie automática e lista de espera — migrations 0012–0014
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createDb, createUser, asUser, rpc } from './harness.mjs';
import { decideVerification } from '../functions/_shared/selfie-decision.js';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const makeAdmin = async () => { const id = await woman(); await db.query('insert into public.admins (user_id) values ($1)', [id]); return id; };
const one = async (u, fn, args = []) => Object.values((await rpc(db, u, fn, args))[0])[0];

// ---------------------------------------------------------------- Compromisso
test('cadastro exige aceitar as regras da comunidade', async () => {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@t.dev`]);
  await asUser(db, id, `insert into public.consents (user_id, kind, version)
    select $1, k, '2026-10' from unnest(array['termos','privacidade','dados_sensiveis']) k`, [id]);
  await rejects(asUser(db, id, `insert into public.profiles (id, display_name, birthdate, gender, interested_in, state, city)
    values ($1, 'Sem regras', '1995-01-01', 'homem', '{mulher}', 'SP', 'São Paulo')`, [id]), /CONSENT_REQUIRED/);
  await asUser(db, id, `insert into public.consents (user_id, kind, version) values ($1, 'regras_comunidade', '2026-10')`, [id]);
  await asUser(db, id, `insert into public.profiles (id, display_name, birthdate, gender, interested_in, state, city)
    values ($1, 'Com regras', '1995-01-01', 'homem', '{mulher}', 'SP', 'São Paulo')`, [id]);
});

// ---------------------------------------------------------------- Painel do suporte
test('painel: só admin acessa a fila, o caso e as decisões', async () => {
  const user = await woman(), target = await man();
  await rejects(rpc(db, user, 'admin_queue'), /NOT_ADMIN/);
  await rejects(rpc(db, user, 'admin_case', [target]), /NOT_ADMIN/);
  await rejects(rpc(db, user, 'admin_resolve', [target, 'banir', 'teste']), /NOT_ADMIN/);
  await rejects(rpc(db, user, 'admin_stats'), /NOT_ADMIN/);
  await rejects(asUser(db, user, 'select * from public.admins'), /permission denied/);
  await rejects(asUser(db, user, 'insert into public.admins (user_id) values ($1)', [user]), /permission denied/);
});

test('painel: admin vê o caso com a evidência e decide; a decisão fica com o nome de quem decidiu', async () => {
  const admin = await makeAdmin();
  const bad = await man();
  for (let i = 0; i < 3; i++) await rpc(db, await woman({ ageHours: 48 }), 'report_user', [bad, 'assedio', 'insistente', null]);
  const queue = await one(admin, 'admin_queue');
  assert.ok(queue.some((q) => q.user_id === bad));
  const c = await one(admin, 'admin_case', [bad]);
  assert.equal(c.denuncias.length, 3);
  assert.ok(c.denuncias[0].evidencia, 'evidência anexada');
  await rejects(rpc(db, admin, 'admin_resolve', [bad, 'banir', '']), /NOTE_REQUIRED/);
  await rpc(db, admin, 'admin_resolve', [bad, 'banir', 'assédio confirmado nas três conversas']);
  const log = await db.query(`select actor_id from public.audit_logs where target_id = $1 and action = 'admin_banir'`, [bad]);
  assert.equal(log.rows[0].actor_id, admin);
  const stats = await one(admin, 'admin_stats');
  assert.ok(stats.perfis > 0);
});

test('painel: admin aprova selfie e a pessoa vira verificada', async () => {
  const admin = await makeAdmin();
  const u = await woman({ verified: false });
  const ch = await one(u, 'verification_challenge');
  await rpc(db, u, 'submit_verification', [`${u}/verificacao-1.jpg`]);
  await rpc(db, admin, 'admin_review_selfie', [ch.id, true, null]);
  const p = await db.query('select verified from public.profiles where id = $1', [u]);
  assert.equal(p.rows[0].verified, true);
});

// ---------------------------------------------------------------- Selfie automática (decisão)
const face = (o = {}) => ({
  Confidence: 99.9, Quality: { Sharpness: 80, Brightness: 70 }, AgeRange: { Low: 24, High: 32 },
  Smile: { Value: true, Confidence: 95 }, MouthOpen: { Value: true, Confidence: 90 },
  Sunglasses: { Value: false, Confidence: 99 }, Pose: { Yaw: 22, Pitch: 2 }, ...o,
});

test('selfie: mesmo rosto + desafio cumprido = aprovada na hora', () => {
  assert.equal(decideVerification({ faces: [face()], challenge: 'sorriso_lado', similarities: [97.5, 40] }).decision, 'aprovar');
});

test('selfie: recusa com orientação quando não dá para confirmar', () => {
  const cases = [
    [{ faces: [], challenge: 'sorriso_lado', similarities: [] }, /rosto/],
    [{ faces: [face(), face()], challenge: 'sorriso_lado', similarities: [99] }, /mais de uma pessoa/],
    [{ faces: [face({ Quality: { Sharpness: 5, Brightness: 70 } })], challenge: 'sorriso_lado', similarities: [99] }, /escura ou tremida/],
    [{ faces: [face({ Sunglasses: { Value: true, Confidence: 99 } })], challenge: 'sorriso_lado', similarities: [99] }, /óculos/],
    [{ faces: [face({ Pose: { Yaw: 2, Pitch: 0 } })], challenge: 'sorriso_lado', label: 'Sorria e vire', similarities: [99] }, /pedido/],
    [{ faces: [face()], challenge: 'sorriso_lado', similarities: [40] }, /não parece/],
    [{ faces: [face()], challenge: 'sorriso_lado', similarities: [85] }, /confirmar/],
  ];
  for (const [input, note] of cases) {
    const r = decideVerification(input);
    assert.equal(r.decision, 'recusar');
    assert.match(r.note, note);
  }
});

test('selfie: idade aparente abaixo de 18 vai para uma pessoa', () => {
  const r = decideVerification({ faces: [face({ AgeRange: { Low: 13, High: 19 } })], challenge: 'sorriso_lado', similarities: [98] });
  assert.equal(r.decision, 'revisar');
});

test('selfie: cada desafio é conferido pelos atributos do rosto', () => {
  const serio = face({ Smile: { Value: false, Confidence: 95 }, MouthOpen: { Value: false, Confidence: 95 } });
  assert.equal(decideVerification({ faces: [serio], challenge: 'serio_lado', similarities: [99] }).decision, 'aprovar');
  assert.equal(decideVerification({ faces: [serio], challenge: 'sorriso_lado', similarities: [99] }).decision, 'recusar');
  assert.equal(decideVerification({ faces: [face({ Pose: { Yaw: 3, Pitch: 0 } })], challenge: 'sorriso_frente', similarities: [99] }).decision, 'aprovar');
  assert.equal(decideVerification({ faces: [face({ Smile: { Value: false, Confidence: 90 } })], challenge: 'boca_aberta', similarities: [99] }).decision, 'aprovar');
  assert.equal(decideVerification({ faces: [{ ...serio, Pose: { Yaw: 0, Pitch: -14 } }], challenge: 'serio_cima', similarities: [99] }).decision, 'aprovar');
});

// ---------------------------------------------------------------- Selfie automática (banco)
test('selfie automática: aprovar verifica; a 3ª recusa em 24h vai para uma pessoa', async () => {
  const u = await man({ verified: false });
  const codes = (await db.query('select code from public.verification_challenges()')).rows.map((r) => r.code);
  for (let i = 0; i < 2; i++) {
    const ch = await one(u, 'verification_challenge');
    await rpc(db, u, 'submit_verification', [`${u}/verificacao-${i}.jpg`]);
    const pend = (await db.query('select public.verification_auto_pending(10) j')).rows[0].j.find((x) => x.id === ch.id);
    assert.ok(codes.includes(pend.challenge), 'desafio conferível');
    assert.equal(pend.photos.length, 1);
    const r = (await db.query(`select public.apply_verification_result($1, 'recusar', 'tente com mais luz', '{}') j`, [ch.id])).rows[0].j;
    assert.equal(r.decision, 'recusar');
  }
  await db.query(`update public.app_config set value = '10' where key = 'verification_requests_per_day'`);
  const ch3 = await one(u, 'verification_challenge');
  await rpc(db, u, 'submit_verification', [`${u}/verificacao-3.jpg`]);
  const r3 = (await db.query(`select public.apply_verification_result($1, 'recusar', 'x', '{}') j`, [ch3.id])).rows[0].j;
  assert.equal(r3.decision, 'revisar');
  const st = await one(u, 'my_moderation_status');
  assert.equal(st.verification.status, 'pendente', 'aguarda uma pessoa');
  const queue = (await db.query('select public.moderation_queue() q')).rows[0].q;
  assert.ok(queue.some((q) => q.tipo === 'selfie' && q.request_id === ch3.id));

  const w = await woman({ verified: false });
  const chw = await one(w, 'verification_challenge');
  await rpc(db, w, 'submit_verification', [`${w}/verificacao-1.jpg`]);
  await db.query(`select public.apply_verification_result($1, 'aprovar', null, '{"best_similarity": 97}')`, [chw.id]);
  assert.equal((await one(w, 'my_moderation_status')).verified, true);
  await db.query(`update public.app_config set value = '3' where key = 'verification_requests_per_day'`);
});

// ---------------------------------------------------------------- Lista de espera
test('lista de espera: qualquer pessoa entra pelo site; ninguém lê a lista', async () => {
  const anon = (sql, params) => db.transaction(async (tx) => {
    await tx.exec('set local role anon');
    return tx.query(sql, params);
  });
  const join = (email, uf, city, g, ok = true) =>
    anon('select public.join_waitlist($1, $2, $3, $4, $5) j', [email, uf, city, g, ok]);
  let r = (await join('Ana@Email.com', 'df', '  brasília ', 'mulher')).rows[0].j;
  assert.deepEqual(r, { ok: true, city_total: 1 });
  r = (await join('ana@email.com', 'DF', 'Brasília', null)).rows[0].j;
  assert.equal(r.city_total, 1, 'mesmo e-mail não duplica');
  await join('bruno@email.com', 'DF', 'Brasília', 'homem');
  await rejects(join('sem-arroba', 'DF', 'Brasília', null), /INVALID_EMAIL/);
  await rejects(join('x@y.com', 'DF', 'Brasília', null, false), /CONSENT_REQUIRED/);
  await rejects(anon('select * from public.waitlist'), /permission denied/);

  const admin = await makeAdmin();
  const list = await one(admin, 'admin_waitlist');
  const bsb = list.find((x) => x.cidade === 'Brasília');
  assert.deepEqual([bsb.total, bsb.mulheres, bsb.homens], [2, 1, 1]);
});
