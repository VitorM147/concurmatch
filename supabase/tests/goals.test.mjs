import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDb, createUser, asUser, rpc } from './harness.mjs';

let db;
before(async () => { db = await createDb(); });
after(async () => { await db.close(); });

async function setGoal(user, type, exam = null, course = null) {
  await asUser(db, user, `update public.profiles set goal_type = $1, goal_exam_id = $2,
    desired_course_id = $3, area_id = null, competition_id = null where id = $4`, [type, exam, course, user]);
}
async function exam(slug) {
  return (await db.query('select id from public.goal_exams where slug = $1', [slug])).rows[0].id;
}
async function course(slug) {
  return (await db.query('select id from public.study_courses where slug = $1', [slug])).rows[0].id;
}

test('migração preserva concursos antigos e reconhece perfis militares sem perder a seleção', async () => {
  const legacy = await createDb({ exclude: ['0018_study_goals.sql'] });
  try {
    const a = await createUser(legacy);
    const b = await createUser(legacy, { competition: 'Escolas Militares (EsPCEx, EsSA, EEAR...)' });
    const before = (await legacy.query('select competition_id from public.profiles where id = $1', [b])).rows[0];
    await legacy.exec(readFileSync(new URL('../migrations/0018_study_goals.sql', import.meta.url), 'utf8'));
    const rows = (await legacy.query('select id, goal_type, competition_id from public.profiles')).rows;
    assert.equal(rows.find((r) => r.id === a).goal_type, 'concurso');
    assert.equal(rows.find((r) => r.id === b).goal_type, 'militar');
    assert.equal(rows.find((r) => r.id === b).competition_id, before.competition_id);
  } finally { await legacy.close(); }
});

test('objetivos têm catálogos próprios, somente de leitura para o usuário', async () => {
  const user = await createUser(db);
  assert.ok((await asUser(db, user, 'select * from public.goal_exams')).rows.some((r) => r.slug === 'enem'));
  assert.ok((await asUser(db, user, 'select * from public.study_courses')).rows.some((r) => r.slug === 'medicina'));
  await assert.rejects(asUser(db, user, "insert into public.goal_exams (slug, name, goal_type) values ('x', 'X', 'vestibular')"), /permission denied/);
});

test('prova deve pertencer ao objetivo e curso só é permitido para vestibular', async () => {
  const user = await createUser(db);
  await assert.rejects(setGoal(user, 'militar', await exam('enem')), /INVALID_GOAL_EXAM/);
  await assert.rejects(setGoal(user, 'concurso', null, await course('medicina')), /course_requires_vestibular/);
  await setGoal(user, 'vestibular', await exam('enem'), await course('medicina'));
});

test('campos opcionais permitem cadastro sem prova, instituição ou curso definido', async () => {
  const user = await createUser(db);
  await setGoal(user, 'vestibular');
  const p = (await asUser(db, user, 'select goal_type, goal_exam_id, desired_course_id from public.profiles')).rows[0];
  assert.equal(p.goal_type, 'vestibular');
  assert.equal(p.goal_exam_id, null);
  assert.equal(p.desired_course_id, null);
});

test('descoberta mantém públicos integrados e devolve objetivo, prova e curso', async () => {
  const place = { city: 'Campinas', state: 'SP', lat: -22.90, lng: -47.06 };
  const a = await createUser(db, { ...place, gender: 'mulher', interested_in: '{homem}' });
  const b = await createUser(db, { ...place, gender: 'homem', interested_in: '{mulher}' });
  const c = await createUser(db, { ...place, gender: 'homem', interested_in: '{mulher}' });
  const e = await exam('enem'), medicine = await course('medicina');
  await setGoal(a, 'vestibular', e, medicine);
  await setGoal(b, 'vestibular', e, medicine);
  await setGoal(c, 'militar', await exam('espcex'));
  const rows = await rpc(db, a, 'discover', [50]);
  const same = rows.find((r) => r.id === b);
  assert.ok(same);
  assert.ok(rows.some((r) => r.id === c), 'objetivo diferente não bloqueia o encontro');
  assert.equal(same.goal_exam, 'ENEM');
  assert.equal(same.desired_course, 'Medicina');
  assert.ok(same.reasons.includes('Mesma prova ou seleção'));
  assert.ok(same.reasons.includes('Mesmo curso desejado'));
  assert.ok(same.score > rows.find((r) => r.id === c).score);
  await rpc(db, a, 'swipe_like', [c, null]);
  assert.equal((await rpc(db, c, 'swipe_like', [a, null]))[0].swipe_like.matched, true);
  const destination = await createUser(db, { gender: 'homem', interested_in: '{mulher}',
    city: 'Rio de Janeiro', state: 'RJ', lat: -22.91, lng: -43.17 });
  await asUser(db, a, "update public.profiles set target_city = 'Rio de Janeiro', target_state = 'RJ' where id = $1", [a]);
  const dest = (await rpc(db, a, 'discover', [50])).find((r) => r.id === destination);
  assert.equal(dest.lotacao_label, 'Destino: Rio de Janeiro/RJ');
  assert.equal(dest.distance_label, null);
});

test('opções genéricas Outro não afirmam que duas pessoas desejam a mesma prova ou curso', async () => {
  const a = await createUser(db), b = await createUser(db);
  await setGoal(a, 'vestibular', await exam('outro_vestibular'), await course('outro'));
  await setGoal(b, 'vestibular', await exam('outro_vestibular'), await course('outro'));
  const comparison = (await db.query(`select public.compatibility(a, b) as value
    from public.profiles a, public.profiles b where a.id = $1 and b.id = $2`, [a, b])).rows[0].value;
  assert.ok(!comparison.reasons.includes('Mesma prova ou seleção'));
  assert.ok(!comparison.reasons.includes('Mesmo curso desejado'));
});

test('objetivos adicionais não repetem o principal, não duplicam e não aceitam valores desconhecidos', async () => {
  const user = await createUser(db);
  const update = (goals) => asUser(db, user, 'update public.profiles set secondary_goals = $1 where id = $2', [goals, user]);
  await assert.rejects(update(['concurso']), /check constraint/);
  await assert.rejects(update(['vestibular', 'vestibular']), /INVALID_SECONDARY_GOALS/);
  await assert.rejects(update(['inexistente']), /check constraint/);
  await update(['vestibular', 'militar']);
});

test('objetivos mantêm RLS, não concedem privilégios de moderação e são exportados', async () => {
  const a = await createUser(db), b = await createUser(db);
  await setGoal(a, 'oab_residencia', await exam('oab_2'));
  const result = await asUser(db, b, "update public.profiles set goal_detail = 'Pediatria' where id = $1 returning id", [a]);
  assert.equal(result.rows.length, 0);
  await assert.rejects(asUser(db, a, 'update public.profiles set verified = true where id = $1', [a]), /permission denied/);
  const exported = (await rpc(db, a, 'export_my_data'))[0].export_my_data;
  assert.equal(exported.profile.goal_type, 'oab_residencia');
  assert.equal(exported.profile.goal_exam_id, await exam('oab_2'));
});

test('detalhes do objetivo não permitem contornar a proteção contra links e cobrança', async () => {
  const user = await createUser(db);
  await assert.rejects(asUser(db, user, "update public.profiles set desired_institution = 'https://golpe.com' where id = $1", [user]), /GOAL_TEXT_NOT_ALLOWED/);
  await assert.rejects(asUser(db, user, "update public.profiles set goal_detail = 'faço programa' where id = $1", [user]), /GOAL_TEXT_NOT_ALLOWED/);
});
