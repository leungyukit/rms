import mysql from 'mysql2/promise';

const pw = process.argv[2] || '';
const conn = await mysql.createConnection({
  host: '127.0.0.1',
  user: 'rms',
  password: pw,
  database: 'rms',
});
const [rows] = await conn.query(
  'SELECT t.id, t.user_id, u.username, u.display_name, t.name, t.prefix FROM access_tokens t JOIN users u ON u.id = t.user_id LIMIT 5'
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
