const fs = require('fs');

// Las categorías que quieres mostrar en la presentación
const CATEGORIAS = ["MINI", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "U20", "LIBRE"];

const jsonBase = {
    "partido": { "local": "Team A", "visitante": "Team B" },
    "envivo": { "historialacciones": [] },
    "EnVivoJugadoresOTT": {
        "JugadoresEnVivoLocal": [
            { "IdJugador": "P1", "Nombre": "Jugador, Prueba" }
        ],
        "JugadoresEnVivoVisitante": []
    }
};

console.log("🛠️  Generando archivos de prueba para activar botones...");

CATEGORIAS.forEach(cat => {
    // Crea un archivo pequeño para cada categoría
    const nombreArchivo = `${cat.toLowerCase()}_demo.json`;
    fs.writeFileSync(nombreArchivo, JSON.stringify(jsonBase, null, 2));
    console.log(`✅ Creado: ${nombreArchivo}`);
});

console.log("\n👉 ¡Listo! Ahora ejecuta 'node generar_web.js' y verás todos los botones.");
