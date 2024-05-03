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

  // Verificar si el usuario existe en el almacenamiento
  if (userData[username]) {
    // Actualizar los puntos del usuario existente
    userData[username] = points;
  } else {
    // Agregar un nuevo usuario con los puntos iniciales
    userData[username] = points;
  }

  res.json({ message: 'Datos de usuario actualizados' });
});

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
