// /home/itd3/www/rms/_merge.js  v4
// SQLite → MySQL 合并 - 修复版（safeExec 抛错 / 自然键去重 / 列映射）
const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const fs = require('fs');

const PWD = '***';
const MYSQL_DB = 'rms';
const OFFSET_BASE = 100000;

function mysqlQ(sql) {
  const tmp = `/tmp/_mqq_${Date.now()}_${Math.random().toString(36).slice(2,8)}.sql`;
  fs.writeFileSync(tmp, sql);
  try {
    return execSync(`mysql -h 127.0.0.1 -P 3306 -u rms -p${PWD} ${MYSQL_DB} -N -B < ${tmp} 2>/dev/null`, { encoding: 'utf8' }).toString().trim();
  } catch (e) {
    return (e.stdout || '').toString().trim();
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

function mysqlExec(sql) {
  const tmp = `/tmp/_mex_${Date.now()}_${Math.random().toString(36).slice(2,8)}.sql`;
  const out = `/tmp/_mout_${Date.now()}_${Math.random().toString(36).slice(2,8)}.log`;
  fs.writeFileSync(tmp, sql);
  try {
    const cmd = `bash -c 'mysql -h 127.0.0.1 -P 3306 -u rms -p${PWD} ${MYSQL_DB} < ${tmp} >${out} 2>&1; exit 0'`;
    execSync(cmd, { encoding: 'utf8' });
    const result = fs.readFileSync(out, 'utf8');
    if (result.includes('ERROR')) {
      const errLines = result.trim().split(String.fromCharCode(10)).filter(l => l.includes('ERROR'));
      throw new Error(errLines.join(' | '));
    }
    return result;
  } finally { try { fs.unlinkSync(tmp); } catch (e) {} try { fs.unlinkSync(out); } catch (e) {} }
}

function sqlEscape(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\0/g, '')}'`;
}

const db = new Database('/home/itd3/www/rms/data/rms.db', { readonly: true });

const _mysqlColsCache = {};
function mysqlCols(t) {
  if (!_mysqlColsCache[t]) {
    try {
      _mysqlColsCache[t] = mysqlQ(`SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema='${MYSQL_DB}' AND table_name='${t}' ORDER BY ORDINAL_POSITION`).split('\n').filter(Boolean);
    } catch (e) { _mysqlColsCache[t] = []; }
  }
  return _mysqlColsCache[t];
}

function pickInsertValues(tableName, sqliteRow, colMap) {
  const mCols = mysqlCols(tableName);
  const rename = colMap?.rename || {};
  const result = {};
  for (const mc of mCols) {
    if (sqliteRow.hasOwnProperty(mc) && sqliteRow[mc] !== undefined) {
      result[mc] = sqliteRow[mc];
      continue;
    }
    let found = null, foundFlag = false;
    for (const [sqlCol, mysqlCol] of Object.entries(rename)) {
      if (mysqlCol === mc && sqliteRow.hasOwnProperty(sqlCol)) {
        found = sqliteRow[sqlCol];
        foundFlag = true;
        break;
      }
    }
    if (foundFlag) { result[mc] = found; continue; }
    result[mc] = null;
  }
  return result;
}

const TABLES = {
  users:                { tier: 0, remapId: true,  fks: {}, colMap: { rename: { wecom_userid: 'external_id' } }, matchBy: 'username' },
  roles:                { tier: 0, remapId: false, fks: {}, matchBy: 'name' },
  projects:             { tier: 0, remapId: true,  fks: { created_by: 'users' }, matchBy: 'name' },
  tags:                 { tier: 0, remapId: true,  fks: {}, matchBy: 'name' },
  requirements:         { tier: 1, remapId: true,  fks: {
    project_id: 'projects', handler_id: 'users', verifier_id: 'users',
    receiver_id: 'users', parent_id: 'requirements', merged_into: 'requirements'
  }},
  access_tokens:        { tier: 1, remapId: true,  fks: { user_id: 'users' } },
  user_openclaw_sessions:{tier: 1, remapId: true,  fks: { user_id: 'users' } },
  knowledge_entries:    { tier: 1, remapId: true,  fks: {
    source_requirement_id: 'requirements',
    created_by: 'users', approved_by: 'users', reviewed_by: 'users',
    last_reviewed_by: 'users'
  }},
  status_log:           { tier: 2, remapId: true,  fks: { requirement_id: 'requirements', changed_by: 'users' } },
  audit_logs:           { tier: 2, remapId: true,  fks: { user_id: 'users' } },
  sla_warnings:         { tier: 2, remapId: true,  fks: { requirement_id: 'requirements' } },
  notifications:        { tier: 2, remapId: true,  fks: { user_id: 'users' } },
  requirement_relations:{ tier: 2, remapId: true,  fks: { source_id: 'requirements', target_id: 'requirements' } },
  requirement_versions: { tier: 2, remapId: true,  fks: { requirement_id: 'requirements', changed_by: 'users' } },
  requirement_timeline: { tier: 2, remapId: true,  fks: { requirement_id: 'requirements', created_by: 'users' } },
  requirement_tags:     { tier: 2, remapId: false, fks: { requirement_id: 'requirements', tag_id: 'tags' }, composite: ['requirement_id', 'tag_id'] },
  requirement_comments: { tier: 2, remapId: true,  fks: { requirement_id: 'requirements', user_id: 'users' }, targetTable: 'comments' },
  requirement_templates:{ tier: 2, remapId: true,  fks: { created_by: 'users' } },
  requirement_attachments:{tier: 2, remapId: true,  fks: { requirement_id: 'requirements', user_id: 'users' } },
  project_costs:        { tier: 2, remapId: true,  fks: { project_id: 'projects', created_by: 'users', requirement_id: 'requirements' } },
  project_budget_alerts:{ tier: 2, remapId: true,  fks: { project_id: 'projects', acknowledged_by: 'users' } },
  integration_configs:  { tier: 2, remapId: true,  fks: { created_by: 'users' } },
  integration_messages: { tier: 2, remapId: true,  fks: { config_id: 'integration_configs', requirement_id: 'requirements' } },
  webhook_subscriptions:{ tier: 2, remapId: true,  fks: { owner_user_id: 'users' } },
  webhook_deliveries:   { tier: 2, remapId: true,  fks: { subscription_id: 'webhook_subscriptions' } },
  weekly_reports:       { tier: 2, remapId: true,  fks: { user_id: 'users', generated_by: 'users', project_id: 'projects' } },
  knowledge_ai_jobs:    { tier: 2, remapId: true,  fks: {
    requirement_id: 'requirements', knowledge_entry_id: 'knowledge_entries', triggered_by: 'users'
  }},
  knowledge_recommendations:{tier: 2, remapId: true,  fks: {} },
  knowledge_review_tasks:{tier: 2, remapId: true,  fks: { entry_id: 'knowledge_entries', assigned_to: 'users' } },
  field_visibility_policies:{tier: 2, remapId: true,  fks: { created_by: 'users' } },
  user_roles:           { tier: 2, remapId: false, fks: { user_id: 'users', role_id: 'roles' }, composite: ['user_id', 'role_id'] },
  user_project_access:  { tier: 2, remapId: false, fks: { user_id: 'users', project_id: 'projects' }, composite: ['user_id', 'project_id'] },
  role_project_access:  { tier: 2, remapId: false, fks: { role_id: 'roles', project_id: 'projects' },
                          colMap: { rename: { role_id: 'role_name' } },
                          composite: ['role_name', 'project_id'] },
  requirement_imports:  { tier: 2, remapId: true,  fks: { created_by: 'users' } },
  system_config:        { tier: 2, remapId: false, fks: {}, mode: 'dedup' },
  requirement_import_rows:{tier: 3, remapId: true, fks: { import_id: 'requirement_imports', requirement_id: 'requirements' } },
};

// === Phase 1: 自然键 remap ===
console.log('--- Phase 1: natural-key remap ---');
const remaps = {};
for (const [t, cfg] of Object.entries(TABLES)) {
  if (!cfg.matchBy) continue;
  if (cfg.matchBy === 'name' && t === 'roles') continue;
  const myKeys = new Set(mysqlQ(`SELECT ${cfg.matchBy} FROM \`${t}\``).split('\n').filter(Boolean));
  const rows = db.prepare(`SELECT id, ${cfg.matchBy} FROM ${t} ORDER BY id`).all();
  const myMax = parseInt(mysqlQ(`SELECT COALESCE(MAX(id), 0) FROM \`${t}\``) || '0', 10);
  let offset = cfg.remapId ? (myMax + OFFSET_BASE) : null;
  remaps[t] = {};
  for (const r of rows) {
    if (myKeys.has(String(r[cfg.matchBy]))) {
      const myId = mysqlQ(`SELECT id FROM \`${t}\` WHERE ${cfg.matchBy} = ${sqlEscape(r[cfg.matchBy])}`);
      remaps[t][r.id] = parseInt(myId, 10);
    } else {
      if (cfg.remapId) remaps[t][r.id] = offset++;
    }
  }
  const matched = rows.filter(r => myKeys.has(String(r[cfg.matchBy]))).length;
  console.log(`  ${t}: ${matched}/${rows.length} matched (by ${cfg.matchBy})`);
}

// === Phase 2: 纯 id remap ===
console.log('\n--- Phase 2: id-only remap ---');
for (const [t, cfg] of Object.entries(TABLES)) {
  if (cfg.matchBy) continue;
  if (!cfg.remapId) continue;
  const myMax = parseInt(mysqlQ(`SELECT COALESCE(MAX(id), 0) FROM \`${t}\``) || '0', 10);
  const offset = myMax + OFFSET_BASE;
  const rows = db.prepare(`SELECT id FROM ${t} ORDER BY id`).all();
  remaps[t] = {};
  for (const r of rows) remaps[t][r.id] = r.id + offset;
  if (rows.length > 0) console.log(`  ${t}: ${rows.length} ids, offset=${offset}`);
}

// === Phase 3: 按 tier 合并 ===
console.log('\n--- Phase 3: merge by tier ---');
const tiers = {};
for (const [t, cfg] of Object.entries(TABLES)) (tiers[cfg.tier] = tiers[cfg.tier] || []).push(t);
const errors = [];
const counts = {};

function insertRow(target, cols, vals) {
  const sql = `INSERT IGNORE INTO \`${target}\` (${cols.map(c => '`'+c+'`').join(',')}) VALUES (${vals.join(',')});`;
  return mysqlExec(sql);
}

for (let tier = 0; tier <= 3; tier++) {
  for (const t of (tiers[tier] || [])) {
    const cfg = TABLES[t];
    const target = cfg.targetTable || t;
    const cnt = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c;
    if (cnt === 0) { counts[t] = { skipped: 'empty' }; continue; }

    if (cfg.mode === 'dedup') {
      const rows = db.prepare(`SELECT * FROM ${t}`).all();
      const existingKeys = new Set(mysqlQ(`SELECT \`key\` FROM \`${t}\``).split('\n').filter(Boolean));
      let inserted = 0, skipped = 0, failed = 0;
      for (const r of rows) {
        if (existingKeys.has(r.key)) { skipped++; continue; }
        const cols = Object.keys(r);
        const vals = cols.map(c => sqlEscape(r[c]));
        try { insertRow(t, cols, vals); inserted++; }
        catch (e) { errors.push(`${t} (key=${r.key}): ${String(e).slice(0, 200)}`); failed++; }
      }
      counts[t] = { inserted, skipped, failed };
      console.log(`  ${t}: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
      continue;
    }

    if (cfg.matchBy) {
      const rows = db.prepare(`SELECT * FROM ${t}`).all();
      const myKeys = new Set(mysqlQ(`SELECT ${cfg.matchBy} FROM \`${t}\``).split('\n').filter(Boolean));
      let inserted = 0, skipped = 0, failed = 0;
      let offset = cfg.remapId ? (parseInt(mysqlQ(`SELECT COALESCE(MAX(id), 0) FROM \`${t}\``) || '0', 10) + 1) : null;
      for (const r of rows) {
        if (myKeys.has(String(r[cfg.matchBy]))) { skipped++; continue; }
        const newRow = pickInsertValues(target, r, cfg.colMap);
        if (cfg.remapId) newRow.id = offset++;
        for (const [fkCol, refTable] of Object.entries(cfg.fks)) {
          if (newRow[fkCol] == null) continue;
          // INT FK 列：非数字直接 NULL（处理 SQLite 中的 'ai' 等）
          if (typeof newRow[fkCol] !== 'number' && !/^\d+$/.test(String(newRow[fkCol]))) {
            newRow[fkCol] = null; continue;
          }
          const m = remaps[refTable];
          if (m && m[newRow[fkCol]] !== undefined) newRow[fkCol] = m[newRow[fkCol]];
        }
        const cols = Object.keys(newRow);
        const vals = cols.map(c => sqlEscape(newRow[c]));
        try { insertRow(target, cols, vals); inserted++; }
        catch (e) { errors.push(`${target} (${cfg.matchBy}=${r[cfg.matchBy]}): ${String(e).slice(0, 200)}`); failed++; }
      }
      counts[t] = { inserted, skipped, failed };
      console.log(`  ${t}: ${inserted} new, ${skipped} matched, ${failed} failed`);
      continue;
    }

    const rows = db.prepare(`SELECT * FROM ${t}`).all();
    if (rows.length === 0) { counts[t] = 0; continue; }
    let inserted = 0, skipped = 0, failed = 0;

    let existingSet = null;
    if (cfg.composite) {
      const mCols = mysqlCols(target);
      const compCols = cfg.composite.filter(c => mCols.includes(c));
      if (compCols.length < cfg.composite.length) {
        errors.push(`${target}: composite cols [${cfg.composite.join(',')}] missing in MySQL; skipping ${rows.length} rows`);
        counts[t] = { skipped: 'composite mismatch' };
        console.log(`  ${target}: SKIPPED (composite mismatch)`);
        continue;
      }
      const existing = mysqlQ(`SELECT ${compCols.map(c => 'COALESCE(' + c + ", '∅')").join(',')} FROM \`${target}\``).split('\n').filter(Boolean);
      existingSet = new Set(existing);
    }

    let existingIds = null;
    if (cfg.remapId) {
      const ids = mysqlQ(`SELECT id FROM \`${target}\` WHERE id >= ${OFFSET_BASE}`).split('\n').filter(Boolean).map(Number);
      existingIds = new Set(ids);
    }

    for (const r of rows) {
      const newRow = pickInsertValues(target, r, cfg.colMap);
      if (cfg.remapId && r.id != null) {
        if (remaps[t][r.id] === undefined) { errors.push(`${t}: no remap for id ${r.id}`); failed++; continue; }
        newRow.id = remaps[t][r.id];
        if (existingIds.has(newRow.id)) { skipped++; continue; }
      }
      for (const [fkCol, refTable] of Object.entries(cfg.fks)) {
        if (newRow[fkCol] == null) continue;
        if (typeof newRow[fkCol] !== 'number' && !/^\d+$/.test(String(newRow[fkCol]))) {
          newRow[fkCol] = null; continue;
        }
        const m = remaps[refTable];
        if (m && m[newRow[fkCol]] !== undefined) newRow[fkCol] = m[newRow[fkCol]];
      }
      if (cfg.composite) {
        const compositeKey = cfg.composite.map(c => String(newRow[c] ?? '∅')).join('|');
        if (existingSet.has(compositeKey)) { skipped++; continue; }
        existingSet.add(compositeKey);
      }
      const cols = Object.keys(newRow);
      const vals = cols.map(c => sqlEscape(newRow[c]));
      try { insertRow(target, cols, vals); inserted++; existingIds?.add(newRow.id); }
      catch (e) { errors.push(`${target} (sqlite id=${r.id}): ${String(e).slice(0, 200)}`); failed++; }
    }
    counts[t] = { inserted, skipped, failed };
    console.log(`  ${t} → ${target}: ${inserted} inserted, ${skipped} skipped, ${failed} failed`);
  }
}

// Phase 4: source_job_id 循环依赖
console.log('\n--- Phase 4: source_job_id ---');
if (remaps['knowledge_ai_jobs'] && mysqlCols('knowledge_entries').includes('source_job_id')) {
  const kaijRemap = remaps['knowledge_ai_jobs'];
  const cases = Object.entries(kaijRemap).map(([oldId, newId]) => `WHEN source_job_id = ${oldId} THEN ${newId}`).join(' ');
  if (cases) {
    try {
      mysqlExec(`UPDATE knowledge_entries SET source_job_id = CASE ${cases} ELSE source_job_id END WHERE source_job_id IS NOT NULL;`);
      console.log('  OK');
    } catch (e) { console.log('  ', String(e).slice(0, 200)); }
  } else console.log('  no remap');
} else console.log('  skipped');

console.log('\n--- summary ---');
console.log(JSON.stringify(counts, null, 2));
if (errors.length) {
  console.log(`\nERRORS (${errors.length}):`);
  errors.slice(0, 50).forEach(e => console.log('  ' + e));
  if (errors.length > 50) console.log('  ... and ' + (errors.length - 50) + ' more');
} else console.log('\nNO ERRORS ✅');
