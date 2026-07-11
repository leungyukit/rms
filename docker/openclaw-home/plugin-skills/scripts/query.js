#!/usr/bin/env node

/**
 * Database query tool for SQLite and MySQL
 * Usage: node query.js <database_url> <sql>
 */

const path = require('path');
const rmsNodeModules = path.join('/home/itd3/www/rms', 'node_modules');

const [,, dbUrl, ...sqlParts] = process.argv;
const sql = sqlParts.join(' ');

if (!dbUrl || !sql) {
  console.error('Usage: node query.js <database_url> <sql>');
  console.error('  SQLite: sqlite:///path/to/db.db');
  console.error('  MySQL:  mysql://user:password@host:port/database');
  process.exit(1);
}

async function querySQLite(url, sql) {
  const Database = require(path.join(rmsNodeModules, 'better-sqlite3'));
  let dbPath = url.replace(/^sqlite:/, '');
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }
  const db = new Database(dbPath, { readonly: true });
  try {
    if (sql.trim() === '.tables') {
      const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
      console.log('Tables:');
      rows.forEach(r => console.log(`  ${r.name}`));
      return;
    }
    if (sql.trim().startsWith('.schema')) {
      const tableName = sql.trim().split(/\s+/)[1];
      if (tableName) {
        const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(tableName);
        if (row) console.log(row.sql);
        else console.log(`Table '${tableName}' not found`);
      } else {
        const rows = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL ORDER BY name").all();
        rows.forEach(r => console.log(r.sql + ';\n'));
      }
      return;
    }
    const stmt = db.prepare(sql);
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT') ||
                     sql.trim().toUpperCase().startsWith('WITH') ||
                     sql.trim().toUpperCase().startsWith('PRAGMA');
    if (isSelect) {
      const rows = stmt.all();
      if (rows.length === 0) { console.log('(no results)'); return; }
      const columns = Object.keys(rows[0]);
      const widths = columns.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? 'NULL').length)));
      console.log(columns.map((c, i) => c.padEnd(widths[i])).join(' | '));
      console.log(widths.map(w => '-'.repeat(w)).join('-+-'));
      rows.forEach(row => {
        console.log(columns.map((c, i) => String(row[c] ?? 'NULL').padEnd(widths[i])).join(' | '));
      });
      console.log(`\n(${rows.length} rows)`);
    } else {
      const result = stmt.run();
      console.log(`OK. Changes: ${result.changes}, Last insert rowid: ${result.lastInsertRowid}`);
    }
  } finally { db.close(); }
}

async function queryMySQL(url, sql) {
  const mysql = require(path.join(rmsNodeModules, 'mysql2', 'promise'));
  const parsed = new URL(url);
  const connection = await mysql.createConnection({
    host: parsed.hostname, port: parseInt(parsed.port) || 3306,
    user: parsed.username, password: parsed.password || process.env.MYSQL_PWD || process.env.DB_PASSWORD,
    database: parsed.pathname.slice(1), connectTimeout: 10000,
  });
  try {
    const [rows, fields] = await connection.execute(sql);
    if (Array.isArray(rows)) {
      if (rows.length === 0) { console.log('(no results)'); return; }
      const columns = fields.map(f => f.name);
      const widths = columns.map(c => Math.max(c.length, ...rows.map(r => String(r[c] ?? 'NULL').length)));
      console.log(columns.map((c, i) => c.padEnd(widths[i])).join(' | '));
      console.log(widths.map(w => '-'.repeat(w)).join('-+-'));
      rows.forEach(row => {
        console.log(columns.map((c, i) => String(row[c] ?? 'NULL').padEnd(widths[i])).join(' | '));
      });
      console.log(`\n(${rows.length} rows)`);
    } else { console.log(`OK. Affected rows: ${rows.affectedRows}`); }
  } finally { await connection.end(); }
}

async function main() {
  try {
    if (dbUrl.startsWith('sqlite:')) await querySQLite(dbUrl, sql);
    else if (dbUrl.startsWith('mysql:')) await queryMySQL(dbUrl, sql);
    else { console.error('Unsupported URL. Use sqlite: or mysql: prefix.'); process.exit(1); }
  } catch (e) { console.error('Error:', e.message); process.exit(1); }
}
main();
