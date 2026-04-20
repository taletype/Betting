export interface DatabaseClient {
  query<T>(statement: string, values?: unknown[]): Promise<T[]>;
}

export const createDatabaseClient = (): DatabaseClient => {
  throw new Error("TODO: implement database client");
};
