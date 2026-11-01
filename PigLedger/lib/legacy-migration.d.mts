export type LegacyMigrationInput = {
  legacyOwnerId: string | null;
  userId: string;
  legacyFarmId: string | null;
  activeFarmId: string | null;
  migrationComplete: boolean;
};

export function canMigrateLegacyLedger(input: LegacyMigrationInput): boolean;
