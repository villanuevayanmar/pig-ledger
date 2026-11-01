export function mergeServerRecordsWithPending(serverRecords, pendingRecords, deletedKeys = []) {
  const deleted = new Set(deletedKeys);
  const pendingByKey = new Map();

  for (const entry of pendingRecords) {
    if (!entry || typeof entry.key !== 'string' || !entry.record || typeof entry.record.id !== 'string') continue;
    pendingByKey.set(entry.key, entry.record);
  }

  const merged = [];
  const seen = new Set();

  for (const record of serverRecords) {
    if (!record || typeof record.id !== 'string') continue;
    const key = record.id;
    if (deleted.has(key)) continue;
    merged.push(pendingByKey.get(key) ?? record);
    seen.add(key);
  }

  for (const [key, record] of pendingByKey) {
    if (!deleted.has(key) && !seen.has(key)) merged.push(record);
  }

  return merged;
}
