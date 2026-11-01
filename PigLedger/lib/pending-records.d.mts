export type PendingRecordEntry<T extends { id: string }> = {
  key: string;
  record: T;
};

export function mergeServerRecordsWithPending<T extends { id: string }>(
  serverRecords: T[],
  pendingRecords: PendingRecordEntry<T>[],
  deletedKeys?: string[]
): T[];
