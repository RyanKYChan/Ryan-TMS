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
    );
    CREATE TABLE IF NOT EXISTS carriers (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      name TEXT NOT NULL COLLATE NOCASE, created_at TEXT NOT NULL, UNIQUE(project_id,name)
    );
    CREATE TABLE IF NOT EXISTS carrier_updates (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), carrier_id TEXT NOT NULL REFERENCES carriers(id),
      row_count INTEGER NOT NULL, changed_count INTEGER NOT NULL, loads_created INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedule_alerts (
      id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),carrier_id TEXT NOT NULL REFERENCES carriers(id),
      unit_id TEXT NOT NULL REFERENCES units(id),vin TEXT NOT NULL,load_id TEXT REFERENCES loads(id),load_reference TEXT NOT NULL DEFAULT '',
      field TEXT NOT NULL,before_value TEXT NOT NULL,after_value TEXT NOT NULL,delta_minutes INTEGER NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS alerts_project ON schedule_alerts(project_id,resolved_at);`);
  transaction(db,()=>{
    const additions={units:{revenue:"TEXT NOT NULL DEFAULT ''"},loads:{cost:"TEXT NOT NULL DEFAULT ''",revenue:"TEXT NOT NULL DEFAULT ''"},projects:{cost_basis:"TEXT NOT NULL DEFAULT 'unit'",revenue_basis:"TEXT NOT NULL DEFAULT 'unit'",unit_cost:"TEXT NOT NULL DEFAULT ''",load_cost:"TEXT NOT NULL DEFAULT ''",unit_revenue:"TEXT NOT NULL DEFAULT ''",load_revenue:"TEXT NOT NULL DEFAULT ''"}};
    for(const [table,fields] of Object.entries(additions)){
      const known=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
      for(const [field,type] of Object.entries(fields))if(!known.has(field))db.exec(`ALTER TABLE ${table} ADD COLUMN ${field} ${type}`);
    }
  });
  // Preserve the insertion order of older packing lists when upgrading an existing database.
  if (!db.prepare('PRAGMA table_info(units)').all().some(c=>c.name==='import_order')) {
    transaction(db,()=>{
      db.exec('ALTER TABLE units ADD COLUMN import_order INTEGER NOT NULL DEFAULT 0');
      db.exec('UPDATE units SET import_order=rowid');
    });
  }
  const existingNames=db.prepare("SELECT project_id,carrier AS name FROM units WHERE trim(carrier)<>'' UNION SELECT project_id,carrier AS name FROM loads WHERE trim(carrier)<>''").all();
  transaction(db,()=>{for(const c of existingNames) db.prepare('INSERT OR IGNORE INTO carriers VALUES(?,?,?,?)').run(randomUUID(),c.project_id,c.name.trim(),new Date().toISOString());});
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
