const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
const CARPETA_RAIZ = './datos_torneo'; 
const LOGO_ASOCIACION = "https://i.postimg.cc/fyq3J3kg/download.jpg"; 
const LOGOS_EQUIPOS = { 
    "LOBOS": "https://cdn-icons-png.flaticon.com/512/451/451761.png",
    // Agrega tus logos aquí
};

function getLogo(nombreEquipo) {
    if (!nombreEquipo) return "https://ui-avatars.com/api/?name=??&background=333&color=fff";
    const nombreMayus = nombreEquipo.toUpperCase();
    for (const [key, url] of Object.entries(LOGOS_EQUIPOS)) { if (nombreMayus.includes(key)) return url; }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreEquipo)}&background=random&length=2&bold=true&color=fff`;
}

// --- FASE 1: PROCESAMIENTO JUGADA A JUGADA (AUDITADO) ---
function procesarDatos() {
    console.log("⚙️  S.G.S. Aragua - Auditoría de Jugadas (V18.0)...");
    let db = {}; 

    if (!fs.existsSync(CARPETA_RAIZ)) return db;

    const carpetasCategorias = fs.readdirSync(CARPETA_RAIZ, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    carpetasCategorias.forEach(categoria => {
        const nombreCategoria = categoria.toUpperCase();
        db[nombreCategoria] = { jugadores: {} };
        const rutaCategoria = path.join(CARPETA_RAIZ, categoria);
        const archivos = fs.readdirSync(rutaCategoria).filter(f => f.endsWith('.json'));

        archivos.forEach(archivo => {
            try {
                const rutaCompleta = path.join(rutaCategoria, archivo);
                const raw = fs.readFileSync(rutaCompleta, 'utf8');
                const data = JSON.parse(raw);
                
                if (!data.partido || !data.envivo) return;

                const equipoLocal = (data.partido.local || "LOCAL").toUpperCase();
                const equipoVisitante = (data.partido.visitante || "VISITANTE").toUpperCase();
                const historial = data.envivo.historialacciones || [];
                const dbJugadores = db[nombreCategoria].jugadores;

                // 1. MAPEO DE NOMBRES (Usamos la lista OTT que trae a TODOS los jugadores)
                let mapaIds = {}; // ID Numérico -> Objeto Jugador

                const registrarRoster = (lista, equipo) => {
                    if (!lista) return;
                    lista.forEach(j => {
                        const idNum = String(j.IdJugador);
                        const nombreLimpio = j.Nombre.trim().toUpperCase(); // Normalizar nombre
                        
                        mapaIds[idNum] = nombreLimpio; // Guardamos referencia ID -> Nombre

                        // Inicializamos al jugador en la base de datos global si no existe
                        if (!dbJugadores[nombreLimpio]) {
                            dbJugadores[nombreLimpio] = { 
                                nombre: j.Nombre, 
                                equipo: equipo,
                                pts: 0, tiros_intentados: 0, asistencias: 0, perdidas: 0,
                                reb_def: 0, reb_of: 0, rob: 0, blk: 0, clutch_score: 0,
                                faltas: 0
                            };
                        } else {
                            // Actualizamos equipo por si acaso
                            dbJugadores[nombreLimpio].equipo = equipo;
                        }
                    });
                };

                registrarRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoLocal, equipoLocal);
                registrarRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoVisitante, equipoVisitante);

                // 2. AUDITORÍA DEL HISTORIAL (La clave del éxito)
                historial.forEach(acc => {
                    // FILTRO CRÍTICO: Si la jugada fue "eliminada" por la mesa, LA IGNORAMOS
                    if (String(acc.eliminado).toUpperCase() === "TRUE") return; 

                    const idNum = String(acc.componente_id);
                    const nombreJugador = mapaIds[idNum]; // Buscamos quién fue por su ID
                    
                    if (nombreJugador && dbJugadores[nombreJugador]) {
                        const tipo = (acc.accion_tipo || "").toUpperCase();
                        let stats = dbJugadores[nombreJugador];
                        let puntosJugada = 0;

                        // --- SISTEMA DE PUNTOS STRICTO ---
                        // Solo sumamos si dice explícitamente CANASTA
                        if (tipo.includes("CANASTA")) {
                            if (tipo.includes("3P")) puntosJugada = 3;
                            else if (tipo.includes("2P")) puntosJugada = 2;
                            else if (tipo.includes("1P")) puntosJugada = 1; // Tiros libres anotados
                        }

                        // --- SUMAR ESTADÍSTICAS ---
                        if (puntosJugada > 0) stats.pts += puntosJugada;
                        
                        // Intentos de tiro (Canastas + Fallos)
                        // OJO: No contamos "2-TIROS-LIBRES" como intento, solo el tiro real
                        if (tipo.includes("CANASTA") || tipo.includes("FALLADO")) {
                             // Si quieres contar intentos de libre, descomenta esto. Para % de campo, excluye libres.
                             if (!tipo.includes("1P") && !tipo.includes("TIRO1")) stats.tiros_intentados++;
                        }

                        if (tipo.includes("ASISTENCIA")) stats.asistencias++;
                        if (tipo.includes("PERDIDA")) stats.perdidas++;
                        if (tipo.includes("REBOTE-DEFENSIVO")) stats.reb_def++;
                        if (tipo.includes("REBOTE-OFENSIVO")) stats.reb_of++;
                        
                        // Robos y Tapones (Suelen tener nombres variados)
                        if (tipo.includes("RECUPERACION") || tipo.includes("ROBO")) stats.rob++;
                        if (tipo.includes("TAPON") && !tipo.includes("RECIBIDO")) stats.blk++;
                        
                        // Faltas
                        if (tipo.includes("FALTA-COMETIDA")) stats.faltas++;

                        // --- FACTOR SANGRE FRÍA (Q4 en adelante) ---
                        if (acc.numero_periodo >= 4) {
                            stats.clutch_score += puntosJugada;
                            if (tipo.includes("ASISTENCIA")) stats.clutch_score += 1;
                            if (tipo.includes("REBOTE")) stats.clutch_score += 0.5;
                            if (tipo.includes("RECUPERACION")) stats.clutch_score += 1;
                            if (tipo.includes("PERDIDA")) stats.clutch_score -= 2;
                        }
                    }
                });

            } catch (e) { console.error(`Error en ${archivo}:`, e.message); }
        });
    });
    return db;
}

// --- FASE 2: RANKING G.O.P. ---
function calcularRanking(db) {
    Object.keys(db).forEach(cat => {
        Object.values(db[cat].jugadores).forEach(j => {
            const reb_total = j.reb_def + j.reb_of;
            
            // Fórmula GOP: (Puntos + Asistencias*2) / (Tiros de Campo + Asistencias + Pérdidas)
            // Ajuste: Si Tiros+Ast+Perd es 0, usamos 1 para evitar error
            const posesiones = j.tiros_intentados + j.asistencias + j.perdidas;
            const produccion = j.pts + (j.asistencias * 2);
            
            j.gop = posesiones > 0 ? (produccion / posesiones) : 0;
            j.stops = reb_total + j.rob + j.blk;
            j.reb_total = reb_total;

            // Score Ranking S.G.S (Ponderado)
            // Ofensiva (40%) + Defensa (40%) + Creación (20%)
            const scoreOf = (j.gop * 20) + (j.pts * 0.4); 
            const scoreDef = (j.stops * 1.5) + (j.rob * 0.5);
            j.rankingScore = parseFloat((scoreOf + scoreDef + (j.asistencias * 0.5)).toFixed(1));
        });
    });
    return db;
}

// --- FASE 3: GENERADOR HTML ---
function generarHTML(db) {
    const categorias = Object.keys(db).sort();
    
    const scriptJS = `
        <script>
            function openCategoria(evt, catName) {
                var i, tabcontent, tablinks;
                tabcontent = document.getElementsByClassName("tabcontent");
                for (i = 0; i < tabcontent.length; i++) { tabcontent[i].style.display = "none"; }
                tablinks = document.getElementsByClassName("tablinks");
                for (i = 0; i < tablinks.length; i++) { tablinks[i].className = tablinks[i].className.replace(" active", ""); }
                document.getElementById(catName).style.display = "block";
                evt.currentTarget.className += " active";
            }
            function switchView(catName, viewType) {
                document.getElementById(catName + '_tradicional').style.display = 'none';
                document.getElementById(catName + '_avanzada').style.display = 'none';
                document.getElementById(catName + '_convocados').style.display = 'none';
                document.getElementById('btn_trad_' + catName).className = 'btn-switch';
                document.getElementById('btn_adv_' + catName).className = 'btn-switch';
                document.getElementById('btn_top_' + catName).className = 'btn-preseleccion'; 
                if(viewType === 'trad') {
                    document.getElementById(catName + '_tradicional').style.display = 'grid';
                    document.getElementById('btn_trad_' + catName).className += ' active-switch';
                } else if(viewType === 'adv') {
                    document.getElementById(catName + '_avanzada').style.display = 'grid';
                    document.getElementById('btn_adv_' + catName).className += ' active-switch';
                } else if(viewType === 'top') {
                    document.getElementById(catName + '_convocados').style.display = 'block';
                    document.getElementById('btn_top_' + catName).className += ' active-pre';
                }
            }
            window.onload = function() { if(document.getElementsByClassName("tablinks").length > 0) document.getElementsByClassName("tablinks")[0].click(); };
        </script>
    `;

    const estilosCSS = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #eceff1; margin: 0; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; padding: 20px; background: white; border-radius: 6px; border-bottom: 5px solid #b71c1c; display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; }
            .header img { height: 80px; }
            .header h1 { color: #b71c1c; margin: 0; font-size: 24px; text-transform: uppercase; }
            .tab { background-color: #263238; border-radius: 6px 6px 0 0; display: flex; justify-content: center; flex-wrap: wrap; }
            .tab button { background: inherit; border: none; cursor: pointer; padding: 14px 20px; color: #cfd8dc; font-weight: bold; transition: 0.3s; }
            .tab button:hover { background: #37474f; color: white; }
            .tab button.active { background: #b71c1c; color: white; }
            .tabcontent { display: none; padding: 20px; background: white; border-radius: 0 0 6px 6px; }
            .control-panel { margin-bottom: 25px; text-align: center; background: #f5f5f5; padding: 15px; border-radius: 8px; border: 1px solid #ddd; }
            .btn-preseleccion { display: block; width: 100%; padding: 15px; background: #263238; color: #ffd700; font-size: 16px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 15px; text-transform: uppercase; }
            .btn-switch { padding: 12px; border: 2px solid #b0bec5; background: white; color: #546e7a; font-weight: bold; cursor: pointer; border-radius: 5px; text-transform: uppercase; font-size: 12px; }
            .active-switch { background: #546e7a; color: white; border-color: #546e7a; }
            .active-pre { background: #ffd700; color: #000; box-shadow: 0 0 15px rgba(255, 215, 0, 0.4); }
            .grid-tradicional, .grid-avanzada { display: none; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
            .card-head { padding: 15px 10px; background: #fafafa; border-bottom: 1px solid #eee; text-align: center; }
            .head-title { font-weight: bold; color: #37474f; text-transform: uppercase; font-size: 14px; display: block; }
            .head-desc { font-size: 11px; color: #78909c; display: block; margin-top: 4px; }
            .head-formula { font-family: 'Courier New', monospace; font-size: 10px; background: #eceff1; padding: 3px 8px; border-radius: 4px; color: #555; display: inline-block; margin-top: 6px; border: 1px solid #cfd8dc; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            td { padding: 10px; border-bottom: 1px solid #f1f1f1; vertical-align: middle; }
            .jugador-flex { display: flex; align-items: center; gap: 10px; }
            .team-logo { width: 32px; height: 32px; border-radius: 50%; object-fit: contain; border: 1px solid #eee; background: #fff; }
            .jug-nombre { font-weight: 700; color: #333; display: block; line-height: 1.2; }
            .jug-equipo { font-size: 10px; color: #777; text-transform: uppercase; }
            .stat-val { font-weight: bold; text-align: right; font-size: 15px; color: #333; }
            .rank-num { background: #eceff1; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-right: 5px; font-weight: bold; color: #555; }
            .b-pts { border-top: 4px solid #b71c1c; } .b-reb { border-top: 4px solid #f57f17; }
            .b-ast { border-top: 4px solid #1565c0; } .b-rob { border-top: 4px solid #2e7d32; }
            .b-clutch { border-top: 4px solid #00bcd4; background: linear-gradient(to bottom, #f0fdff, #fff); } .t-clutch { color: #0097a7; }
            .b-dark { border-top: 4px solid #37474f; }
        </style>
    `;

    const renderCategoria = (cat, data) => {
        const jugadores = Object.values(data.jugadores).filter(x => x.nombre);
        
        // --- ORDENAMIENTOS ---
        const topPts = [...jugadores].sort((a,b) => b.pts - a.pts).slice(0, 5);
        const topReb = [...jugadores].sort((a,b) => b.reb_total - a.reb_total).slice(0, 5);
        const topAst = [...jugadores].sort((a,b) => b.asistencias - a.asistencias).slice(0, 5);
        const topRob = [...jugadores].sort((a,b) => b.rob - a.rob).slice(0, 5);

        const topDef = [...jugadores].sort((a, b) => b.stops - a.stops).slice(0, 5);
        const topOff = [...jugadores].filter(j=>j.tiros_intentados>=5).sort((a, b) => b.gop - a.gop).slice(0, 5);
        const topClutch = [...jugadores].sort((a, b) => b.clutch_score - a.clutch_score).slice(0, 5);

        const ranking = [...jugadores].sort((a, b) => b.rankingScore - a.rankingScore).slice(0, 30);
        
        const row = (j, i, val, label) => `<tr><td><div class="jugador-flex"><span class="rank-num">#${i+1}</span><img src="${getLogo(j.equipo)}" class="team-logo"><div><span class="jug-nombre">${j.nombre.split(',')[0]}</span><span class="jug-equipo">${j.equipo}</span></div></div></td><td class="stat-val">${val} <small style="font-size:9px; color:#999">${label}</small></td></tr>`;
        const eduHeader = (titulo, desc, formula, colorClass) => `<div class="card-head ${colorClass}"><span class="head-title">${titulo}</span><span class="head-desc">${desc}</span><span class="head-formula">ƒ = ${formula}</span></div>`;

        return `
        <div id="${cat}" class="tabcontent">
            <div class="control-panel">
                <button id="btn_top_${cat}" class="btn-preseleccion" onclick="switchView('${cat}', 'top')">⭐ VER LISTA DE PRE-SELECCIÓN ESTATAL</button>
                <div class="switch-container">
                    <button id="btn_trad_${cat}" class="btn-switch active-switch" onclick="switchView('${cat}', 'trad')">📊 Tradicional</button>
                    <button id="btn_adv_${cat}" class="btn-switch" onclick="switchView('${cat}', 'adv')">🧠 Avanzada</button>
                </div>
            </div>

            <div id="${cat}_tradicional" class="grid-tradicional">
                <div class="card b-pts">${eduHeader('Líderes en Puntos', 'Anotación Total (Auditada)', 'Suma Puntos', '')}<table>${topPts.map((j,i)=>row(j,i,j.pts,'PTS')).join('')}</table></div>
                <div class="card b-reb">${eduHeader('Líderes en Rebotes', 'Control Tableros (Auditado)', 'Total Rebotes', '')}<table>${topReb.map((j,i)=>row(j,i,j.reb_total,'REB')).join('')}</table></div>
                <div class="card b-ast">${eduHeader('Líderes en Asistencias', 'Creación de Juego', 'Suma Asist.', '')}<table>${topAst.map((j,i)=>row(j,i,j.asistencias,'AST')).join('')}</table></div>
                <div class="card b-rob">${eduHeader('Líderes en Robos', 'Defensa Activa', 'Suma Robos', '')}<table>${topRob.map((j,i)=>row(j,i,j.rob,'ROB')).join('')}</table></div>
            </div>

            <div id="${cat}_avanzada" class="grid-avanzada">
                <div class="card b-clutch">${eduHeader('❄️ Factor Sangre Fría', 'Rendimiento en Cierre (Q4)', '(Pts+Ast+Reb/2+Rob)-(Pérd*2)', 't-clutch')}<table>${topClutch.map((j,i)=>row(j,i,j.clutch_score.toFixed(1),'IDX')).join('')}</table></div>
                <div class="card b-dark">${eduHeader('🚀 Motor Ofensivo (G.O.P.)', 'Puntos producidos por posesión', '(Pts + Ast*2) / (Tiros+Ast+Pérd)', '')}<table>${topOff.map((j,i)=>row(j,i,j.gop.toFixed(2),'GOP')).join('')}</table></div>
                <div class="card b-dark">${eduHeader('🛡️ Impacto Defensivo', 'Posesiones Recuperadas', 'Reb.Total + Robos + Tapones', '')}<table>${topDef.map((j,i)=>row(j,i,j.stops,'STOPS')).join('')}</table></div>
            </div>

            <div id="${cat}_convocados" style="display:none;">
                <h3 style="text-align:center; color:#b71c1c;">Pre-selección (Top 30 Ranking)</h3>
                <table style="width:100%; border:1px solid #ddd;">
                    <thead style="background:#263238; color:white;"><tr><th style="padding:10px">JUGADOR</th><th style="text-align:center">ÍNDICE</th><th style="text-align:right">DETALLES</th></tr></thead>
                    <tbody>${ranking.map((j, index) => `
                        <tr style="background: ${index < 12 ? '#fffde7' : 'white'}; border-left: ${index < 12 ? '4px solid #ffd700' : 'none'}">
                            <td><div class="jugador-flex"><span class="rank-num">#${index+1}</span><img src="${getLogo(j.equipo)}" class="team-logo"><div><span class="jug-nombre">${j.nombre}</span><span class="jug-equipo">${j.equipo}</span></div></div></td>
                            <td style="text-align:center; font-weight:bold; color:#b71c1c; font-size:16px;">${j.rankingScore}</td>
                            <td style="text-align:right; font-size:11px;">PTS:${j.pts} | GOP:${j.gop.toFixed(2)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    };

    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>S.G.S - ABEA</title>${estilosCSS}</head><body><div class="header"><img src="${LOGO_ASOCIACION}" alt="ABEA"><div class="header-text"><h1>Asociación de Baloncesto de Aragua</h1><div>SISTEMA DE GESTIÓN DE SELECCIONES</div></div></div><div class="tab">${categorias.map(cat => `<button class="tablinks" onclick="openCategoria(event, '${cat}')">${cat}</button>`).join('')}</div>${categorias.length > 0 ? categorias.map(cat => renderCategoria(cat, db[cat])).join('') : '<div style="text-align:center; padding:50px;">Carga los archivos JSON.</div>'}${scriptJS}</body></html>`;
    fs.writeFileSync('index.html', html);
    console.log("✅ index.html generado con AUDITORÍA V18.0 (Filtro de eliminados).");
}

try { let db = procesarDatos(); db = calcularRanking(db); generarHTML(db); } catch (e) { console.error(e); }