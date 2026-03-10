// Database layer using sql.js (pure WASM, no native build)
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const require2 = createRequire(import.meta.url)
const initSqlJs = require2('sql.js')

let db: any = null

function getDbPath() {
  return path.join(app.getPath('userData'), 'leonardo.db')
}

export async function getDb() {
  if (db) return db
  const wasmPath = path.join(path.dirname(require2.resolve('sql.js')), 'sql-wasm.wasm')
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) })
  const dbPath = getDbPath()
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath))
  } else {
    db = new SQL.Database()
  }
  initSchema()
  return db
}

function saveDb() {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(getDbPath(), Buffer.from(data))
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS cookies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cookie_str TEXT NOT NULL,
      name       TEXT DEFAULT '',
      tokens     INTEGER DEFAULT 0,
      user_id    TEXT DEFAULT '',
      email      TEXT DEFAULT '',
      status     TEXT DEFAULT 'NEW',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS generations (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER DEFAULT NULL,
      cookie_id    INTEGER,
      prompt       TEXT,
      model_id     TEXT,
      gen_id       TEXT,
      status       TEXT DEFAULT 'PENDING',
      image_url    TEXT DEFAULT '',
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_path  TEXT NOT NULL,
      created_at  TEXT DEFAULT (datetime('now'))
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `)
  // Migrate: add project_id column if missing (for existing DBs)
  try { db.run(`ALTER TABLE generations ADD COLUMN project_id INTEGER DEFAULT NULL`) } catch {}
  saveDb()
}

// ── Cookie CRUD ──────────────────────────────────────────────────────────────
export async function addCookie(cookieStr: string) {
  const d = await getDb()
  d.run(
    `INSERT INTO cookies (cookie_str, status) VALUES (?, 'NEW')`,
    [cookieStr.trim()]
  )
  saveDb()
  // return last inserted row
  const result = d.exec(`SELECT last_insert_rowid() as id`)
  return result[0]?.values[0][0]
}

export async function listCookies() {
  const d = await getDb()
  const res = d.exec(`SELECT id, name, email, tokens, status, user_id, updated_at FROM cookies ORDER BY id DESC`)
  if (!res.length) return []
  const cols = res[0].columns
  const rows = res[0].values
  return rows.map((r: any[]) => Object.fromEntries(cols.map((c: string, i: number) => [c, r[i]])))
}

export async function deleteCookie(id: number) {
  const d = await getDb()
  d.run(`DELETE FROM cookies WHERE id = ?`, [id])
  saveDb()
}

export async function updateCookieTokens(id: number, tokens: number, email: string, userId: string, status: string) {
  const d = await getDb()
  const name = email.split('@')[0] || `Account_${id}`
  d.run(
    `UPDATE cookies SET tokens=?, email=?, user_id=?, name=?, status=?, updated_at=datetime('now') WHERE id=?`,
    [tokens, email, userId, name, status, id]
  )
  saveDb()
}

export async function getCookieById(id: number) {
  const d = await getDb()
  const res = d.exec(`SELECT * FROM cookies WHERE id = ?`, [id])
  if (!res.length || !res[0].values.length) return null
  const cols = res[0].columns
  const row  = res[0].values[0]
  return Object.fromEntries(cols.map((c: string, i: number) => [c, row[i]])) as Record<string, any>
}

export async function getAllCookieStrings() {
  const d = await getDb()
  const res = d.exec(`SELECT id, cookie_str FROM cookies WHERE status != 'EMPTY'`)
  if (!res.length) return []
  return res[0].values.map((r: any) => ({ id: r[0], cookie_str: r[1] }))
}

// ── Projects ─────────────────────────────────────────────────────────────────
export async function createProject(name: string, description = '') {
  const d = await getDb()
  d.run(`INSERT INTO projects (name, description) VALUES (?, ?)`, [name.trim(), description.trim()])
  saveDb()
  const result = d.exec(`SELECT last_insert_rowid() as id`)
  return result[0]?.values[0][0] as number
}

export async function listProjects() {
  const d = await getDb()
  const res = d.exec(`SELECT id, name, description, created_at FROM projects ORDER BY id DESC`)
  if (!res.length) return []
  const cols = res[0].columns
  return res[0].values.map((r: any[]) =>
    Object.fromEntries(cols.map((c: string, i: number) => [c, r[i]]))
  )
}

export async function deleteProject(id: number) {
  const d = await getDb()
  d.run(`DELETE FROM generations WHERE project_id = ?`, [id])
  d.run(`DELETE FROM projects WHERE id = ?`, [id])
  saveDb()
}

// ── Generation log ───────────────────────────────────────────────────────────
export async function logGeneration(cookieId: number, prompt: string, modelId: string, genId: string, projectId?: number) {
  try {
    const d = await getDb()
    d.run(
      `INSERT INTO generations (cookie_id, project_id, prompt, model_id, gen_id, status) VALUES (?,?,?,?,?,'PENDING')`,
      [cookieId, projectId ?? null, prompt, modelId, genId]
    )
    saveDb()
    console.log(`[DB] logGeneration OK: genId=${genId} projectId=${projectId}`)
  } catch (e) {
    console.error('[DB] logGeneration FAILED:', e)
    throw e
  }
}

export async function updateGenStatus(genId: string, status: string, imageUrl: string) {
  const d = await getDb()
  d.run(`UPDATE generations SET status=?, image_url=? WHERE gen_id=?`, [status, imageUrl, genId])
  saveDb()
}

export async function deleteGeneration(id: number) {
  const d = await getDb()
  d.run(`DELETE FROM generations WHERE id = ?`, [id])
  saveDb()
}

export async function listGenerations(projectId?: number) {
  try {
    const d = await getDb()
    // Use prepare() for reliable parameterized queries in sql.js
    let stmt: any
    let rows: any[]
    if (projectId != null) {
      stmt = d.prepare(`
        SELECT id, project_id, cookie_id, prompt, model_id, gen_id, status, image_url, created_at
        FROM generations WHERE project_id = ? AND status != 'PENDING'
        ORDER BY id DESC LIMIT 500
      `)
      rows = []
      stmt.bind([projectId])
      while (stmt.step()) rows.push(stmt.getAsObject())
      stmt.free()
    } else {
      stmt = d.prepare(`
        SELECT id, project_id, cookie_id, prompt, model_id, gen_id, status, image_url, created_at
        FROM generations WHERE project_id IS NULL AND status != 'PENDING'
        ORDER BY id DESC LIMIT 500
      `)
      rows = []
      while (stmt.step()) rows.push(stmt.getAsObject())
      stmt.free()
    }
    console.log(`[DB] listGenerations(projectId=${projectId}) -> ${rows.length} rows`)
    return rows
  } catch (e) {
    console.error('[DB] listGenerations FAILED:', e)
    return []
  }
}

// ── Characters ────────────────────────────────────────────────────────────────
export async function createCharacter(name: string, description: string, imagePath: string) {
  const d = await getDb()
  d.run(`INSERT INTO characters (name, description, image_path) VALUES (?, ?, ?)`, [name.trim(), description.trim(), imagePath])
  saveDb()
  const result = d.exec(`SELECT last_insert_rowid() as id`)
  return result[0]?.values[0][0] as number
}

export async function listCharacters() {
  const d = await getDb()
  const res = d.exec(`SELECT id, name, description, image_path, created_at FROM characters ORDER BY id DESC`)
  if (!res.length) return []
  const cols = res[0].columns
  return res[0].values.map((r: any[]) =>
    Object.fromEntries(cols.map((c: string, i: number) => [c, r[i]]))
  )
}

export async function deleteCharacter(id: number) {
  const d = await getDb()
  d.run(`DELETE FROM characters WHERE id = ?`, [id])
  saveDb()
}

// ── Settings ──────────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const d = await getDb()
  const res = d.exec(`SELECT value FROM settings WHERE key = ?`, [key])
  if (!res.length || !res[0].values.length) return null
  return res[0].values[0][0] as string
}

export async function saveSetting(key: string, value: string) {
  const d = await getDb()
  d.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value])
  saveDb()
}
