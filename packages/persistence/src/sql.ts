export type SqlResult<T> = { rows: T[] };

export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlResult<T>>;
  transaction?<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
}

export async function withTransaction<T>(client: SqlClient, work: (client: SqlClient) => Promise<T>): Promise<T> {
  if (client.transaction) return client.transaction(work);
  return work(client);
}
