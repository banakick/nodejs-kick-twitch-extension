import express from 'express';
import cors from 'cors';
import mysql from 'mysql';

const app = express();
const corsOptions = {
  origin: 'https://kick.com',
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuración de la conexión a la base de datos MySQL
const connection = mysql.createConnection({
  host: 'srv1308.hstgr.io',
  user: 'u627195336_kicktwitchjs',
  password: 'AuricularParlanteMouse25',
  database: 'u627195336_datakicktwitch'
});

// Manejo de errores de conexión
connection.on('error', (err) => {
  console.error('Error de conexión a la base de datos:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    // Se perdió la conexión, intentar reconectar
    console.log('Intentando reconectar...');
    connection = mysql.createConnection(connection.config);
  } else {
    throw err;
  }
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

// Cierra la conexión al finalizar
process.on('SIGINT', () => {
  connection.end();
  process.exit(0);
});

process.on('SIGTERM', () => {
  connection.end();
  process.exit(0);
});

// Inicia el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
