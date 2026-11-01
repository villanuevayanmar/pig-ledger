export function canMigrateLegacyLedger({
  legacyOwnerId,
  userId,
  legacyFarmId,
  activeFarmId,
  migrationComplete
}) {
  if (!userId || legacyOwnerId !== userId || !activeFarmId || migrationComplete) return false;
  // A farm match is mandatory. Never bind an unassigned shared cache to an
  // arbitrary account or farm.
  return legacyFarmId !== 'local-farm' && legacyFarmId === activeFarmId;
}
