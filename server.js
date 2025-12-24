const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    console.log(`Solicitud recibida para: ${req.url}`);

    if (req.url === '/') {
        // AQUÍ ESTABA EL ERROR: Ahora buscamos index.html
        const filePath = path.join(__dirname, 'index.html');

        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end(`Error: No se encuentra 'index.html'. Ejecuta primero: node generar_web.js`);
                console.error("❌ ERROR: No encuentro index.html");
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(content, 'utf-8');
            }
        });
    } else {
        // Manejo básico para otros archivos (imagenes, etc)
        res.writeHead(404);
        res.end();
    }
});

server.listen(PORT, () => {
    console.log(`\n🚀 SERVIDOR ACTIVO. Abre tu navegador aquí:`);
    console.log(`👉 http://localhost:${PORT}`);
    console.log(`   (Estás visualizando el archivo: index.html)\n`);
});