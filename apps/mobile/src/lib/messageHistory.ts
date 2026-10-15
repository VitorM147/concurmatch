/** Merge pages and realtime updates without duplicating rows or losing read receipts. */
export function mergeMessages<T extends { id: number; read_at: string | null }>(current: T[], incoming: T[]): T[] {
  const rows = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const previous = rows.get(message.id);
    rows.set(message.id, { ...previous, ...message, read_at: message.read_at ?? previous?.read_at ?? null });
  }
  return [...rows.values()].sort((a, b) => a.id - b.id);
}
