import { Client, Pool, type PoolClient, type QueryResultRow, types } from "pg";

const POSTGRES_BIGINT_OID = 20;

types.setTypeParser(POSTGRES_BIGINT_OID, (value) => BigInt(value));

export interface DatabaseExecutor {
  query<T extends QueryResultRow>(statement: string, values?: readonly unknown[]): Promise<T[]>;
}

export interface DatabaseTransaction extends DatabaseExecutor {}

export interface DatabaseClient extends DatabaseExecutor {
  transaction<T>(callback: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}

const createExecutor = (client: Pool | PoolClient): DatabaseExecutor => ({
  async query<T extends QueryResultRow>(
    statement: string,
    values: readonly unknown[] = [],
  ): Promise<T[]> {
    const result = await client.query<T>(statement, [...values]);
    return result.rows;
  },
});

const getConnectionString = (): string =>
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export const getDatabaseConnectionString = (): string => getConnectionString();

let pool: Pool | null = null;

const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      connectionString: getConnectionString(),
    });
  }

  return pool;
};

export const createDatabaseClient = (): DatabaseClient => {
  const sharedPool = getPool();

  return {
    ...createExecutor(sharedPool),
    async transaction<T>(callback: (transaction: DatabaseTransaction) => Promise<T>): Promise<T> {
      const client = await sharedPool.connect();

      try {
        await client.query("begin");
        const result = await callback(createExecutor(client));
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
};

export const createDatabaseNotificationClient = async (): Promise<Client> => {
  const client = new Client({
    connectionString: getConnectionString(),
  });

  await client.connect();
  return client;
};
