const fs = require('fs');
const RUTA_DB = './base_de_datos_temporada.json';
const IGNORADOS = ['package.json', 'package-lock.json', 'generar_web.js', 'server.js', 'index.js', 'scouting_dashboard.html', 'revisar_tiempo.js', 'investigar.js'];

function iniciarApp() {
    console.log("\n🏀 SISTEMA V5.0 - EFICIENCIA FIBA (VALORACIÓN)");
    let db = cargarDB();
    
    // Si quieres recalcular todo desde cero para aplicar la nueva fórmula a juegos viejos:
    // Borra el archivo 'base_de_datos_temporada.json' manualmente antes de correr esto.
    
    const archivos = fs.readdirSync('./').filter(f => f.endsWith('.json') && !IGNORADOS.includes(f) && f !== 'base_de_datos_temporada.json');
    console.log(`📂 Archivos encontrados: ${archivos.length}`);

    archivos.forEach(f => procesar(f, db));
    
    fs.writeFileSync(RUTA_DB, JSON.stringify(db, null, 2));
    console.log("✅ Datos procesados con Pérdidas y Fallos.");
    console.log("👉 AHORA EJECUTA: node generar_web.js");
}

function cargarDB() {
    if(fs.existsSync(RUTA_DB)) return JSON.parse(fs.readFileSync(RUTA_DB, 'utf8'));
    return { _procesados: [] };
}

function procesar(ruta, db) {
    try {
        const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
        if(!d.partido || !d.envivo) return;
        
        const id = d.partido.id_partido || ruta;
        const nombreLocal = d.partido.local || "Local";
        const nombreVisitante = d.partido.visitante || "Visitante";
        
        // Descomenta esto si no quieres procesar el mismo juego dos veces
        // if(db._procesados.includes(id)) return; 
        console.log(`📥 Procesando: ${ruta}`);

        const historial = d.envivo.historialacciones || [];
        const rosters = [...(d.EnVivoJugadoresOTT.JugadoresEnVivoLocal || []), ...(d.EnVivoJugadoresOTT.JugadoresEnVivoVisitante || [])];

        const registrar = (j, equipo) => {
            if(!db[j.IdJugador]) {
                db[j.IdJugador] = { 
                    nombre: j.Nombre, id: j.IdJugador, equipo: equipo,
                    partidos: 0, pts: 0, reb: 0, ast: 0, rob: 0, blk: 0, flt: 0, 
                    // NUEVOS CAMPOS PARA FORMULA FIBA:
                    perdidas: 0, 
                    fallos_campo: 0, // Tiros de 2 y 3 fallados
                    fallos_libre: 0, // Libres fallados
                    clutch_pts: 0 
                };
            } else { db[j.IdJugador].equipo = equipo; }
        };

        // Registramos jugadores
        (d.EnVivoJugadoresOTT.JugadoresEnVivoLocal||[]).forEach(j => registrar(j, nombreLocal));
        (d.EnVivoJugadoresOTT.JugadoresEnVivoVisitante||[]).forEach(j => registrar(j, nombreVisitante));

        // Procesamos jugadas
        historial.forEach(acc => {
            const j = db[acc.componente_id];
            if(j) {
                const tipo = acc.accion_tipo || "";
                const periodo = acc.numero_periodo; 
                const esClutch = (periodo >= 4);

                // SUMA (LO BUENO)
                if(tipo==="CANASTA-2P"){ j.pts+=2; if(esClutch) j.clutch_pts+=2; }
                if(tipo==="CANASTA-3P"){ j.pts+=3; if(esClutch) j.clutch_pts+=3; }
                if(tipo==="CANASTA-1P"){ j.pts+=1; if(esClutch) j.clutch_pts+=1; }
                
                if(tipo.includes("REBOTE")) j.reb++;
                if(tipo==="ASISTENCIA") j.ast++;
                if(tipo==="RECUPERACION") j.rob++;
                if(tipo==="TAPON-COMETIDO") j.blk++;

                // RESTA (LO MALO) - AQUÍ ESTÁ LA CLAVE
                if(tipo==="PERDIDA") j.perdidas++; 
                if(tipo==="FALTA-COMETIDA") j.flt++;
                
                // Tiros Fallados (Cualquier tiro fallado cuenta)
                if(tipo==="TIRO2-FALLADO" || tipo==="TIRO3-FALLADO") j.fallos_campo++;
                if(tipo==="TIRO1-FALLADO") j.fallos_libre++;
            }
        });

        // Sumar partidos jugados
        if(!db._procesados.includes(id)) {
            rosters.forEach(j => { if(db[j.IdJugador]) db[j.IdJugador].partidos++; });
            db._procesados.push(id);
        }
        
    } catch(e) { console.log("Error en " + ruta); }
}

iniciarApp();