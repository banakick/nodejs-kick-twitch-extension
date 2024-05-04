import express from 'express';
import cors from 'cors';
import db from './database.js';

const port = 3000;
const app = express();
const corsOptions = {
  origin: '*',
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware para analizar el cuerpo de la solicitud como JSON
app.use(express.json());

// Ruta para manejar solicitudes GET a /api/userdata?username=...
app.get('/api/userdata', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).json({ error: 'Se requiere el parámetro "username"' });
  }

  console.log(`Obteniendo puntos para el usuario ${username}`);

  db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    if (row) {
      console.log(`Puntos actuales para ${username}: ${row.points}`);
      res.setHeader('Content-Type', 'application/json');
      res.json({ points: row.points });
    } else {
      console.log(`Usuario ${username} no encontrado, devolviendo 0 puntos.`);
      res.setHeader('Content-Type', 'application/json');
      res.json({ points: 0 });
    }
  });
});

// Ruta para manejar solicitudes POST a /api/userdata
app.post('/api/userdata', (req, res) => {
  const { username, points } = req.body;

  console.log(`Solicitud de actualización de puntos recibida: ${username}, ${points}`);

db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      db.run('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    if (row) {
      // Usuario existente, actualizar puntos
      console.log(`Actualizando puntos para ${username}: ${row.points} -> ${points}`);
      db.run('UPDATE users SET points = ? WHERE username = ?', [points, username], (err) => {
        if (err) {
          db.run('ROLLBACK');
          console.error(err);
          return res.status(500).json({ error: 'Error al actualizar puntos del usuario' });
        }
        console.log(`Puntos actualizados para ${username}: ${points}`);
        res.setHeader('Content-Type', 'application/json');
        res.json({ message: 'Datos de usuario actualizados', points }); // Devolver la nueva cantidad de puntos
        db.run('COMMIT');
      });
    } else {
      // Nuevo usuario, insertar en la base de datos
      console.log(`Nuevo usuario ${username}, creando con ${points} puntos.`);
      db.run('INSERT INTO users (username, points) VALUES (?, ?)', [username, points], (err) => {
        if (err) {
          db.run('ROLLBACK');
          console.error(err);
          return res.status(500).json({ error: 'Error al crear usuario' });
        }
        console.log(`Usuario ${username} creado con ${points} puntos.`);
        res.setHeader('Content-Type', 'application/json');
        res.json({ message: 'Datos de usuario creados', points });
        db.run('COMMIT');
      });
    }
  });
});
});
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
