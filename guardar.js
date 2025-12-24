const fs = require('fs');
const path = require('path');

// RECIBIMOS LA CATEGORÍA DESDE LA TERMINAL (Ej: node guardar.js U15)
const categoria = process.argv[2] ? process.argv[2].toUpperCase() : "GENERAL";
const ARCHIVO_FUENTE = './cargador.json';
const CARPETA_DESTINO = `./datos_torneo/${categoria}`;

// 1. CREAR LA CARPETA SI NO EXISTE
if (!fs.existsSync('./datos_torneo')) fs.mkdirSync('./datos_torneo');
if (!fs.existsSync(CARPETA_DESTINO)) fs.mkdirSync(CARPETA_DESTINO);

try {
    // 2. LEER EL CÓDIGO CRUDO QUE PEGASTE
    const raw = fs.readFileSync(ARCHIVO_FUENTE, 'utf8');
    if (!raw || raw.trim() === "") {
        console.log("❌ El archivo 'cargador.json' está vacío. Pega el código del juego ahí primero.");
        process.exit();
    }

    const data = JSON.parse(raw);

    // 3. DETECTAR NOMBRES PARA CREAR EL ARCHIVO AUTOMÁTICAMENTE
    // Buscamos quién jugó para ponerle nombre al archivo
    const local = (data.partido.local || "Local").replace(/ /g, "");
    const visita = (data.partido.visitante || "Visita").replace(/ /g, "");
    const idJuego = data.partido.idlocal || Math.floor(Math.random() * 10000);
    
    // Nombre del archivo: U15_Toro_vs_Barraca_8018.json
    const nombreArchivo = `${categoria}_${local}_vs_${visita}_${idJuego}.json`;
    const rutaFinal = path.join(CARPETA_DESTINO, nombreArchivo);

    // 4. GUARDAR EL ARCHIVO EN LA CARPETA CORRECTA
    fs.writeFileSync(rutaFinal, raw);

    console.log("✅ ¡Juego Procesado!");
    console.log(`📂 Categoría: ${categoria}`);
    console.log(`📄 Archivo creado: ${nombreArchivo}`);
    console.log("-----------------------------------------");
    console.log("👉 AHORA: Borra el contenido de 'cargador.json', pega el siguiente juego y repite.");

} catch (error) {
    console.log("❌ Error fatal: El código que pegaste en 'cargador.json' está incompleto o mal copiado.");
    console.log(error.message);
}