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

// Crear tablas para predicciones y votos
db.run(`
  CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    options TEXT NOT NULL,
    duration INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    expiresAt INTEGER NOT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS votes (
    predictionId INTEGER NOT NULL,
    username TEXT NOT NULL,
    option TEXT NOT NULL,
    FOREIGN KEY (predictionId) REFERENCES predictions(id)
  )
`);

loadDataFromBackup();
setInterval(backupDataToFile, 15 * 60 * 1000);

app.get('/api/userdata', (req, res) => {
  const { username, action } = req.query;
  if (!username || !action) {
    return res.status(400).json({ error: 'Se requieren los parámetros "username" y "action"' });
  }

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
  } else {
    return res.status(400).json({ error: 'Acción no válida' });
  }
});

app.post('/api/userdata', async (req, res) => {
  const { username, points, action } = req.body;
  if (action === 'createUser') {
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

// Ruta para crear una nueva predicción
app.post('/api/predictions', (req, res) => {
  const { name, options, duration } = req.body;

  if (!name || !options || !duration) {
    return res.status(400).json({ error: 'Se requieren los campos "name", "options" y "duration"' });
  }

  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + duration * 60;

  db.run(
    'INSERT INTO predictions (name, options, duration, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?)',
    [name, JSON.stringify(options), duration, createdAt, expiresAt],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al crear la predicción' });
      }

      res.json({ id: this.lastID });
    }
  );
});

// Ruta para obtener los detalles de una predicción existente
app.get('/api/predictions/:id', (req, res) => {
  const predictionId = req.params.id;

  db.get(
    'SELECT * FROM predictions WHERE id = ?',
    [predictionId],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al obtener la predicción' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Predicción no encontrada' });
      }

      const options = JSON.parse(row.options);
      const optionVotes = options.reduce((acc, option) => {
        acc[option] = 0;
        return acc;
      }, {});

      db.all(
        'SELECT option, COUNT(*) AS count FROM votes WHERE predictionId = ? GROUP BY option',
        [predictionId],
        (err, rows) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al obtener los votos' });
          }

          rows.forEach(row => {
            optionVotes[row.option] = row.count;
          });

          const prediction = {
            id: row.id,
            name: row.name,
            options: options,
            optionVotes: optionVotes,
            duration: row.duration,
            createdAt: row.createdAt,
            expiresAt: row.expiresAt
          };

          res.json(prediction);
        }
      );
    }
  );
});

// Ruta para enviar votos
app.post('/api/votes', (req, res) => {
  const { predictionId, username, option } = req.body;

  if (!predictionId || !username || !option) {
    return res.status(400).json({ error: 'Se requieren los campos "predictionId", "username" y "option"' });
  }

  db.run(
    'INSERT INTO votes (predictionId, username, option) VALUES (?, ?, ?)',
    [predictionId, username, option],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al enviar el voto' });
      }

      res.json({ success: true });
    }
  );
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
