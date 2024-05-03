import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('users.db');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, points INTEGER)');
});

export default db;
