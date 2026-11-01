import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerRecordsWithPending } from '../lib/pending-records.mjs';

test('pending edits override stale server versions', () => {
  const result = mergeServerRecordsWithPending(
    [{ id: 'expense-1', description: 'Old value', lineTotal: 50 }],
    [{ key: 'expense-1', record: { id: 'expense-1', description: 'Edited value', lineTotal: 75 } }]
  );
  assert.deepEqual(result, [{ id: 'expense-1', description: 'Edited value', lineTotal: 75 }]);
});

test('pending creates remain visible before the server acknowledges them', () => {
  const result = mergeServerRecordsWithPending(
    [{ id: 'server-1', description: 'Saved' }],
    [{ key: 'local-key', record: { id: 'local-key', description: 'Offline record' } }]
  );
  assert.deepEqual(result, [
    { id: 'server-1', description: 'Saved' },
    { id: 'local-key', description: 'Offline record' }
  ]);
});

test('a pending local edit replaces its deterministic server record after a lost response', () => {
  const result = mergeServerRecordsWithPending(
    [{ id: 'stable-uuid', description: 'Old server value' }],
    [{ key: 'stable-uuid', record: { id: 'local-exp-123', description: 'Pending newer value' } }]
  );
  assert.deepEqual(result, [{ id: 'local-exp-123', description: 'Pending newer value' }]);
});

test('pending deletes hide stale server records while preserving unrelated records', () => {
  const result = mergeServerRecordsWithPending(
    [{ id: 'delete-me' }, { id: 'keep-me' }],
    [],
    ['delete-me']
  );
  assert.deepEqual(result, [{ id: 'keep-me' }]);
});

test('pending deletes suppress matching pending creates as well', () => {
  const result = mergeServerRecordsWithPending(
    [],
    [{ key: 'stable-uuid', record: { id: 'local-sale-1' } }],
    ['stable-uuid']
  );
  assert.deepEqual(result, []);
});

test('the last queued version of a record takes precedence', () => {
  const result = mergeServerRecordsWithPending(
    [{ id: 'expense-1', amount: 10 }],
    [
      { key: 'expense-1', record: { id: 'expense-1', amount: 20 } },
      { key: 'expense-1', record: { id: 'expense-1', amount: 30 } }
    ]
  );
  assert.deepEqual(result, [{ id: 'expense-1', amount: 30 }]);
});
