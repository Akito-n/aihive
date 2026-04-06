declare module "sql.js" {
  export type SqlValue = number | string | Uint8Array | null;

  export interface QueryExecResult {
    columns: string[];
    values: SqlValue[][];
  }

  export interface Database {
    run(sql: string, params?: SqlValue[]): Database;
    exec(sql: string, params?: SqlValue[]): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
