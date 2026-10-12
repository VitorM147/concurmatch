// Curtida com mensagem (botão estrela) e interesses — migration 0007
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });

const man   = (o = {}) => createUser(db, { gender: 'homem',  interested_in: '{mulher}', ...o });
const woman = (o = {}) => createUser(db, { gender: 'mulher', interested_in: '{homem}',  ...o });
const rejects = (p, re) => assert.rejects(p, (e) => { assert.match(e.message, re); return true; });
const like = (from, to, msg) => rpc(db, from, 'swipe_like', msg === undefined ? [to] : [to, msg]);

test('curtida com mensagem: a pessoa curtida vê o recado e o card vem primeiro', async () => {
  const ana = await woman(), bruno = await man(), carlos = await man();
  await like(bruno, ana, 'Também estudo pra PF de noite. Bora trocar dicas de informática?');
  await like(carlos, ana); // curtida comum

  const deck = await rpc(db, ana, 'discover', [20]);
  assert.equal(deck[0].id, bruno, 'quem mandou recado aparece primeiro');
  assert.equal(deck[0].message_to_me, 'Também estudo pra PF de noite. Bora trocar dicas de informática?');
  const c = deck.find((d) => d.id === carlos);
  assert.equal(c.message_to_me, null);

  // quem enviou não vê o próprio recado em lugar nenhum do deck de terceiros
  const other = await woman();
  const deckOther = await rpc(db, other, 'discover', [20]);
  assert.ok(deckOther.every((d) => d.message_to_me === null));
});

test('mensagem tem no máximo 100 caracteres (após normalizar espaços)', async () => {
  const a = await man(), b = await woman(), c = await woman();
  await rejects(like(a, b, 'x'.repeat(101)), /MESSAGE_TOO_LONG/);
  // 100 exatos passa; quebras de linha e espaços repetidos são normalizados
  await like(a, b, 'y'.repeat(100));
  await like(a, c, '  oi\n\n  tudo   bem?  ');
  const r = await db.query('select message from public.likes where liker_id = $1 and likee_id = $2', [a, c]);
  assert.equal(r.rows[0].message, 'oi tudo bem?');
});

test('mensagem vazia vira curtida comum', async () => {
  const a = await man(), b = await woman();
  await like(a, b, '   ');
  const r = await db.query('select message from public.likes where liker_id = $1', [a]);
  assert.equal(r.rows[0].message, null);
});

test('sem links, e-mails, @perfis ou telefone no recado', async () => {
  const a = await man();
  for (const bad of [
    'me chama no https://wa.me/55',
    'vem pro www.site.com',
    'meu insta.com/fulano',
    'manda email pra fulano@gmail.com',
    'me segue lá @fulano.silva',
    'chama no zap 61 99999-8888',
    '(61) 9 9999 8888',
  ]) {
    await rejects(like(a, await woman(), bad), /MESSAGE_NOT_ALLOWED/);
  }
  // textos normais com números passam
  await like(a, await woman(), 'Passei na 1ª fase em 2024 e estudo 6h por dia!');
  await like(a, await woman(), 'Faltam 45 dias pra prova, e pra você?');
});

test('o recado só é aceito numa curtida (não dá pra ver quem curtiu pela tabela)', async () => {
  const a = await man();
  await rejects(asUser(db, a, 'select * from public.likes'), /permission denied/);
  await rejects(asUser(db, a, `insert into public.likes (liker_id, likee_id, message) values ($1, $1, 'x')`, [a]),
    /permission denied/);
});

test('match: os recados viram as primeiras mensagens do chat, o mais antigo primeiro', async () => {
  const ana = await woman(), bruno = await man();
  await like(bruno, ana, 'Oi! Vi que você também faz TJ.');
  const r = await like(ana, bruno, 'Faço sim! Qual tribunal?');
  assert.equal(r[0].swipe_like.matched, true);

  const msgs = await asUser(db, ana,
    'select sender_id, body from public.messages where match_id = $1 order by id', [r[0].swipe_like.match_id]);
  assert.deepEqual(msgs.rows.map((m) => [m.sender_id, m.body]), [
    [bruno, 'Oi! Vi que você também faz TJ.'],
    [ana, 'Faço sim! Qual tribunal?'],
  ]);

  const list = await rpc(db, bruno, 'my_matches');
  assert.equal(list[0].last_message, 'Faço sim! Qual tribunal?');
  assert.equal(list[0].unread, 1);
});

test('match sem recados: conversa começa vazia', async () => {
  const a = await woman(), b = await man();
  await like(b, a);
  const r = await like(a, b);
  const msgs = await db.query('select count(*)::int n from public.messages where match_id = $1', [r[0].swipe_like.match_id]);
  assert.equal(msgs.rows[0].n, 0);
});

test('limite diário de curtidas com mensagem (5 no grátis) e a curtida conta na cota', async () => {
  const a = await man();
  for (let i = 0; i < 5; i++) await like(a, await woman(), `Oi ${i}`);
  await rejects(like(a, await woman(), 'Oi de novo'), /MESSAGE_LIKE_LIMIT/);
  // curtida comum ainda funciona
  await like(a, await woman());
  const left = await rpc(db, a, 'remaining_likes');
  assert.equal(left[0].remaining_likes, 50 - 6);
});

test('interesses: até 10, do catálogo, sem repetição', async () => {
  const a = await woman();
  await asUser(db, a, `update public.profiles set interests = '{cafe,leitura,trilhas}' where id = $1`, [a]);
  const r = await asUser(db, a, 'select interests from public.profiles where id = $1', [a]);
  assert.deepEqual(r.rows[0].interests, ['cafe', 'leitura', 'trilhas']);

  await rejects(asUser(db, a, `update public.profiles set interests = '{me_chama_no_zap}' where id = $1`, [a]),
    /profiles_interests_valid/);
  await rejects(asUser(db, a, `update public.profiles set interests = '{cafe,cafe}' where id = $1`, [a]),
    /profiles_interests_valid/);
  await rejects(asUser(db, a, `update public.profiles set interests =
    '{cafe,academia,corrida,leitura,series,filmes,musica,viagens,culinaria,pets,trilhas}' where id = $1`, [a]),
    /profiles_interests_valid/);

  const b = await man();
  const deck = await rpc(db, b, 'discover', [50]);
  assert.deepEqual(deck.find((d) => d.id === a).interests, ['cafe', 'leitura', 'trilhas']);
});

test('exportação de dados inclui o recado enviado', async () => {
  const a = await man(), b = await woman();
  await like(a, b, 'Boa sorte na prova!');
  const r = await rpc(db, a, 'export_my_data');
  assert.equal(r[0].export_my_data.likes_given[0].message, 'Boa sorte na prova!');
});
