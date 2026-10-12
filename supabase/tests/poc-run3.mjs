// Provas de conceito da RUN-SEC-0003.
//   node poc-run3.mjs baseline  → código antes das correções (sem a migration 0016)
//   node poc-run3.mjs           → código atual
import { createDb, createUser, asUser, rpc } from './harness.mjs';

const baseline = process.argv[2] === 'baseline';
const db = await createDb(baseline ? { exclude: ['0016_security_run3.sql'] } : {});
const out = [];
const log = (id, ok, msg) => out.push(`${id} ${ok ? 'VULNERÁVEL' : 'protegido'}: ${msg}`);
const anon = (sql, params = [], ip = null) => db.transaction(async (tx) => {
  await tx.query(`select set_config('request.jwt.claim.sub', '', true)`);
  if (ip) await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify({ 'x-forwarded-for': ip })]);
  await tx.exec('set local role anon');
  return tx.query(sql, params);
});
const tryIt = async (fn) => { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, e: e.message }; } };

// E1 — lista de espera: qualquer pessoa troca a cidade/gênero de outra pelo e-mail
await anon(`select public.join_waitlist('vitima@exemplo.com', 'SP', 'São Paulo', 'mulher', true)`);
await anon(`select public.join_waitlist('vitima@exemplo.com', 'AC', 'Rio Branco', 'homem', true)`);
const w = (await db.query(`select state, city, gender from public.waitlist where email = 'vitima@exemplo.com'`)).rows[0];
log('E1', w.city === 'Rio Branco', `inscrição da vítima ficou ${w.city}/${w.state}, ${w.gender}`);

// E2 — lista de espera: um robô (um IP só) dispara inscrições até travar o site para todo mundo
const join = (email, ip) => anon(`select public.join_waitlist($1, 'DF', 'Brasília', null, true)`, [email], ip);
let sent = 0;
for (let i = 0; i < 300; i++) { const r = await tryIt(() => join(`bot${i}@spam.io`, '203.0.113.7')); if (!r.ok) break; sent++; }
const legit = await tryIt(() => join('pessoa@real.com', '198.51.100.20'));
log('E2', !legit.ok, `robô gravou ${sent} inscrições; ${legit.ok ? 'pessoa real ainda entra' : `pessoa real recusada (${legit.e})`}`);

// E3 — painel: admin sem MFA (sessão aal1) decide banimentos
const admin = await createUser(db, { gender: 'mulher', interested_in: '{homem}' });
await db.query('insert into public.admins (user_id) values ($1)', [admin]);
const victim = await createUser(db, { gender: 'homem', interested_in: '{mulher}' });
const ban = await tryIt(() => rpc(db, admin, 'admin_resolve', [victim, 'banir', 'teste de PoC']));
log('E3', ban.ok, ban.ok ? 'sessão sem segundo fator conseguiu banir um perfil' : `bloqueado (${ban.e})`);

// E4 — verificação: selfie "velha" (enviada antes do desafio) é aceita
await db.exec(`create schema if not exists storage;
  create table if not exists storage.objects (bucket_id text, name text, created_at timestamptz default now())`);
const u = await createUser(db, { gender: 'mulher', interested_in: '{homem}', verified: false });
await db.query(`insert into storage.objects (bucket_id, name, created_at) values ('photos', $1, now() - interval '30 days')`,
  [`${u}/verificacao-antiga.jpg`]);
await rpc(db, u, 'verification_challenge');
const old = await tryIt(() => rpc(db, u, 'submit_verification', [`${u}/verificacao-antiga.jpg`]));
log('E4', old.ok, old.ok ? 'foto de 30 dias atrás aceita como selfie do desafio' : `recusada (${old.e})`);

// E5 — verificação: caminho de arquivo que nem existe é aceito
const u2 = await createUser(db, { gender: 'homem', interested_in: '{mulher}', verified: false });
await rpc(db, u2, 'verification_challenge');
const ghost = await tryIt(() => rpc(db, u2, 'submit_verification', [`${u2}/verificacao-nao-existe.jpg`]));
log('E5', ghost.ok, ghost.ok ? 'pedido entra na fila sem arquivo nenhum' : `recusado (${ghost.e})`);

console.log(out.join('\n'));
