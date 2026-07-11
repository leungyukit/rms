// 把 db.ts 简化版直接 require
import mysql from 'mysql2/promise';
import deasync from 'deasync';

const pool = mysql.createPool({ 
  host: '127.0.0.1', port: 3306, user: 'rms', password: '***', 
  database: 'rms', connectionLimit: 5 
});

function execSql(sql, params) {
  let result, err, done = false;
  pool.execute(sql, params).then(([rows]) => { result = rows; done = true; })
    .catch(e => { err = e; done = true; });
  deasync.loopWhile(() => !done);
  if (err) throw err;
  return result;
}

// 模拟 login route 的查询
const user = execSql('SELECT id, username, password_hash, display_name FROM users WHERE username = ?', ['admin']);
console.log('user query result:', user);

const bcrypt = await import('bcryptjs');
console.log('admin123 vs hash:', bcrypt.default.compareSync('admin123', user[0]?.password_hash || ''));

pool.end();
