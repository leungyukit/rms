// /home/itd3/www/rms/_dedupe.js  v1
// 清理 MySQL 中迁移脚本重复跑产生的多余行
const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const fs = require('fs');

const PWD = '***';
const MYSQL_DB = 'rms';
const OFFSET_BASE = 100000;

function mysqlQ(sql) {
  const tmp = `/tmp/_dq_${Date.now()}_${Math.random().toString(36).slice(2,8)}.sql`;
  fs.writeFileSync(tmp, sql);
  try {
    return execSync(`mysql -h 127.0.0.1 -P 3306 -u rms -p${PWD} ${MYSQL_DB} -N -B < ${tmp} 2>&1`, { encoding: 'utf8' }).toString().trim();
  } catch (e) { return ''; }
  finally { try { fs.unlinkSync(tmp); } catch (e) {} }
}

const db = new Database('/home/itd3/www/rms/data/rms.db', { readonly: true });

// 策略：对每张表，按"自然键"分组，保留 id 最小的那一行（优先保留原始 < 100000 的）
// 已知自然键
const NATURAL_KEYS = {
  users: ['username'],
  roles: ['name'],
  projects: ['name'],
  tags: ['name'],
  requirements: ['title', 'created_at'],
  user_roles: ['user_id', 'role_id'],
  user_project_access: ['user_id', 'project_id'],
  role_project_access: ['role_name', 'project_id'],
  requirement_tags: ['requirement_id', 'tag_id'],
  integration_messages: ['channel_external_msg_id'],
  webhook_deliveries: ['event_id'],
  field_visibility_policies: ['entity_field_name'],
  system_config: ['`key`'],
};

function dedupe(table, keys) {
  const rows = mysqlQ(`SELECT id, ${keys.join(',')} FROM \`${table}\` ORDER BY id`).split('\n').filter(Boolean);
  const seen = new Map();
  const toDelete = [];
  for (const row of rows) {
    // 解析：id 是第一列 (tab-separated)
    const parts = row.split('\t');
    const id = parseInt(parts[0], 10);
    const key = parts.slice(1).join('|');
    if (seen.has(key)) {
      toDelete.push(id);
    } else {
      seen.set(key, id);
    }
  }
  if (toDelete.length === 0) {
    console.log(`  ${table}: 无重复`);
    return 0;
  }
  const before = rows.length;
  // 分批删除，每批 100 个
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    mysqlQ(`DELETE FROM \`${table}\` WHERE id IN (${batch.join(',')})`);
  }
  console.log(`  ${table}: 删 ${toDelete.length} (${before} → ${before - toDelete.length})`);
  return toDelete.length;
}

console.log('=== dedupe pass 1: 自然键去重（保留最早 id）===');
let total = 0;
for (const [t, keys] of Object.entries(NATURAL_KEYS)) {
  total += dedupe(t, keys);
}
console.log(`\n小计：删 ${total}`);

// 第二轮：按"重复 title + 同一 project_id"在 requirements 中去重
console.log('\n=== dedupe pass 2: requirements by (title, project_id) ===');
{
  const rows = mysqlQ(`SELECT id, title, project_id FROM requirements ORDER BY id`).split('\n').filter(Boolean);
  const seen = new Map();
  const toDelete = [];
  for (const row of rows) {
    const parts = row.split('\t');
    const id = parseInt(parts[0], 10);
    const title = parts[1] || '';
    const projectId = parts[2] || 'NULL';
    const key = `${title}|${projectId}`;
    if (seen.has(key)) {
      toDelete.push(id);
    } else {
      seen.set(key, id);
    }
  }
  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      mysqlQ(`DELETE FROM requirements WHERE id IN (${batch.join(',')})`);
    }
    console.log(`  requirements: 删 ${toDelete.length}`);
  } else {
    console.log(`  requirements: 无重复`);
  }
}

// 验证最终
console.log('\n=== 最终统计 ===');
const tables = ['users','roles','projects','tags','requirements','user_roles','user_project_access','role_project_access','requirement_tags','comments','audit_logs','status_log','notifications','sla_warnings','weekly_reports','project_costs','integration_configs','integration_messages','webhook_subscriptions','webhook_deliveries','knowledge_entries','knowledge_ai_jobs','knowledge_recommendations','knowledge_review_tasks','field_visibility_policies','user_openclaw_sessions','requirement_relations','project_budget_alerts','requirement_imports','requirement_import_rows','system_config'];
console.log('表'.padEnd(28) + 'SQLite  MySQL');
for (const t of tables) {
  let sc = 0;
  try { sc = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get().c; } catch (e) {}
  const mc = parseInt(mysqlQ(`SELECT COUNT(*) FROM \`${t}\``) || '0', 10);
  console.log(t.padEnd(28) + String(sc).padStart(7) + String(mc).padStart(7));
}
db.close();
