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

const assertValidUrl = (name: string, value: string): string => {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return value;
  } catch {
    throw new Error(`${name} must be a valid URL. Received: ${value}`);
  }
};

const isLocalEnvironment = (): boolean => {
  const env = (process.env.NODE_ENV ?? "") as string;
  return !env || env === "development" || env === "test" || env === "local";
};

const getConnectionString = (): string => {
  const supabaseDbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (supabaseDbUrl) {
    return assertValidUrl("SUPABASE_DB_URL", supabaseDbUrl);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return assertValidUrl("DATABASE_URL", databaseUrl);
  }

  if (isLocalEnvironment()) {
    return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  }

  throw new Error("SUPABASE_DB_URL or DATABASE_URL is required. Set one in your deployment environment.");
};

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
