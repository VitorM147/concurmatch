// "Mostrou a cara, ganhou voz" + moderação — migration 0008
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const like = async (from, to, msg) => (await rpc(db, from, 'swipe_like', msg === undefined ? [to] : [to, msg]))[0].swipe_like;
const send = (from, match, body) => asUser(db, from,
  'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)', [match, from, body]);
const limits = async (u) => (await rpc(db, u, 'my_limits'))[0].my_limits;
const status = async (u) => (await rpc(db, u, 'my_moderation_status'))[0].my_moderation_status;
const setBio = (u, bio) => asUser(db, u, 'update public.profiles set bio = $2 where id = $1', [u, bio]);
const premium = (u) => db.query(`insert into public.entitlements (user_id, premium_until, source)
  values ($1, now() + interval '30 days', 'manual')`, [u]);

// ---------------------------------------------------------------- Sem verificação: só olha e curte
test('sem verificação: curte e passa, mas não manda curtida com mensagem', async () => {
  const lurker = await man({ verified: false });
  assert.equal((await like(lurker, await woman())).matched, false);
  await rpc(db, lurker, 'swipe_pass', [await woman()]);
  await rejects(like(lurker, await woman(), 'Oi, tudo bem?'), /VERIFICATION_REQUIRED/);
  const l = await limits(lurker);
  assert.equal(l.verified, false);
  assert.equal(l.messages_max, 0);
});

test('sem verificação: também não recebe curtida com mensagem', async () => {
  const sender = await man(), target = await woman({ verified: false });
  await rejects(like(sender, target, 'Oi!'), /TARGET_NOT_VERIFIED/);
  assert.equal((await like(sender, target)).matched, false, 'a curtida comum continua valendo');
});

test('match com quem não verificou: o chat só abre quando os dois verificarem', async () => {
  const ana = await woman(), bia = await man({ verified: false });
  await like(ana, bia);
  const r = await like(bia, ana);
  assert.equal(r.matched, true, 'match acontece');
  await rejects(send(bia, r.match_id, 'Oi'), /VERIFICATION_REQUIRED/);
  await rejects(send(ana, r.match_id, 'Oi'), /OTHER_NOT_VERIFIED/);
  await db.query('update public.profiles set verified = true where id = $1', [bia]);
  await send(bia, r.match_id, 'Agora sim, oi!');
  await send(ana, r.match_id, 'Oi! Que bom.');
});

test('Premium exige perfil verificado (inclusive no banco)', async () => {
  const u = await man({ verified: false });
  await rejects(premium(u), /VERIFICATION_REQUIRED/);
  await db.query('update public.profiles set verified = true where id = $1', [u]);
  await premium(u);
});

// ---------------------------------------------------------------- Cotas
test('cotas: grátis 50 ações e 5 mensagens; Premium 250 ações e 100 mensagens', async () => {
  const free = await man(), paid = await man();
  await premium(paid);
  assert.deepEqual(await limits(free),
    { premium: false, verified: true, actions_max: 50, actions_left: 50, messages_max: 5, messages_left: 5 });
  assert.deepEqual(await limits(paid),
    { premium: true, verified: true, actions_max: 250, actions_left: 250, messages_max: 100, messages_left: 100 });
  await like(free, await woman(), 'Oi!');
  await rpc(db, free, 'swipe_pass', [await woman()]);
  const l = await limits(free);
  assert.equal(l.actions_left, 48);
  assert.equal(l.messages_left, 4);
});

test('passar a mesma pessoa duas vezes não gasta duas ações', async () => {
  const me = await man(), w = await woman();
  await rpc(db, me, 'swipe_pass', [w]);
  await rpc(db, me, 'swipe_pass', [w]);
  assert.equal((await limits(me)).actions_left, 49);
});

// ---------------------------------------------------------------- Sem programa / cobrança
test('bio: barra programa, cobrança e contato; aceita texto normal e @ do Instagram', async () => {
  const u = await woman();
  for (const bad of [
    'Faço programa, chama', 'Atendo com local próprio', 'Acompanhante executiva', 'Cachê a combinar',
    'Valores no pv', 'Vendo pack de fotos', 'Tenho OnlyFans', 'Sugar baby procurando', 'R$ 300 a hora',
    'Me manda um pix', 'Me chama 11 99999-8888', 'Meu site www.exemplo.com', 'eu@exemplo.com',
  ]) {
    await rejects(setBio(u, bad), /BIO_NOT_ALLOWED/);
  }
  for (const ok of [
    'Adoro programa de TV, cachecol e café', 'Estudo programação e direito', 'Insta: @ana.estuda',
    'Fã de privacidade e de livros', 'Aprovada no TJ em 2025, 2º lugar',
  ]) {
    await setBio(u, ok);
  }
});

test('recado da curtida: sem Pix, preço ou oferta', async () => {
  const a = await man(), b = await woman();
  await rejects(like(a, b, 'Faço um valor especial no pix'), /MESSAGE_NOT_ALLOWED/);
  await rejects(like(a, b, 'Cobro R$50'), /MESSAGE_NOT_ALLOWED/);
});

test('chat: barra oferta de programa, mas não conversa normal sobre dinheiro', async () => {
  const a = await woman(), b = await man();
  await like(a, b);
  const m = (await like(b, a)).match_id;
  await rejects(send(b, m, 'Atendo com local, valores no pv'), /MESSAGE_NOT_ALLOWED/);
  await send(a, m, 'Bora no cinema? A gente divide no pix depois');
  await send(b, m, 'Fechado! Assisti um programa ótimo ontem');
});

// ---------------------------------------------------------------- Denúncia com evidência
test('denúncia guarda só a conversa daquele par, congelada antes do bloqueio', async () => {
  const a = await woman(), b = await man(), c = await woman();
  await like(a, b);
  const m = (await like(b, a)).match_id;
  await send(b, m, 'Você é muito bonita');
  await send(a, m, 'Obrigada');
  await send(b, m, 'Me passa seu endereço agora');
  // conversa de b com outra pessoa não pode entrar na evidência
  await like(c, b);
  const m2 = (await like(b, c)).match_id;
  await send(b, m2, 'Oi C');

  const id = (await rpc(db, a, 'report_user', [b, 'assedio', 'insistiu no endereço', null]))[0].report_user;
  const { rows } = await db.query('select evidence, match_id from public.reports where id = $1', [id]);
  const ev = rows[0].evidence;
  assert.equal(rows[0].match_id, m, 'match anexado automaticamente');
  assert.deepEqual(ev.messages.map((x) => [x.from, x.body]), [
    ['denunciado', 'Você é muito bonita'], ['denunciante', 'Obrigada'], ['denunciado', 'Me passa seu endereço agora'],
  ]);
  const unmatched = await db.query('select unmatched_at from public.matches where id = $1', [m]);
  assert.ok(unmatched.rows[0].unmatched_at, 'o bloqueio desfez o match, mas a evidência ficou');
});

test('denúncia de programa/cobrança gera alerta prioritário', async () => {
  const a = await man(), b = await woman();
  await rpc(db, a, 'report_user', [b, 'servico_sexual_ou_cobranca', 'pediu pix', null]);
  const r = await db.query(`select count(*)::int n from public.security_alerts where subject_id = $1 and kind = 'sexual_service_report'`, [b]);
  assert.equal(r.rows[0].n, 1);
});

// ---------------------------------------------------------------- Recurso e decisão do suporte
test('ocultado por 3 denúncias: vê o status, manda um recurso e o suporte decide', async () => {
  const x = await man();
  await rejects(rpc(db, x, 'submit_appeal', ['Não fiz nada de errado, juro']), /NOT_UNDER_REVIEW/);
  for (let i = 0; i < 3; i++) {
    await rpc(db, await woman({ ageHours: 48 }), 'report_user', [x, 'assedio', null, null]);
  }
  let s = await status(x);
  assert.equal(s.under_review, true);
  assert.equal(s.appeal, null);
  assert.equal(JSON.stringify(s).includes('assedio'), false, 'não revela o motivo nem quem denunciou');

  await rpc(db, x, 'submit_appeal', ['Foi um mal-entendido, só perguntei o bairro para marcar o café.']);
  await rejects(rpc(db, x, 'submit_appeal', ['Mandando de novo para insistir']), /APPEAL_ALREADY_OPEN/);
  s = await status(x);
  assert.equal(s.appeal.status, 'aberto');

  await db.query(`select public.moderation_resolve($1, 'restaurar', 'conversa sem assédio')`, [x]);
  s = await status(x);
  assert.equal(s.under_review, false);
  assert.equal(s.appeal.status, 'aceito');
  const r = await db.query(`select distinct status::text from public.reports where reported_id = $1`, [x]);
  assert.deepEqual(r.rows.map((y) => y.status), ['improcedente']);
});

test('suporte pode banir; decisão fica no audit log', async () => {
  const x = await man();
  await db.query(`select public.moderation_resolve($1, 'banir', 'oferecia programa')`, [x]);
  await rejects(rpc(db, x, 'my_limits'), /ACCOUNT_BANNED/);
  const a = await db.query(`select count(*)::int n from public.audit_logs where target_id = $1 and action = 'moderation_banir'`, [x]);
  assert.equal(a.rows[0].n, 1);
});

// ---------------------------------------------------------------- Verificação por selfie
test('verificação: gesto sorteado + selfie na própria pasta; aprovada pelo suporte vale para sempre', async () => {
  const u = await woman({ verified: false }), other = await woman();
  const ch = (await rpc(db, u, 'verification_challenge'))[0].verification_challenge;
  assert.ok(ch.gesture);
  const again = (await rpc(db, u, 'verification_challenge'))[0].verification_challenge;
  assert.equal(again.id, ch.id, 'não sorteia outro gesto enquanto o pedido está aberto');

  await rejects(rpc(db, u, 'submit_verification', [`${other}/verificacao-1.jpg`]), /verification_selfie_owner/);
  await rpc(db, u, 'submit_verification', [`${u}/verificacao-1.jpg`]);
  assert.equal((await status(u)).verification.status, 'pendente');

  await db.query('select public.moderation_review_verification($1, true, null)', [ch.id]);
  const s = await status(u);
  assert.equal(s.verified, true);
  assert.equal(s.verification.status, 'aprovada');
  await rejects(rpc(db, u, 'verification_challenge'), /ALREADY_VERIFIED/);
});

test('verificação exige foto no perfil', async () => {
  const u = await man({ verified: false, photo: false });
  await rejects(rpc(db, u, 'verification_challenge'), /PHOTO_REQUIRED/);
});

// ---------------------------------------------------------------- Menor privilégio
test('funções do suporte e internas não ficam expostas ao app', async () => {
  const u = await woman();
  for (const sql of [
    `select public.moderation_resolve($1, 'restaurar', null)`,
    'select public.moderation_review_verification(1, true, null)',
    'select public.actions_used_today($1)',
    `select public.sexual_service_signal('x')`,
    `select public.bio_allowed('x')`,
  ]) {
    await rejects(asUser(db, u, sql, sql.includes('$1') ? [u] : []), /permission denied/);
  }
  await rejects(asUser(db, u, 'select * from public.verification_requests'), /permission denied/);
  await rejects(asUser(db, u, 'select * from public.moderation_appeals'), /permission denied/);
  await rejects(asUser(db, u, 'select evidence from public.reports'), /permission denied/);
});
