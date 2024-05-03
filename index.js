import express from 'express';
import cors from 'cors';
import mysql from 'mysql';

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

  if (userData[username]) {
    // Usuario existente
    const previousPoints = userData[username];
    userData[username] = points;
    res.json({ message: 'Datos de usuario actualizados', points, previousPoints });
  } else {
    // Nuevo usuario
    userData[username] = points;
    res.json({ message: 'Datos de usuario creados', points });
  }
});
