import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, createUser, asUser, rpc, withMfa } from './harness.mjs';
import { deliverAlerts, cleanupFiles, deleteAccountFiles } from '../functions/_shared/worker-tasks.js';
let db;
before(async () => { db = await createDb(); });
after(async () => { await db.close(); });

test('foto pendente fica fora da descoberta até aprovação explícita', async () => {
  const a = await createUser(db, { gender: 'homem', interested_in: '{mulher}' });
  const b = await createUser(db, { photoPending: true });
  assert.ok(!(await rpc(db, a, 'discover', [50])).some((p) => p.id === b));
  const photo = (await db.query('select id, approved from public.photos where user_id = $1', [b])).rows[0];
  assert.equal(photo.approved, false);
  await db.query('select public.apply_photo_check($1, false, null, $2)', [photo.id, {}]);
  assert.ok((await rpc(db, a, 'discover', [50])).some((p) => p.id === b));
});

test('troca atômica reinicia moderação e agenda arquivo anterior; caminho inválido não perde a foto', async () => {
  const user = await createUser(db);
  const old = (await db.query('select * from public.photos where user_id = $1', [user])).rows[0];
  await rpc(db, user, 'replace_my_photo', [`${user}/nova.jpg`, 0]);
  const photo = (await db.query('select * from public.photos where user_id = $1', [user])).rows[0];
  assert.equal(photo.id, old.id); assert.equal(photo.approved, false); assert.equal(photo.auto_checked_at, null);
  assert.equal((await db.query('select verified from public.profiles where id = $1', [user])).rows[0].verified, false);
  assert.ok((await db.query('select path from public.file_cleanup_jobs where path = $1', [old.storage_path])).rows.length);
  await assert.rejects(rpc(db, user, 'replace_my_photo', ['outro/nova.jpg', 0]), /photos_path_owner/);
  assert.equal((await db.query('select storage_path from public.photos where id = $1', [old.id])).rows[0].storage_path, `${user}/nova.jpg`);
});

test('suporte com MFA decide fotos com motivo; usuário comum não decide', async () => {
  const user = await createUser(db, { photoPending: true }), admin = withMfa(await createUser(db));
  await db.query('insert into public.admins(user_id) values ($1)', [admin]);
  const photo = (await db.query('select id from public.photos where user_id = $1', [user])).rows[0];
  await assert.rejects(rpc(db, user, 'admin_review_photo', [photo.id, true, 'Minha foto']), /NOT_ADMIN/);
  await assert.rejects(rpc(db, admin, 'admin_review_photo', [photo.id, true, '']), /NOTE_REQUIRED/);
  await rpc(db, admin, 'admin_review_photo', [photo.id, true, 'Foto adequada']);
  assert.equal((await db.query('select approved from public.photos where id = $1', [photo.id])).rows[0].approved, true);
});

test('reserva de alerta não confirma envio; falha permite nova tentativa e rejeita token antigo', async () => {
  const user = await createUser(db);
  await db.query("insert into public.security_alerts(kind,subject_id) values ('photo_flagged',$1)", [user]);
  const first = (await db.query('select public.alerts_to_notify(200) value')).rows[0].value;
  assert.ok(first.length);
  assert.equal((await db.query('select public.alerts_to_notify(200) value')).rows[0].value.length, 0);
  await db.query('select public.ack_alert_delivery($1, $2, false)', [first.map((a) => a.id), first[0].token]);
  assert.equal((await db.query('select notified_at from public.security_alerts where id = $1', [first[0].id])).rows[0].notified_at, null);
  await db.query("update public.security_alerts set next_delivery_at = now() - interval '1 minute'");
  const retry = (await db.query('select public.alerts_to_notify(200) value')).rows[0].value;
  await db.query('select public.ack_alert_delivery($1, $2, true)', [retry.map((a) => a.id), first[0].token]);
  assert.equal((await db.query('select notified_at from public.security_alerts where id = $1', [retry[0].id])).rows[0].notified_at, null);
  await db.query('select public.ack_alert_delivery($1, $2, true)', [retry.map((a) => a.id), retry[0].token]);
  assert.ok((await db.query('select notified_at from public.security_alerts where id = $1', [retry[0].id])).rows[0].notified_at);
});

test('exclusão persiste, oculta e bloqueia ações antes de remover a identidade', async () => {
  const user = await createUser(db);
  await rpc(db, user, 'request_account_deletion');
  await rpc(db, user, 'request_account_deletion');
  const profile = (await db.query('select is_visible,banned_at from public.profiles where id = $1', [user])).rows[0];
  assert.equal(profile.is_visible, false); assert.ok(profile.banned_at);
  await assert.rejects(rpc(db, user, 'discover', [10]), /ACCOUNT_BANNED/);
  assert.equal((await db.query('select count(*)::int n from public.account_deletion_jobs where user_id = $1', [user])).rows[0].n, 1);
  const jobs = (await db.query('select public.deletion_jobs_pending(3) value')).rows[0].value;
  const job = jobs.find((j) => j.user_id === user); assert.ok(job);
  await db.query('select public.retry_account_deletion($1, $2)', [user, job.token]);
  assert.equal((await db.query('select attempts from public.account_deletion_jobs where user_id = $1', [user])).rows[0].attempts, 1);
});

test('cliente não pode ler filas ou forjar confirmações', async () => {
  const user = await createUser(db);
  for (const query of ['select * from public.account_deletion_jobs', 'select * from public.file_cleanup_jobs',
    'select public.deletion_jobs_pending(3)', 'select public.file_cleanup_pending(100)',
    "select public.ack_file_cleanup(array['qualquer.jpg'])"]) await assert.rejects(asUser(db, user, query), /permission denied/);
});

test('arquivo referenciado ou retirado não pode ser reenviado para burlar a moderação', async () => {
  const user = await createUser(db);
  assert.equal((await rpc(db, user, 'can_upload_photo_path', [`${user}/0.jpg`]))[0].can_upload_photo_path, false);
  assert.equal((await rpc(db, user, 'can_upload_photo_path', [`${user}/arquivo-novo.jpg`]))[0].can_upload_photo_path, true);
  await rpc(db, user, 'replace_my_photo', [`${user}/substituta.jpg`, 0]);
  assert.equal((await rpc(db, user, 'can_upload_photo_path', [`${user}/0.jpg`]))[0].can_upload_photo_path, false);
  await assert.rejects(rpc(db, user, 'replace_my_photo', [`${user}/0.jpg`, 0]), /PHOTO_PATH_RETIRED/);
});

test('troca de foto invalida verificação pendente; resultado atrasado não restaura o selo', async () => {
  const user = await createUser(db, { verified: false });
  const request = (await db.query(`insert into public.verification_requests(user_id, gesture, status, selfie_path)
    values ($1, 'Sorria', 'pendente', $2) returning id`, [user, `${user}/verificacao-teste.jpg`])).rows[0].id;
  await rpc(db, user, 'replace_my_photo', [`${user}/novo-rosto.jpg`, 0]);
  const late = (await db.query("select public.apply_verification_result($1, 'aprovar', null, '{}') value", [request])).rows[0].value;
  assert.equal(late.decision, 'ignorada');
  assert.equal((await db.query('select verified from public.profiles where id = $1', [user])).rows[0].verified, false);
  assert.ok((await db.query('select path from public.file_cleanup_jobs where path = $1', [`${user}/verificacao-teste.jpg`])).rows.length);
});

test('webhook HTTP 500 não confirma entrega; payload não contém IDs ou tokens internos', async () => {
  const calls = [], alert = { id: 1, token: 'segredo-interno', kind: 'photo_flagged', at: '2026-10-15' };
  const fake = { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'alerts_to_notify' ? [alert] : null }; } };
  await assert.rejects(deliverAlerts(fake, 'https://example.invalid', async (_url, options) => {
    assert.ok(!options.body.includes(alert.token)); assert.ok(!options.body.includes('"id"'));
    return new Response('', { status: 500 });
  }), /ALERT_DELIVERY_FAILED/);
  assert.equal(calls.at(-1).args.p_delivered, false);
  await deliverAlerts(fake, 'https://example.invalid', async () => new Response('', { status: 200 }));
  assert.equal(calls.at(-1).args.p_delivered, true);
});

test('falha no Storage preserva job de limpeza', async () => {
  const calls = [];
  const fake = { rpc: async (name) => { calls.push(name); return { data: ['user/foto.jpg'] }; },
    storage: { from: () => ({ remove: async () => ({ error: new Error('offline') }) }) } };
  await assert.rejects(cleanupFiles(fake), /FILE_DELETE_FAILED/);
  assert.ok(!calls.includes('ack_file_cleanup'));
});

test('remoção percorre 150 arquivos sem pular páginas e só depois remove identidade', async () => {
  let files = Array.from({ length: 150 }, (_, i) => ({ id: String(i), name: `${i}.jpg` }));
  let deleted = false;
  const fake = { storage: { from: () => ({
    list: async (_prefix, options) => ({ data: files.slice(0, options.limit) }),
    remove: async (paths) => { files = files.filter((f) => !paths.includes(`user/${f.name}`)); return {}; },
  }) }, auth: { admin: { deleteUser: async () => { assert.equal(files.length, 0); deleted = true; return {}; } } } };
  assert.equal(await deleteAccountFiles(fake, { user_id: 'user', token: 'token' }), true);
  assert.equal(deleted, true);
});

test('erro na listagem nunca apaga a identidade prematuramente', async () => {
  let deleted = false;
  const fake = { storage: { from: () => ({ list: async () => ({ error: new Error('offline') }) }) },
    auth: { admin: { deleteUser: async () => { deleted = true; return {}; } } } };
  await assert.rejects(deleteAccountFiles(fake, { user_id: 'user', token: 'token' }), /ACCOUNT_FILE_LIST_FAILED/);
  assert.equal(deleted, false);
});
