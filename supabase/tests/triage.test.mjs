// Triagem automática de denúncias (Moderation API) — migration 0010 + decisão do robô
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc } from './harness.mjs';
import { decideReport, maxScores } from '../functions/_shared/report-decision.js';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const like = async (a, b) => (await rpc(db, a, 'swipe_like', [b]))[0].swipe_like;
const send = (from, match, body) => asUser(db, from,
  'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)', [match, from, body]);
const report = async (from, to, reason) => (await rpc(db, from, 'report_user', [to, reason, null, null]))[0].report_user;
const pending = async () => (await db.query('select public.report_triage_pending(50) j')).rows[0].j;
const triage = async (id, sev) => (await db.query('select public.apply_report_triage($1, $2, $3) j', [id, sev, '{}'])).rows[0].j;
const profile = async (id) => (await db.query('select moderation_hidden_at, banned_at from public.profiles where id = $1', [id])).rows[0];
const reportRow = async (id) => (await db.query('select status::text, auto_severity from public.reports where id = $1', [id])).rows[0];

async function chat(a, b, ...lines) {
  await like(a, b);
  const m = (await like(b, a)).match_id;
  for (const [who, body] of lines) await send(who === 'a' ? a : b, m, body);
  return m;
}

// ---------------------------------------------------------------- Decisão (robô)
test('decisão: ameaça é grave, xingamento é moderado, conversa normal não tem evidência', () => {
  assert.equal(decideReport({ texts: ['vou te pegar'], scores: { 'harassment/threatening': 0.9 } }).severity, 'grave');
  assert.equal(decideReport({ texts: ['idiota'], scores: { harassment: 0.7 } }).severity, 'moderada');
  assert.equal(decideReport({ texts: ['bom dia!'], scores: { harassment: 0.01 } }).severity, 'sem_evidencia');
  assert.equal(decideReport({ texts: [], scores: {} }).severity, 'sem_conversa');
  assert.equal(decideReport({ texts: ['  ', null], scores: {} }).severity, 'sem_conversa');
});

test('decisão: junta as notas de várias mensagens pela maior de cada categoria', () => {
  const s = maxScores([
    { category_scores: { harassment: 0.2, sexual: 0.1 } },
    { category_scores: { harassment: 0.8, sexual: 0.05 } },
  ]);
  assert.deepEqual(s, { harassment: 0.8, sexual: 0.1 });
});

// ---------------------------------------------------------------- O que vai para a API
test('o robô recebe só o que a pessoa denunciada escreveu (conversa, recado e bio)', async () => {
  const a = await woman(), b = await man();
  await asUser(db, b, 'update public.profiles set bio = $2 where id = $1', [b, 'Gosto de trilhas']);
  await chat(a, b, ['a', 'Oi, tudo bem?'], ['b', 'Me manda foto agora'], ['a', 'Não']);
  const id = await report(a, b, 'assedio');
  const item = (await pending()).find((x) => x.id === id);
  assert.deepEqual(item.texts, ['Me manda foto agora', 'Gosto de trilhas']);
});

// ---------------------------------------------------------------- Ações automáticas
test('grave: o perfil sai do ar na hora, com uma denúncia só, e vai para a fila de banimento', async () => {
  const a = await woman(), b = await man();
  await chat(a, b, ['b', 'Se não sair comigo vou atrás de você']);
  const id = await report(a, b, 'assedio');
  assert.equal((await profile(b)).moderation_hidden_at, null, 'uma denúncia sozinha não esconde');
  assert.equal((await triage(id, 'grave')).action, 'escondido');
  const p = await profile(b);
  assert.ok(p.moderation_hidden_at, 'escondido pela triagem');
  assert.equal(p.banned_at, null, 'banir continua sendo decisão humana');
  const queue = (await db.query('select public.moderation_queue() q')).rows[0].q;
  assert.equal(queue.find((x) => x.user_id === b)?.prioridade, '2-grave');
  await rejects(send(b, (await db.query(
    'select id from public.matches where user_a = least($1::uuid,$2::uuid) and user_b = greatest($1::uuid,$2::uuid)', [a, b])).rows[0].id, 'oi'),
    /MATCH_INACTIVE|ACCOUNT_UNDER_REVIEW/);
});

test('oferta de programa vira grave mesmo se a nota da API vier baixa', async () => {
  const a = await man(), b = await woman();
  const id = await report(a, b, 'servico_sexual_ou_cobranca');
  // a bio já é barrada no cadastro; aqui a prova está no recado gravado na evidência
  await db.query(`update public.reports set evidence = jsonb_set(evidence, '{like_message}', '"atendo com local, valores no pv"') where id = $1`, [id]);
  assert.equal((await triage(id, 'sem_evidencia')).severity, 'grave');
  assert.ok((await profile(b)).moderation_hidden_at);
});

test('sem evidência: denúncia de assédio com conversa normal é arquivada e não conta', async () => {
  const a = await woman(), b = await man();
  await chat(a, b, ['b', 'Oi! Também estudo para o TJ'], ['b', 'Bora um café sábado?']);
  const id = await report(a, b, 'assedio');
  assert.equal((await triage(id, 'sem_evidencia')).action, 'arquivada');
  assert.equal((await reportRow(id)).status, 'improcedente');
});

test('3 denúncias sem evidência: o perfil some na hora e volta sozinho depois da triagem', async () => {
  const b = await man();
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const a = await woman({ ageHours: 48 });
    await chat(a, b, ['b', `Oi, tudo bem? Qual matéria você estuda? (${i})`]);
    ids.push(await report(a, b, 'assedio'));
  }
  assert.ok((await profile(b)).moderation_hidden_at, 'regra das 3 denúncias esconde na hora');
  await triage(ids[0], 'sem_evidencia');
  await triage(ids[1], 'sem_evidencia');
  assert.ok((await profile(b)).moderation_hidden_at, 'ainda tem denúncia aberta');
  assert.equal((await triage(ids[2], 'sem_evidencia')).action, 'arquivada_e_restaurado');
  assert.equal((await profile(b)).moderation_hidden_at, null);
  const log = await db.query(`select count(*)::int n from public.audit_logs where target_id = $1 and action = 'auto_restore'`, [b]);
  assert.equal(log.rows[0].n, 1);
});

test('moderada: continua aberta e conta para as 3; não restaura sozinha', async () => {
  const b = await man();
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await report(await woman({ ageHours: 48, verified: false }), b, 'assedio'));
  for (const id of ids) assert.equal((await triage(id, 'moderada')).action, 'mantida');
  assert.ok((await profile(b)).moderation_hidden_at);
  const queue = (await db.query('select public.moderation_queue() q')).rows[0].q;
  assert.equal(queue.find((x) => x.user_id === b)?.prioridade, '4-denuncias');
});

test('perfil falso: contra verificado é arquivada; não verificado volta ao verificar o rosto', async () => {
  const real = await woman();
  const id1 = await report(await man(), real, 'perfil_falso');
  assert.equal((await triage(id1, 'sem_conversa')).action, 'arquivada');

  const fake = await woman({ verified: false });
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await report(await man({ ageHours: 48, verified: false }), fake, 'perfil_falso'));
  for (const id of ids) assert.equal((await triage(id, 'sem_conversa')).action, 'mantida');
  assert.ok((await profile(fake)).moderation_hidden_at);

  const ch = (await rpc(db, fake, 'verification_challenge'))[0].verification_challenge;
  await rpc(db, fake, 'submit_verification', [`${fake}/verificacao-1.jpg`]);
  await db.query('select public.moderation_review_verification($1, true, null)', [ch.id]);
  assert.equal((await profile(fake)).moderation_hidden_at, null, 'verificou, voltou');
});

test('menor de idade nunca é arquivado pela máquina e fica no topo da fila', async () => {
  const b = await man();
  const id = await report(await woman({ verified: false }), b, 'menor_de_idade');
  assert.equal((await triage(id, 'sem_conversa')).action, 'mantida');
  const queue = (await db.query('select public.moderation_queue() q')).rows[0].q;
  assert.equal(queue.find((x) => x.user_id === b)?.prioridade, '1-menor');
});

test('triagem roda uma vez só por denúncia', async () => {
  const a = await woman(), b = await man();
  const id = await report(a, b, 'spam_golpe');
  await triage(id, 'moderada');
  assert.equal((await triage(id, 'grave')).action, 'ignorada');
  assert.equal((await pending()).some((x) => x.id === id), false);
});

test('funções do robô não ficam expostas ao app', async () => {
  const u = await woman();
  for (const sql of [
    'select public.report_triage_pending(10)',
    `select public.apply_report_triage(gen_random_uuid(), 'grave', null)`,
    'select public.moderation_queue()',
    'select public.auto_restore_if_clear($1)',
  ]) {
    await rejects(asUser(db, u, sql, sql.includes('$1') ? [u] : []), /permission denied/);
  }
});
