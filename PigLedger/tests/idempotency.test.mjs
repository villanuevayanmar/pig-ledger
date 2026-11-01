import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicUuid } from '../lib/idempotency.mjs';

test('deterministic record IDs are stable and valid UUIDs', async () => {
  const first = await deterministicUuid('pig-ledger:local-exp-123');
  const retry = await deterministicUuid('pig-ledger:local-exp-123');
  assert.equal(first, retry);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('different local record IDs never share the same deterministic ID', async () => {
  const expense = await deterministicUuid('pig-ledger:local-exp-123');
  const sale = await deterministicUuid('pig-ledger:local-sale-123');
  assert.notEqual(expense, sale);
});
