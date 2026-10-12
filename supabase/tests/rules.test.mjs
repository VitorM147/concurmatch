// Testes das regras de negócio e segurança do banco.
// Rodar: cd supabase/tests && npm install && npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const ids = (rows) => rows.map((r) => r.id);
const like = async (a, b) => (await rpc(db, a, 'swipe_like', [b]))[0].swipe_like;
const rejects = (p, code) => assert.rejects(p, (e) => { assert.match(e.message, new RegExp(code)); return true; });

// ---------------------------------------------------------------- Match
test('like mútuo cria exatamente um match ("ConMatch")', async () => {
  const a = await woman(), b = await man();
  assert.equal((await like(a, b)).matched, false);
  const r = await like(b, a);
  assert.equal(r.matched, true);
  assert.ok(r.match_id);
  const again = await like(b, a);           // repetir é idempotente
  assert.equal(again.duplicate, true);
  assert.equal(again.match_id, r.match_id);
  const { rows } = await db.query('select count(*)::int n from public.matches where id = $1', [r.match_id]);
  assert.equal(rows[0].n, 1);
});

test('não é possível curtir a si mesmo', async () => {
  const a = await woman();
  await rejects(like(a, a), 'INVALID_TARGET');
});

// ---------------------------------------------------------------- Limite / Premium
test('ações do dia: grátis 50 (curtir + passar); Premium 250', async () => {
  const sp = { state: 'SP', city: 'São Paulo', lat: -23.55, lng: -46.63 };
  const me = await man(sp);
  const targets = [];
  for (let i = 0; i < 51; i++) targets.push(await woman({ ...sp, photo: false }));
  for (let i = 0; i < 25; i++) await like(me, targets[i]);
  for (let i = 25; i < 50; i++) await rpc(db, me, 'swipe_pass', [targets[i]]);   // passar também conta
  assert.equal((await rpc(db, me, 'remaining_likes'))[0].remaining_likes, 0);
  await rejects(like(me, targets[50]), 'ACTION_LIMIT_REACHED');
  await rejects(rpc(db, me, 'swipe_pass', [targets[50]]), 'ACTION_LIMIT_REACHED');

  await db.query(`insert into public.entitlements (user_id, premium_until, source)
                  values ($1, now() + interval '30 days', 'manual')`, [me]);
  assert.equal((await rpc(db, me, 'remaining_likes'))[0].remaining_likes, 200);
  assert.equal((await like(me, targets[50])).remaining, 199);
});

// ---------------------------------------------------------------- Discovery
test('discovery respeita interesse mútuo de gênero e idade', async () => {
  const city = { state: 'RJ', city: 'Rio de Janeiro', lat: -22.9, lng: -43.2 };
  const me = await woman({ ...city, age_min: 25, age_max: 35 });
  const ok       = await man({ ...city, birthdate: '1995-01-01' });
  const tooYoung = await man({ ...city, birthdate: '2005-01-01' });
  const notInto  = await man({ ...city, interested_in: '{homem}' });
  const wantsOld = await man({ ...city, birthdate: '1995-01-01', age_min: 40, age_max: 60 });
  const noPhoto  = await man({ ...city, photo: false });
  const found = ids(await rpc(db, me, 'discover', [50]));
  assert.ok(found.includes(ok));
  for (const x of [tooYoung, notInto, wantsOld, noPhoto]) assert.ok(!found.includes(x));
});

test('discovery: raio de distância e Modo Lotação', async () => {
  const me    = await woman({ state: 'MG', city: 'Belo Horizonte', lat: -19.92, lng: -43.94, max_km: 30,
                              target_state: 'DF', target_city: 'Brasília' });
  const near  = await man({ state: 'MG', city: 'Contagem', lat: -19.93, lng: -44.05 });
  const far   = await man({ state: 'BA', city: 'Salvador', lat: -12.97, lng: -38.5 });
  const inBsb = await man({ state: 'DF', city: 'Brasília', lat: -15.79, lng: -47.88 });
  const rows  = await rpc(db, me, 'discover', [50]);
  const found = ids(rows);
  assert.ok(found.includes(near));
  assert.ok(!found.includes(far));
  assert.ok(found.includes(inBsb), 'quem está no meu destino de lotação aparece');
  const bsb = rows.find((r) => r.id === inBsb);
  assert.equal(bsb.lotacao_label, 'Lotação: Brasília/DF');
  assert.equal(bsb.distance_label, null, 'nunca expõe distância fora do raio');
  assert.match(rows.find((r) => r.id === near).distance_label, /km/);
});

test('discovery não repete quem já foi curtido ou passado', async () => {
  const city = { state: 'PE', city: 'Recife', lat: -8.05, lng: -34.9 };
  const me = await woman(city), x = await man(city), y = await man(city);
  await like(me, x);
  await rpc(db, me, 'swipe_pass', [y]);
  const found = ids(await rpc(db, me, 'discover', [50]));
  assert.ok(!found.includes(x) && !found.includes(y));
});

test('compatibilidade usa pesos centralizados e é explicável', async () => {
  const city = { state: 'CE', city: 'Fortaleza', lat: -3.73, lng: -38.52 };
  const me = await woman({ ...city, competition: 'Auditor Fiscal', period: 'manha' });
  const same = await man({ ...city, competition: 'Auditor Fiscal', period: 'manha' });
  const diff = await man({ ...city, competition: 'Professor', period: 'noite', status: 'nomeado' });
  const rows = await rpc(db, me, 'discover', [50]);
  const s = rows.find((r) => r.id === same), d = rows.find((r) => r.id === diff);
  assert.ok(s.score > d.score);
  assert.ok(s.reasons.includes('Mesmo concurso'));
  assert.equal(rows[0].id, same, 'maior compatibilidade vem primeiro');

  // mudar peso = UPDATE, sem deploy
  await db.query(`update public.matching_weights set weight = 0 where factor <> 'proximidade'`);
  const r2 = await rpc(db, me, 'discover', [50]);
  assert.equal(r2.find((r) => r.id === same).score, r2.find((r) => r.id === diff).score);
  await db.exec(`update public.matching_weights set weight = case factor
    when 'mesmo_concurso' then 30 when 'mesma_area' then 20 when 'proximidade' then 20 else 10 end`);
});

// ---------------------------------------------------------------- Chat
test('chat: só participantes leem; desconhecido não envia', async () => {
  const a = await woman(), b = await man(), intruder = await man();
  await like(a, b);
  const { match_id } = await like(b, a);
  await asUser(db, a, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)', [match_id, a, 'Oi!']);
  assert.equal((await asUser(db, b, 'select * from public.messages where match_id = $1', [match_id])).rows.length, 1);
  assert.equal((await asUser(db, intruder, 'select * from public.messages where match_id = $1', [match_id])).rows.length, 0);
  await rejects(asUser(db, intruder, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)',
    [match_id, intruder, 'spam']), 'NOT_A_PARTICIPANT');
  await rejects(asUser(db, intruder, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)',
    [match_id, a, 'fingindo ser a A']), 'row-level security');
});

test('chat: anti-spam de mensagens por minuto', async () => {
  const a = await woman(), b = await man();
  await like(a, b);
  const { match_id } = await like(b, a);
  await db.query(`update public.app_config set value = '3' where key = 'messages_per_minute'`);
  for (let i = 0; i < 3; i++) {
    await asUser(db, a, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)', [match_id, a, `m${i}`]);
  }
  await rejects(asUser(db, a, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)',
    [match_id, a, 'mais uma']), 'RATE_LIMITED');
  await db.query(`update public.app_config set value = '30' where key = 'messages_per_minute'`);
});

// ---------------------------------------------------------------- Segurança
test('bloquear desfaz o match, impede mensagens e some do discovery', async () => {
  const city = { state: 'PR', city: 'Curitiba', lat: -25.43, lng: -49.27 };
  const a = await woman(city), b = await man(city);
  await like(a, b);
  const { match_id } = await like(b, a);
  await rpc(db, a, 'block_user', [b]);
  assert.equal((await rpc(db, a, 'my_matches')).length, 0);
  assert.equal((await rpc(db, b, 'my_matches')).length, 0);
  await rejects(asUser(db, b, 'insert into public.messages (match_id, sender_id, body) values ($1, $2, $3)',
    [match_id, b, 'oi?']), 'MATCH_INACTIVE');
  const c = await man(city);
  assert.ok(!ids(await rpc(db, a, 'discover', [50])).includes(b));
  assert.ok(ids(await rpc(db, a, 'discover', [50])).includes(c));
  await rejects(like(b, a), 'TARGET_UNAVAILABLE');
});

test('3 denúncias de contas confiáveis ocultam o perfil até revisão humana', async () => {
  const bad = await man();
  for (let i = 0; i < 3; i++) {
    const r = await woman({ ageHours: 48 });
    await rpc(db, r, 'report_user', [bad, 'assedio', 'mensagens ofensivas', null]);
  }
  const { rows } = await db.query('select moderation_hidden_at, banned_at from public.profiles where id = $1', [bad]);
  assert.ok(rows[0].moderation_hidden_at, 'ocultado pela moderação');
  assert.equal(rows[0].banned_at, null, 'banimento é decisão humana');
});

test('denúncia de menor de idade: 2 denunciantes confiáveis ocultam na hora e geram alerta', async () => {
  const x = await man();
  await rpc(db, await woman({ ageHours: 48, verified: false }), 'report_user', [x, 'menor_de_idade', null, null]);
  let r = await db.query('select moderation_hidden_at from public.profiles where id = $1', [x]);
  assert.equal(r.rows[0].moderation_hidden_at, null, 'uma denúncia só gera alerta');
  await rpc(db, await woman({ ageHours: 48, verified: false }), 'report_user', [x, 'menor_de_idade', null, null]);
  r = await db.query('select moderation_hidden_at from public.profiles where id = $1', [x]);
  assert.ok(r.rows[0].moderation_hidden_at);
  const a = await db.query(`select count(*)::int n from public.security_alerts where subject_id = $1 and kind = 'minor_report'`, [x]);
  assert.equal(a.rows[0].n, 2);
});

test('usuário banido não consegue usar o app', async () => {
  const x = await man();
  await db.query('update public.profiles set banned_at = now() where id = $1', [x]);
  await rejects(rpc(db, x, 'discover', [10]), 'ACCOUNT_BANNED');
});

test('menores de 18 não conseguem criar perfil', async () => {
  await rejects(createUser(db, { birthdate: '2012-01-01' }), 'adult_only');
});

// ---------------------------------------------------------------- RLS / privilégios
test('RLS: não lê perfis, curtidas ou denúncias de terceiros direto na tabela', async () => {
  const a = await woman(), b = await man();
  await like(b, a);
  const own = await asUser(db, a, 'select id from public.profiles');
  assert.deepEqual(own.rows.map((r) => r.id), [a]);
  await rejects(asUser(db, a, 'select * from public.likes'), 'permission denied');
  await rejects(asUser(db, a, 'select * from public.reports'), 'permission denied');
  await rejects(asUser(db, a, 'insert into public.likes (liker_id, likee_id) values ($1, $2)', [a, b]), 'permission denied');
});

test('RLS: usuário não se auto-verifica, não se desbane, não vira premium', async () => {
  const a = await woman();
  await rejects(asUser(db, a, 'update public.profiles set verified = true where id = $1', [a]), 'permission denied');
  await rejects(asUser(db, a, 'update public.profiles set banned_at = null where id = $1', [a]), 'permission denied');
  await rejects(asUser(db, a, 'update public.profiles set birthdate = $2 where id = $1', [a, '2000-01-01']), 'permission denied');
  await rejects(asUser(db, a, `insert into public.entitlements (user_id, premium_until) values ($1, now() + interval '1 year')`, [a]), 'permission denied');
  await rejects(asUser(db, a, `update public.photos set approved = true where user_id = $1`, [a]), 'permission denied');
});

test('privacidade: coordenadas são arredondadas no servidor', async () => {
  const a = await woman({ lat: -23.561234, lng: -46.656789 });
  const { rows } = await db.query('select lat_approx::text, lng_approx::text from public.profiles where id = $1', [a]);
  assert.equal(rows[0].lat_approx, '-23.56');
  assert.equal(rows[0].lng_approx, '-46.66');
});

test('LGPD: excluir conta apaga perfil, fotos, likes e matches', async () => {
  const a = await woman(), b = await man();
  await like(a, b);
  await like(b, a);
  await rpc(db, a, 'delete_my_account');
  for (const [t, col] of [['profiles', 'id'], ['photos', 'user_id'], ['likes', 'liker_id'], ['matches', 'user_a'], ['matches', 'user_b']]) {
    const { rows } = await db.query(`select count(*)::int n from public.${t} where ${col} = $1`, [a]);
    assert.equal(rows[0].n, 0, `${t}.${col}`);
  }
});
