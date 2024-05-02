import express from 'express';
import cors from 'cors';
import mysql from 'mysql2';

const app = express();
const corsOptions = {
  origin: 'https://kick.com',
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuración de la conexión a la base de datos MySQL
const connection = mysql.createConnection({
  host: '193.203.175.72',
  user: 'u627195336_nodeJS',
  password: 'AuricularParlanteMouse25',
  database: 'u627195336_kicktwitch'
});

// Ruta para obtener los puntos de un usuario
app.get('/puntos/:username', (req, res) => {
  const username = req.params.username;

  // Consulta para obtener los puntos del usuario
  const query = 'SELECT puntos FROM usuarios WHERE username = ?';
  connection.query(query, [username], (error, results) => {
    if (error) throw error;

    if (results.length > 0) {
      // Si el usuario existe, envía los puntos
      res.json({ puntos: results[0].puntos });
    } else {
      // Si el usuario no existe, crea uno nuevo con 0 puntos
      const insertQuery = 'INSERT INTO usuarios (username, puntos) VALUES (?, 0)';
      connection.query(insertQuery, [username], (error, results) => {
        if (error) throw error;
        res.json({ puntos: 0 });
      });
    }
  });
});

// Ruta para actualizar los puntos de un usuario
app.put('/puntos/:username', (req, res) => {
  const username = req.params.username;
  const puntos = req.body.puntos;

  // Consulta para actualizar los puntos del usuario
  const query = 'UPDATE usuarios SET puntos = ? WHERE username = ?';
  connection.query(query, [puntos, username], (error, results) => {
    if (error) throw error;
    res.json({ mensaje: 'Puntos actualizados correctamente' });
  });
});

// Inicia el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
