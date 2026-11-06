import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';

// Kysely compiles Better Auth queries for the Durable Object's built-in SQLite.
export function accountDatabase(storage) {
  const connection = {
    async executeQuery({ sql, parameters }) {
      const cursor = storage.sql.exec(sql, ...parameters);
      const rows = cursor.toArray();
      return { rows, numAffectedRows: BigInt(cursor.rowsWritten) };
    },
    async *streamQuery() {
      throw new Error('Streaming account queries is unsupported.');
    }
  };
  const noTransaction = async () => {
    throw new Error('Use storage.transactionSync for account schema changes.');
  };
  const db = new Kysely({
    dialect: {
      createAdapter: () => new SqliteAdapter(),
      createQueryCompiler: () => new SqliteQueryCompiler(),
      createIntrospector: database => new SqliteIntrospector(database),
      createDriver: () => ({
        async init() {},
        async acquireConnection() { return connection; },
        async releaseConnection() {},
        async destroy() {},
        beginTransaction: noTransaction,
        commitTransaction: noTransaction,
        rollbackTransaction: noTransaction
      })
    }
  });
  return { db, type: 'sqlite', transaction: false };
}
