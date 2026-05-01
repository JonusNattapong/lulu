// Bun-specific module declarations
declare module 'bun:sqlite' {
  import { Database as SQLiteDB } from 'better-sqlite3';
  const Database: new (path: string) => SQLiteDB;
  export = Database;
  export { Database };
  export type Database = SQLiteDB;
}

declare module 'bun:sqlite-vec' {
  export interface VectorSearch {}
}
