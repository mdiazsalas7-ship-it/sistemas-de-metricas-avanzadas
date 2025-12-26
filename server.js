const express = require('express');
const path = require('path');
const app = express();

// --- CONFIGURACIÓN DE PUERTO ---
// Cambiamos al 3005 para evitar choques con otros procesos
const PORT = 3000;

// Servir archivos estáticos (imágenes, CSS si hubiera)
app.use(express.static(path.join(__dirname)));

// Ruta principal: Entrega el archivo index.html que generamos
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Arrancar el servidor
app.listen(PORT, () => {
    console.log(`\n🚀 SERVIDOR ACTIVO Y LISTO PARA EL PARTIDO`);
    console.log(`👉 Entra aquí: http://localhost:${PORT}`);
    console.log(`(Presiona Ctrl + C para apagarlo)`);
});