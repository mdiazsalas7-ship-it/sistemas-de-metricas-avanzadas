const fs = require('fs');
const path = require('path');

// Ajusta esto si el archivo está en otra carpeta, pero según tu log es U15
const archivoAEspiar = './datos_torneo/U15/U15_AraguaU14_vs_GladiadoresdeTurmero\'B\'_7976.json';

try {
    if (!fs.existsSync(archivoAEspiar)) {
        console.log("❌ No encuentro el archivo. Verifica el nombre exacto en la carpeta U15.");
    } else {
        const raw = fs.readFileSync(archivoAEspiar, 'utf8');
        const data = JSON.parse(raw);
        
        console.log("=== REPORTE DE ESTRUCTURA ===");
        console.log("1. Llaves Principales:", Object.keys(data));
        
        if (data.partido) {
            console.log("2. Dentro de 'partido':", Object.keys(data.partido));
        } else {
            console.log("2. NO HAY etiqueta 'partido'");
        }

        // Intento de búsqueda manual
        console.log("3. Búsqueda de variantes:");
        console.log("   - data.jugadoresenpistalocal:", data.jugadoresenpistalocal ? "✅ SÍ" : "❌ NO");
        console.log("   - data.partido.jugadoresenpistalocal:", (data.partido && data.partido.jugadoresenpistalocal) ? "✅ SÍ" : "❌ NO");
        console.log("   - data.partido.JugadoresEnPistaLocal:", (data.partido && data.partido.JugadoresEnPistaLocal) ? "✅ SÍ" : "❌ NO");
    }
} catch (e) {
    console.log("Error fatal:", e.message);
}