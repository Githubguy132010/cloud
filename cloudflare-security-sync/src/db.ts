import { Client, types } from 'pg';

// Parse INT8 as number (matching git-token-service pattern)
types.setTypeParser(types.builtins.INT8, val => parseInt(val, 10));

export type Database = {
  query: <T = Record<string, unknown>>(text: string, values?: unknown[]) => Promise<T[]>;
};

export function createDatabase(connectionString: string): Database {
  return {
    query: async <T = Record<string, unknown>>(
      text: string,
      values: unknown[] = []
    ): Promise<T[]> => {
      const client = new Client({ connectionString, statement_timeout: 30_000 });
      await client.connect();
      try {
        const result = await client.query(text, values);
        return (result.rows ?? []) as T[];
      } finally {
        await client.end();
      }
    },
  };
}
