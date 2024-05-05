import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import jsonfile from 'jsonfile';

const port = 3000;
const app = express();
const corsOptions = {
  origin: '*',
};

const db = new sqlite3.Database('database.sqlite');
const backupFilePath = './db.json';

app.use(cors(corsOptions));
app.use(express.json());

function loadDataFromBackup() {
  try {
    const data = jsonfile.readFileSync(backupFilePath);
    db.serialize(() => {
      db.run('DROP TABLE IF EXISTS users');
      db.run('CREATE TABLE users (username TEXT PRIMARY KEY, points INTEGER)');

      for (const [username, points] of Object.entries(data)) {
        db.run('INSERT INTO users (username, points) VALUES (?, ?)', [username, points]);
      }
    });
    console.log('Datos cargados desde el archivo de respaldo');
  } catch (err) {
    console.error('Error al cargar datos desde el archivo de respaldo:', err);
  }
}

function backupDataToFile() {
  db.all('SELECT username, points FROM users', (err, rows) => {
    if (err) {
      console.error('Error al obtener datos de usuarios:', err);
      return;
    }

    const data = rows.reduce((acc, row) => {
      acc[row.username] = row.points;
      return acc;
    }, {});

    jsonfile.writeFileSync(backupFilePath, data, { spaces: 2 });
    console.log('Datos guardados en el archivo de respaldo');
  });
}

loadDataFromBackup();
setInterval(backupDataToFile, 15 * 60 * 1000);

app.post('/api/userdata', async (req, res) => {
  const { username, points, action } = req.body;

  if (action === 'isKickUsernameSaved') {
    db.get('SELECT COUNT(*) AS count FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al verificar el usuario' });
      }

      const isKickUsernameSaved = row.count > 0;
      res.json({ isKickUsernameSaved });
    });
  } else if (action === 'getPoints') {
    db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener datos del usuario' });
      }

      if (row) {
        res.json({ points: row.points });
      } else {
        res.json({ points: 0 });
      }
    });
  } else if (action === 'createUser') {
    db.run('INSERT INTO users (username, points) VALUES (?, ?)', [username, points], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al crear usuario' });
      }
      res.json({ message: 'Usuario creado', points });
    });
  } else if (action === 'updatePoints') {
    db.run('UPDATE users SET points = ? WHERE username = ?', [points, username], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al actualizar puntos del usuario' });
      }
      res.json({ message: 'Puntos actualizados', points });
    });
  } else {
    return res.status(400).json({ error: 'Acción no válida' });
  }
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
