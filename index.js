import express from 'express';
import cors from 'cors';
import db from './database';

const port = 3000;
const app = express();
const corsOptions = {
  origin: '*',
};

app.use(cors(corsOptions));
app.use(express.json());

// Almacenamiento de datos de usuario
const userData = {};

// Middleware para analizar el cuerpo de la solicitud como JSON
app.use(express.json());

app.post('/api/userdata', (req, res) => {
  const { username, points } = req.body;

  db.get('SELECT points FROM users WHERE username = ?', [username], (err, row) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }

    if (row) {
      // Usuario existente, actualizar puntos
      db.run('UPDATE users SET points = ? WHERE username = ?', [points, username], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error al actualizar puntos del usuario' });
        }
        res.json({ message: 'Datos de usuario actualizados', points });
      });
    } else {
      // Nuevo usuario, insertar en la base de datos
      db.run('INSERT INTO users (username, points) VALUES (?, ?)', [username, points], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error al crear usuario' });
        }
        res.json({ message: 'Datos de usuario creados', points });
      });
    }
  });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
