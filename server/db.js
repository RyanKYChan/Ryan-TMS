import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FIELDS } from './domain.js';
export function openDb(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, customer TEXT NOT NULL DEFAULT '',
      target INTEGER NOT NULL DEFAULT 400, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS packing_lists (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(project_id, name)
    );
    CREATE TABLE IF NOT EXISTS loads (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), reference TEXT NOT NULL,
      carrier TEXT NOT NULL DEFAULT '', truck TEXT NOT NULL DEFAULT '', driver TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 8, origin TEXT NOT NULL DEFAULT '', destination TEXT NOT NULL DEFAULT '',
      etd TEXT NOT NULL DEFAULT '', eta TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, UNIQUE(project_id,reference)
    );
    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      ${FIELDS.map(f=>`${f} TEXT NOT NULL DEFAULT ''`).join(',')},
      packing_list_id TEXT REFERENCES packing_lists(id), load_id TEXT REFERENCES loads(id),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(project_id,vin)
    );
    CREATE INDEX IF NOT EXISTS units_project ON units(project_id);
    CREATE INDEX IF NOT EXISTS units_load ON units(load_id);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), unit_id TEXT REFERENCES units(id),
      description TEXT NOT NULL, created_at TEXT NOT NULL
    );`);
  if (!db.prepare('SELECT id FROM projects LIMIT 1').get()) {
    db.prepare('INSERT INTO projects(id,name,customer,target,created_at) VALUES(?,?,?,?,?)')
      .run(randomUUID(), 'Maxus spot operations', 'MAXUS', 400, new Date().toISOString());
  }
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
