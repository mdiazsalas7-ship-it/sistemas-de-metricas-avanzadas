const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN DEL SISTEMA ---
const CARPETA_RAIZ = './datos_torneo'; 
const LOGO_ASOCIACION = "https://i.postimg.cc/fyq3J3kg/download.jpg"; // Escudo Oficial
const LOGOS_EQUIPOS = { 
    "LOBOS": "https://cdn-icons-png.flaticon.com/512/451/451761.png",
    // Agrega más equipos si tienes sus logos
};

function getLogo(nombreEquipo) {
    if (!nombreEquipo) return "https://ui-avatars.com/api/?name=??&background=333&color=fff";
    const nombreMayus = nombreEquipo.toUpperCase();
    for (const [key, url] of Object.entries(LOGOS_EQUIPOS)) { if (nombreMayus.includes(key)) return url; }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreEquipo)}&background=random&length=2&bold=true&color=fff`;
}

// --- FASE 1: PROCESAMIENTO DE DATOS (LECTOR FIBA/NBN23) ---
function procesarDatos() {
    console.log("⚙️  Iniciando S.G.S. Aragua - Procesando Carpetas...");
    let db = {}; 

    // Verificación de seguridad
    if (!fs.existsSync(CARPETA_RAIZ)) {
        console.log(`⚠️ ALERTA: No existe la carpeta '${CARPETA_RAIZ}'. Créala y agrega las subcarpetas de categorías.`);
        return db;
    }

    // Leer carpetas de categorías (U12, U15, etc.)
    const carpetasCategorias = fs.readdirSync(CARPETA_RAIZ, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    if (carpetasCategorias.length === 0) { console.log("⚠️ La carpeta 'datos_torneo' está vacía."); return db; }

    carpetasCategorias.forEach(categoria => {
        const nombreCategoria = categoria.toUpperCase();
        console.log(`   > Escaneando Categoría: [${nombreCategoria}]...`);
        
        db[nombreCategoria] = { jugadores: {} };
        const rutaCategoria = path.join(CARPETA_RAIZ, categoria);
        const archivos = fs.readdirSync(rutaCategoria).filter(f => f.endsWith('.json'));

        archivos.forEach(archivo => {
            try {
                const rutaCompleta = path.join(rutaCategoria, archivo);
                const raw = fs.readFileSync(rutaCompleta, 'utf8');
                const data = JSON.parse(raw);
                
                if (!data.partido || !data.envivo) return; // Validación archivo corrupto

                const equipoLocal = (data.partido.local || "LOCAL").toUpperCase();
                const equipoVisitante = (data.partido.visitante || "VISITANTE").toUpperCase();
                
                // Obtener rosters
                const localRoster = data.EnVivoJugadoresOTT ? (data.EnVivoJugadoresOTT.JugadoresEnVivoLocal || []) : [];
                const visitRoster = data.EnVivoJugadoresOTT ? (data.EnVivoJugadoresOTT.JugadoresEnVivoVisitante || []) : [];
                const historial = data.envivo.historialacciones || [];
                
                const dbJugadores = db[nombreCategoria].jugadores;

                // 1. REGISTRAR JUGADORES (Con Blindaje de IDs String/Number)
                const registrar = (lista, equipo) => {
                    lista.forEach(j => {
                        const idStr = String(j.IdJugador); // Convertir siempre a texto
                        if (!dbJugadores[idStr]) {
                            dbJugadores[idStr] = { 
                                nombre: j.Nombre, equipo: equipo,
                                pts: 0, tiros_intentados: 0, 
                                asistencias: 0, perdidas: 0,
                                reb_def: 0, reb_of: 0, rob: 0, blk: 0, 
                                clutch_score: 0 
                            };
                        } else { 
                            dbJugadores[idStr].equipo = equipo; 
                        }
                    });
                };
                registrar(localRoster, equipoLocal);
                registrar(visitRoster, equipoVisitante);

                // 2. PROCESAR JUGADA A JUGADA
                historial.forEach(acc => {
                    const id = String(acc.componente_id); // Convertir ID a texto
                    const tipo = (acc.accion_tipo || "").toUpperCase(); 
                    const periodo = acc.numero_periodo;
                    
                    if (dbJugadores[id]) {
                        let puntos = 0; let intento = false;
                        let esRebote = false; let esAsistencia = false; let esRobo = false; let esPerdida = false; let esFallo = false;

                        // Detección de puntos
                        if (!tipo.includes("FALLADO") && !tipo.includes("FALTA") && !tipo.includes("REBOTE") && !tipo.includes("PERDIDA")) {
                            if (tipo.includes("3P") || tipo.includes("TRIPLE")) { puntos = 3; intento = true; }
                            else if (tipo.includes("2P") || tipo.includes("MATE") || tipo.includes("BANDEJA") || tipo === "CANASTA") { puntos = 2; intento = true; }
                            else if (tipo.includes("1P") || typeContains(tipo, ["LIBRE", "TL"])) { puntos = 1; intento = true; }
                        }
                        
                        // Detección de acciones
                        if (tipo.includes("FALLADO")) { intento = true; esFallo = true; }
                        if (tipo.includes("ASISTENCIA")) esAsistencia = true;
                        if (tipo.includes("PERDIDA")) esPerdida = true;
                        if (tipo.includes("REBOTE-DEFENSIVO")) dbJugadores[id].reb_def++;
                        if (tipo.includes("REBOTE-OFENSIVO")) dbJugadores[id].reb_of++;
                        if (typeContains(tipo, ["REBOTE"])) esRebote = true;
                        if (typeContains(tipo, ["RECUPERACION", "ROBO"])) { dbJugadores[id].rob++; esRobo = true; }
                        if (tipo.includes("TAPON") && !tipo.includes("RECIBIDO")) dbJugadores[id].blk++; 

                        // Acumuladores
                        if (puntos > 0) dbJugadores[id].pts += puntos;
                        if (intento) dbJugadores[id].tiros_intentados++;
                        if (esAsistencia) dbJugadores[id].asistencias++;
                        if (esPerdida) dbJugadores[id].perdidas++;

                        // ❄️ CÁLCULO SANGRE FRÍA (Clutch Time: Q4 + Prórrogas)
                        if (periodo >= 4) {
                            if (puntos > 0) dbJugadores[id].clutch_score += puntos;
                            if (esAsistencia) dbJugadores[id].clutch_score += 1;
                            if (esRebote) dbJugadores[id].clutch_score += 0.5;
                            if (esRobo) dbJugadores[id].clutch_score += 1;
                            if (esPerdida) dbJugadores[id].clutch_score -= 3; // Castigo severo
                            if (esFallo) dbJugadores[id].clutch_score -= 1;
                        }
                    }
                });
            } catch (e) { console.log(`   ❌ Error en archivo ${archivo}: ${e.message}`) }
        });
    });
    return db;
}

// Función auxiliar para buscar palabras clave
function typeContains(tipo, array) { return array.some(palabra => tipo.includes(palabra)); }

// --- FASE 2: ALGORITMO DE RANKING S.G.S. ---
function calcularRanking(db) {
    Object.keys(db).forEach(cat => {
        const jugadores = Object.values(db[cat].jugadores);
        jugadores.forEach(j => {
            // Métricas base
            j.pps = j.tiros_intentados > 0 ? (j.pts / j.tiros_intentados) : 0;
            j.stops = j.reb_def + j.rob + j.blk;
            j.reb_total = j.reb_def + j.reb_of;
            
            // Algoritmo Ponderado
            const scoreDefensa = (j.stops * 2) + j.rob; 
            const scoreOfensiva = (j.pps * 10) + (j.pts * 0.5); 
            const scorePivot = (j.reb_total * 1.5) + (j.blk * 2);
            const scoreEquipo = (j.asistencias * 2) - j.perdidas;
            
            // Score Final (0 a 100+)
            j.rankingScore = parseFloat(((scoreDefensa * 0.40) + (scoreOfensiva * 0.30) + (scorePivot * 0.20) + (scoreEquipo * 0.10) + (j.clutch_score * 0.1)).toFixed(1));
        });
    });
    return db;
}

// --- FASE 3: GENERADOR DE LA APP WEB (HTML) ---
function generarHTML(db) {
    const categorias = Object.keys(db).sort();
    
    // Javascript para la interactividad en el navegador
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
            // Abrir la primera pestaña por defecto
            window.onload = function() { if(document.getElementsByClassName("tablinks").length > 0) document.getElementsByClassName("tablinks")[0].click(); };
        </script>
    `;

    // Estilos CSS Profesionales
    const estilosCSS = `
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #eceff1; margin: 0; padding: 20px; color: #333; }
            .header { text-align: center; margin-bottom: 20px; padding: 20px; background: white; border-radius: 6px; border-bottom: 5px solid #b71c1c; display: flex; align-items: center; justify-content: center; gap: 20px; flex-wrap: wrap; }
            .header img { height: 80px; }
            .header-text h1 { color: #b71c1c; margin: 0; font-size: 24px; text-transform: uppercase; }
            .header-text div { font-weight: bold; color: #546e7a; font-size: 14px; }
            
            /* TABS */
            .tab { background-color: #263238; border-radius: 6px 6px 0 0; display: flex; justify-content: center; flex-wrap: wrap; }
            .tab button { background: inherit; border: none; cursor: pointer; padding: 14px 20px; color: #cfd8dc; font-weight: bold; font-size: 14px; transition: 0.3s; }
            .tab button:hover { background: #37474f; color: white; }
            .tab button.active { background: #b71c1c; color: white; }
            .tabcontent { display: none; padding: 20px; background: white; border-radius: 0 0 6px 6px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
            
            /* CONTROLES */
            .control-panel { margin-bottom: 25px; text-align: center; background: #f5f5f5; padding: 15px; border-radius: 8px; border: 1px solid #ddd; }
            .btn-preseleccion { display: block; width: 100%; padding: 15px; background: #263238; color: #ffd700; font-size: 16px; font-weight: bold; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1px; transition: 0.2s; }
            .btn-preseleccion:hover { transform: scale(1.01); }
            .active-pre { background: #ffd700; color: #000; box-shadow: 0 0 15px rgba(255, 215, 0, 0.4); }
            .switch-container { display: flex; gap: 10px; justify-content: center; }
            .btn-switch { flex: 1; padding: 12px; border: 2px solid #b0bec5; background: white; color: #546e7a; font-weight: bold; cursor: pointer; border-radius: 5px; text-transform: uppercase; font-size: 12px; }
            .btn-switch:hover { background: #eceff1; }
            .active-switch { background: #546e7a; color: white; border-color: #546e7a; }
            
            /* GRILLAS Y TARJETAS */
            .grid-tradicional, .grid-avanzada { display: none; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
            .card { background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); overflow: hidden; }
            
            /* CABECERAS EDUCATIVAS */
            .card-head { padding: 15px 10px; background: #fafafa; border-bottom: 1px solid #eee; text-align: center; }
            .head-title { font-weight: bold; color: #37474f; text-transform: uppercase; font-size: 14px; display: block; }
            .head-desc { font-size: 11px; color: #78909c; display: block; margin-top: 4px; }
            .head-formula { font-family: 'Courier New', monospace; font-size: 10px; background: #eceff1; padding: 3px 8px; border-radius: 4px; color: #555; display: inline-block; margin-top: 6px; border: 1px solid #cfd8dc; }

            /* TABLAS */
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            td { padding: 10px; border-bottom: 1px solid #f1f1f1; vertical-align: middle; }
            .stat-val { font-weight: bold; text-align: right; font-size: 15px; color: #333; }
            .rank-num { background: #eceff1; padding: 2px 7px; border-radius: 4px; font-size: 11px; margin-right: 8px; font-weight: bold; color: #555; }
            .jug-nombre { color: #000; font-weight: 600; }
            .jug-equipo { font-size: 10px; color: #888; text-transform: uppercase; }
            
            /* COLORES TEMÁTICOS */
            .b-pts { border-top: 4px solid #b71c1c; } .t-pts { color: #b71c1c; }
            .b-reb { border-top: 4px solid #f57f17; } .t-reb { color: #f57f17; }
            .b-ast { border-top: 4px solid #1565c0; } .t-ast { color: #1565c0; }
            .b-rob { border-top: 4px solid #2e7d32; } .t-rob { color: #2e7d32; }
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
        const topOff = [...jugadores].sort((a, b) => b.pps - a.pps).filter(j=>j.tiros_intentados>=3).slice(0, 5);
        const topPivot = [...jugadores].sort((a, b) => (b.reb_total+b.blk) - (a.reb_total+a.blk)).slice(0, 5);
        const topClutch = [...jugadores].sort((a, b) => b.clutch_score - a.clutch_score).slice(0, 5);

        const ranking = [...jugadores].sort((a, b) => b.rankingScore - a.rankingScore).slice(0, 30);
        
        // Helpers HTML
        const row = (j, i, val, label) => `<tr><td><span class="rank-num">#${i+1}</span> <span class="jug-nombre">${j.nombre.split(',')[0]}</span><br><span class="jug-equipo">${j.equipo}</span></td><td class="stat-val">${val} <small style="font-size:9px; color:#999">${label}</small></td></tr>`;
        const eduHeader = (titulo, desc, formula, colorClass) => `<div class="card-head ${colorClass}"><span class="head-title">${titulo}</span><span class="head-desc">${desc}</span><span class="head-formula">ƒ = ${formula}</span></div>`;

        return `
        <div id="${cat}" class="tabcontent">
            <div class="control-panel">
                <button id="btn_top_${cat}" class="btn-preseleccion" onclick="switchView('${cat}', 'top')">⭐ VER LISTA DE PRE-SELECCIÓN ESTATAL</button>
                <div class="switch-container">
                    <button id="btn_trad_${cat}" class="btn-switch active-switch" onclick="switchView('${cat}', 'trad')">📊 Tradicional (FIBA)</button>
                    <button id="btn_adv_${cat}" class="btn-switch" onclick="switchView('${cat}', 'adv')">🧠 Avanzada (S.G.S)</button>
                </div>
            </div>

            <div id="${cat}_tradicional" class="grid-tradicional">
                <div class="card b-pts">${eduHeader('Líderes en Puntos', 'Anotación total acumulada', 'Suma de Puntos', '')}<table>${topPts.map((j,i)=>row(j,i,j.pts,'PTS')).join('')}</table></div>
                <div class="card b-reb">${eduHeader('Líderes en Rebotes', 'Control de tableros', 'Reb. Defensivos + Ofensivos', '')}<table>${topReb.map((j,i)=>row(j,i,j.reb_total,'REB')).join('')}</table></div>
                <div class="card b-ast">${eduHeader('Líderes en Asistencias', 'Creación de juego', 'Pases de gol', '')}<table>${topAst.map((j,i)=>row(j,i,j.asistencias,'AST')).join('')}</table></div>
                <div class="card b-rob">${eduHeader('Líderes en Robos', 'Manos rápidas en defensa', 'Balones recuperados', '')}<table>${topRob.map((j,i)=>row(j,i,j.rob,'ROB')).join('')}</table></div>
            </div>

            <div id="${cat}_avanzada" class="grid-avanzada">
                <div class="card b-clutch">${eduHeader('❄️ Factor Sangre Fría', 'Rendimiento en el cierre (Q4 + OT)', '(Pts+Ast+Reb/2+Rob) - (Pérd*3 + Fallos)', 't-clutch')}<table>${topClutch.map((j,i)=>row(j,i,j.clutch_score.toFixed(1),'IDX')).join('')}</table></div>
                <div class="card b-dark">${eduHeader('🛡️ Impacto Defensivo', 'Posesiones recuperadas para el equipo', 'Reb.Def + Robos + Tapones', '')}<table>${topDef.map((j,i)=>row(j,i,j.stops,'STOPS')).join('')}</table></div>
                <div class="card b-dark">${eduHeader('🎯 Eficiencia Ofensiva', 'Rentabilidad por tiro (Min 3 intentos)', 'Puntos / Tiros Intentados', '')}<table>${topOff.map((j,i)=>row(j,i,j.pps.toFixed(2),'PPS')).join('')}</table></div>
                <div class="card b-reb">${eduHeader('🦍 Dominio Interior', 'Presencia física en la pintura', 'Rebotes Totales + Tapones', '')}<table>${topPivot.map((j,i)=>row(j,i,j.reb_total,'REB+BLK')).join('')}</table></div>
            </div>

            <div id="${cat}_convocados" style="display:none;">
                <h3 style="text-align:center; color:#b71c1c; text-transform:uppercase; margin-bottom:5px;">Pre-selección (Top 30 Ranking)</h3>
                <div style="text-align:center; font-size:11px; color:#777; margin-bottom:20px; font-style:italic;">Algoritmo S.G.S: (Def*0.4) + (Of*0.3) + (Int*0.2) + (Eq*0.1) + (Clutch*0.1)</div>
                <table style="width:100%; border:1px solid #ddd;">
                    <thead style="background:#263238; color:white;"><tr><th style="padding:10px;">RK</th><th style="text-align:left;">JUGADOR</th><th style="text-align:center">ÍNDICE</th><th style="text-align:right">DETALLES CLAVE</th></tr></thead>
                    <tbody>${ranking.map((j, index) => `
                        <tr style="background: ${index < 12 ? '#fffde7' : 'white'}; border-left: ${index < 12 ? '4px solid #ffd700' : 'none'}">
                            <td style="text-align:center; font-weight:bold;">${index+1}</td>
                            <td><b style="color:#000">${j.nombre}</b><br><small style="color:#666">${j.equipo}</small></td>
                            <td style="text-align:center; font-weight:bold; color:#b71c1c; font-size:16px;">${j.rankingScore}</td>
                            <td style="text-align:right; font-size:11px;">❄️Clutch: ${j.clutch_score.toFixed(1)} | 🛡️Stops: ${j.stops}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                <p style="text-align:center; margin-top:20px; color:#999; font-size:11px;">* Los primeros 12 puestos (fondo amarillo) sugieren el núcleo principal.</p>
            </div>
        </div>`;
    };

    let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0"> <title>S.G.S - Asociación de Baloncesto Aragua</title>
        ${estilosCSS}
    </head>
    <body>
        <div class="header">
            <img src="${LOGO_ASOCIACION}" alt="ABEA">
            <div class="header-text">
                <h1>Asociación de Baloncesto de Aragua</h1>
                <div>DIRECCIÓN TÉCNICA - SISTEMA DE GESTIÓN DE SELECCIONES</div>
            </div>
        </div>

        <div class="tab">
            ${categorias.map(cat => `<button class="tablinks" onclick="openCategoria(event, '${cat}')">${cat}</button>`).join('')}
        </div>

        ${categorias.length > 0 ? categorias.map(cat => renderCategoria(cat, db[cat])).join('') : '<div style="text-align:center; padding:50px; color:#777;"><h3>📂 Base de datos vacía</h3><p>Carga los archivos JSON en la carpeta <b>datos_torneo</b> para comenzar.</p></div>'}

        ${scriptJS}
    </body>
    </html>
    `;

    // IMPORTANTE: GUARDAR COMO index.html PARA VERCEL/GITHUB
    fs.writeFileSync('index.html', html);
    console.log("✅ SISTEMA COMPLETADO: Reporte generado en 'index.html'. Listo para subir a la nube.");
}

// EJECUCIÓN DEL SISTEMA
try { 
    let db = procesarDatos(); 
    db = calcularRanking(db); 
    generarHTML(db); 
} catch (e) { console.error("❌ ERROR CRÍTICO:", e); }