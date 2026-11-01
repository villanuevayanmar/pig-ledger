import test from 'node:test';
import assert from 'node:assert/strict';
import { canMigrateLegacyLedger } from '../lib/legacy-migration.mjs';

const base = {
  legacyOwnerId: 'user-1',
  userId: 'user-1',
  legacyFarmId: 'farm-1',
  activeFarmId: 'farm-1',
  migrationComplete: false
};

test('explicitly claimed legacy data migrates only to its matching farm', () => {
  assert.equal(canMigrateLegacyLedger(base), true);
});

test('unassigned local-only data is never automatically migrated', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, legacyFarmId: 'local-farm', activeFarmId: 'farm-2' }), false);
});

test('legacy data is not copied into a different farm scope', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, activeFarmId: 'farm-2' }), false);
});

test('legacy data is never migrated across accounts', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, userId: 'user-2' }), false);
});

test('legacy data waits until a farm has been explicitly selected', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, activeFarmId: null }), false);
});

test('a completed migration cannot be repeated into another scope', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, activeFarmId: 'farm-2', migrationComplete: true }), false);
});

test('unrecognized or missing legacy farm identity is not migrated', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, legacyFarmId: null }), false);
});

test('legacy data with an account marker that was not explicitly claimed is not migrated', () => {
  assert.equal(canMigrateLegacyLedger({ ...base, legacyOwnerId: null }), false);
});
