// Sobe um Postgres embarcado (PGlite), simula o "auth" do Supabase
// e aplica as migrations + seed. Usado pelos testes de regra de negócio.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const AUTH_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export async function createDb() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  for (const f of ['0001_schema.sql', '0002_functions.sql', '0003_security.sql', '0005_security_hardening.sql']) {
    await db.exec(read(`migrations/${f}`));
  }
  await db.exec(read('seed.sql'));
  return db;
}

// Executa SQL "como" um usuário logado (role authenticated + JWT sub)
export async function asUser(db, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? '']);
    await tx.exec('set local role authenticated');
    return tx.query(sql, params);
  });
}

const BASE = {
  gender: 'mulher', interested_in: '{homem}', birthdate: '1996-05-10',
  state: 'DF', city: 'Brasília', lat: -15.79, lng: -47.88,
  competition: 'Agente', status: 'estudando', period: 'noite',
  age_min: 18, age_max: 60, max_km: 50, target_state: null, target_city: null,
};

// Cria usuário + perfil + 1 foto, já ativo
export async function createUser(db, overrides = {}) {
  const u = { ...BASE, ...overrides };
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${id}@t.dev`]);
  if (u.consent !== false) {
    await asUser(db, id, `insert into public.consents (user_id, kind, version)
      select $1, k, '2026-10' from unnest(array['termos','privacidade','dados_sensiveis']) k`, [id]);
  }
  const comp = await db.query(
    `select c.id, c.area_id from public.competitions c where c.name = $1 order by c.id limit 1`, [u.competition]);
  await asUser(db, id, `
    insert into public.profiles (id, display_name, birthdate, gender, interested_in, state, city,
      lat_approx, lng_approx, competition_id, area_id, status, study_period, age_min, age_max,
      max_distance_km, target_state, target_city)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [id, u.name ?? 'Teste', u.birthdate, u.gender, u.interested_in, u.state, u.city, u.lat, u.lng,
     comp.rows[0]?.id ?? null, comp.rows[0]?.area_id ?? null, u.status, u.period,
     u.age_min, u.age_max, u.max_km, u.target_state, u.target_city]);
  // contas "antigas" (24h+) contam como denunciantes confiáveis
  if (u.ageHours) {
    await db.query(`update public.profiles set created_at = now() - make_interval(hours => $2) where id = $1`, [id, u.ageHours]);
  }
  if (u.photo !== false) {
    await asUser(db, id, `insert into public.photos (user_id, storage_path, position) values ($1, $2, 0)`,
      [id, `${id}/0.jpg`]);
  }
  return id;
}

export const rpc = async (db, uid, fn, args = []) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await asUser(db, uid, `select * from public.${fn}(${ph})`, args);
  return r.rows;
};
