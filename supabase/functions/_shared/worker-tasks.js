/** External operations are confirmed before their durable jobs are acknowledged. */
/** @param {any} db @param {string} hook @param {typeof fetch} [request] */
export async function deliverAlerts(db, hook, request = fetch) {
  const { data, error } = await db.rpc('alerts_to_notify', { p_limit: 50 });
  if (error) throw new Error('ALERT_CLAIM_FAILED');
  const alerts = data ?? [];
  if (!alerts.length) return 0;
  const args = { p_ids: alerts.map((a) => a.id), p_token: alerts[0].token };
  try {
    const counts = {};
    for (const alert of alerts) counts[alert.kind] = (counts[alert.kind] ?? 0) + 1;
    const text = `ConMatch · ${alerts.length} alerta(s) de segurança: ` +
      Object.entries(counts).map(([kind, count]) => `${kind} ×${count}`).join(', ') + '. Abra o painel do suporte.';
    const response = await request(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('ALERT_DELIVERY_FAILED');
  } catch (error) {
    await db.rpc('ack_alert_delivery', { ...args, p_delivered: false });
    throw error;
  }
  const { error: ack } = await db.rpc('ack_alert_delivery', { ...args, p_delivered: true });
  if (ack) throw new Error('ALERT_ACK_FAILED'); // Lease expires: retry may duplicate, never silently lose.
  return alerts.length;
}

/** @param {any} db */
export async function cleanupFiles(db) {
  const { data: paths, error } = await db.rpc('file_cleanup_pending', { p_limit: 100 });
  if (error) throw new Error('FILE_CLAIM_FAILED');
  if (!paths?.length) return 0;
  const removed = await db.storage.from('photos').remove(paths);
  if (removed.error) throw new Error('FILE_DELETE_FAILED');
  const ack = await db.rpc('ack_file_cleanup', { p_paths: paths });
  if (ack.error) throw new Error('FILE_ACK_FAILED');
  return paths.length;
}

/** @param {any} db @param {{user_id: string, token: string}} job */
export async function deleteAccountFiles(db, job) {
  const bucket = db.storage.from('photos');
  // Delete first page repeatedly: offsets would skip objects as the folder shrinks.
  for (let batch = 0; batch < 5; batch++) {
    const { data: files, error } = await bucket.list(job.user_id, { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error('ACCOUNT_FILE_LIST_FAILED');
    if (!files?.length) {
      const deleted = await db.auth.admin.deleteUser(job.user_id);
      if (deleted.error) throw new Error('ACCOUNT_DELETE_FAILED');
      return true;
    }
    if (files.some((f) => !f.id || f.name.includes('/'))) throw new Error('UNEXPECTED_STORAGE_ENTRY');
    const removed = await bucket.remove(files.map((f) => `${job.user_id}/${f.name}`));
    if (removed.error) throw new Error('ACCOUNT_FILE_DELETE_FAILED');
  }
  // More files remain: durable retry, without deleting the auth user early.
  return false;
}
