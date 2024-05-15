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
const blockedUsersFilePath = './blockedusers.json';


app.use(cors(corsOptions));
app.use(express.json());

let blockedUsernames = [];

try {
  blockedUsernames = jsonfile.readFileSync(blockedUsersFilePath);
} catch (err) {
  console.error('Error al leer el archivo blockedusers.json:', err);
}

const checkUsername = (req, res, next) => {
  const { username } = req.query || req.body;

  if (username && blockedUsernames.includes(username)) {
    return res.status(403).json({ error: 'El nombre de usuario está bloqueado' });
  }

  db.get('SELECT COUNT(*) AS count FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al verificar el usuario' });
    }

    if (row.count > 0) {
      if (blockedUsernames.includes(username)) {
        return res.status(403).json({ error: 'El nombre de usuario está bloqueado' });
      }
    }

    next();
  });
};

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

function updateBlockedUsersFile() {
  try {
    jsonfile.writeFileSync(blockedUsersFilePath, blockedUsernames, { spaces: 2 });
    console.log('Archivo blockedusers.json actualizado');
  } catch (err) {
    console.error('Error al escribir el archivo blockedusers.json:', err);
  }
}

const GRACE_PERIOD_MS = 10000; // 10 segundos
const usersCountingPoints = {};

loadDataFromBackup();
setInterval(backupDataToFile, 15 * 60 * 1000);

app.get('/api/userdata', checkUsername, (req, res) => {
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

app.post('/api/userdata', checkUsername, async (req, res) => {
  const { username, points, action } = req.body;

  if (action === 'createUser') {
    // Verificar si el usuario ya existe antes de intentar crearlo
    db.get('SELECT COUNT(*) AS count FROM users WHERE username = ?', [username], (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error al verificar el usuario' });
      }

      if (row.count > 0) {
        // El usuario ya existe, actualizar sus puntos
        db.run('UPDATE users SET points = ? WHERE username = ?', [points, username], (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al actualizar puntos del usuario' });
          }
          res.json({ message: 'Puntos actualizados', points });
        });
      } else {
        // El usuario no existe, crearlo
        db.run('INSERT INTO users (username, points) VALUES (?, ?)', [username, points], (err) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Error al crear usuario' });
          }
          res.json({ message: 'Usuario creado', points });
        });
      }
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

app.post('/api/startcounting', checkUsername, (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
  }

  usersCountingPoints[username] = {
    startTime: Date.now(),
    countingPoints: true
  };

  res.json({ message: 'Comenzando a contar puntos' });
});

app.post('/api/finishedcounting', checkUsername, (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
  }

  const userCountingPoints = usersCountingPoints[username];

  if (!userCountingPoints || !userCountingPoints.countingPoints) {
    return res.status(400).json({ error: 'El usuario no estaba contando puntos' });
  }

  const elapsedTime = Date.now() - userCountingPoints.startTime;
  const elapsedMinutes = Math.floor(elapsedTime / 60000); // 60000 ms = 1 minuto

  if (elapsedMinutes >= 5) {
    const additionalGraceTime = elapsedTime % 60000 + GRACE_PERIOD_MS;
    const totalTimeWithGrace = elapsedMinutes * 60000 + additionalGraceTime;

    if (totalTimeWithGrace >= 5 * 60000) {
      db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error al obtener datos del usuario' });
        }

        const currentPoints = row ? row.points : 0;
        const newPoints = currentPoints + 50;

        db.run('UPDATE users SET points = ? WHERE username = ?', [newPoints, username], (err) => {
          if (err) {
            console.error(err);
           return res.status(500).json({ error: 'Error al actualizar puntos del usuario' });
         }

         delete usersCountingPoints[username];
         res.json({ points: newPoints });
       });
     });
   } else {
     delete usersCountingPoints[username];
     res.status(400).json({ error: 'No se cumplieron los 5 minutos de conteo, incluso con el período de gracia' });
   }
 } else {
   delete usersCountingPoints[username];
   res.status(400).json({ error: 'No se cumplieron los 5 minutos de conteo' });
 }
});

app.post('/ban', (req, res) => {
 const { username } = req.body;

 if (!username) {
   return res.status(400).json({ error: 'Se requiere el nombre de usuario' });
 }

 if (blockedUsernames.includes(username)) {
   return res.status(400).json({ error: 'El nombre de usuario ya está bloqueado' });
 }

 blockedUsernames.push(username);

 try {
   jsonfile.writeFileSync(blockedUsersFilePath, blockedUsernames, { spaces: 2 });
   updateBlockedUsersFile(); // Llamar a la función para actualizar el archivo
   res.json({ message: 'Nombre de usuario bloqueado' });
 } catch (err) {
   console.error('Error al escribir el archivo blockedusers.json:', err);
   res.status(500).json({ error: 'Error al bloquear el nombre de usuario' });
 }
});

app.listen(port, () => {
 console.log(`Servidor escuchando en http://localhost:${port}`);
});
