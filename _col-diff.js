// /home/itd3/www/rms/_col-diff.js
// 看每个表的两边列差异
const Database = require('better-sqlite3');
const { execSync } = require('child_process');
const fs = require('fs');

const PWD = '***';
const db = new Database('/home/itd3/www/rms/data/rms.db', { readonly: true });
const mysqlTables = fs.readFileSync('/tmp/mysql-sorted.txt', 'utf8').trim().split('\n');

function mysqlCols(t) {
  const out = execSync(
    `mysql -h 127.0.0.1 -P 3306 -u rms -p${PWD} rms -N -B -e "SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema='rms' AND table_name='${t}' ORDER BY ORDINAL_POSITION" 2>/dev/null`
  ).toString().trim();
  return out.split('\n').filter(Boolean);
}

for (const t of mysqlTables) {
  const sc = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  try {
    const mc = mysqlCols(t);
    const sset = new Set(sc), mset = new Set(mc);
    const onlyS = sc.filter(c => !mset.has(c));
    const onlyM = mc.filter(c => !sset.has(c));
    if (onlyS.length > 0 || onlyM.length > 0) {
      console.log(`\n${t}:`);
      if (onlyS.length) console.log(`  sqlite-only: ${onlyS.join(', ')}`);
      if (onlyM.length) console.log(`  mysql-only: ${onlyM.join(', ')}`);
    } else {
      console.log(`${t}: identical columns`);
    }
  } catch (e) {
    console.log(`${t}: ERROR ${e.message}`);
  }
}
