const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
  console.log('Solicitud recibida para: ' + req.url);

  // Si entran a la raíz, les damos el dashboard.html
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './dashboard.html';
  }

  const extname = path.extname(filePath);
  let contentType = 'text/html';

  // Leemos el archivo del disco y lo enviamos al navegador
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == 'ENOENT') {
        res.writeHead(404);
        res.end(
          'Archivo no encontrado. Asegurate de haber corrido generar_web.js primero.'
        );
      } else {
        res.writeHead(500);
        res.end('Error interno del servidor: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 SERVIDOR ACTIVO. Abre el navegador en el puerto ${PORT}`);
  console.log(`👉 Estás viendo: dashboard.html\n`);
});
