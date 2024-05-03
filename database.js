const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('users.db');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, points INTEGER)');
});

module.exports = db;
