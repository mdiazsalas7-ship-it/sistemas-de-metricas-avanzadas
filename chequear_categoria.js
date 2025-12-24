const fs = require('fs');
const archivos = fs.readdirSync('./').filter(f => f.endsWith('.json') && f !== 'base_de_datos_temporada.json');

console.log("🔍 Buscando etiquetas de categoría...");

archivos.forEach(archivo => {
    try {
        const data = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        if(data.partido) {
            console.log(`\nArchivo: ${archivo}`);
            console.log(`- Torneo: ${data.partido.nombre_torneo}`);
            console.log(`- Categoría/Fase: ${data.partido.nombre_fase}`);
            console.log(`- Título: ${data.partido.titulo}`);
        }
    } catch (e) {}
});