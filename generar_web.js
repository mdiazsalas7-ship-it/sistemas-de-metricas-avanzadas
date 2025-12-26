const fs = require('fs');
const path = require('path');

// --- CONFIGURACIÓN ---
const CARPETA_RAIZ = './datos_torneo'; 
const LOGO_ASOCIACION = "https://i.postimg.cc/fyq3J3kg/download.jpg"; 
const LOGOS_EQUIPOS = { "LOBOS": "https://cdn-icons-png.flaticon.com/512/451/451761.png" };

function getLogo(nombreEquipo) {
    if (!nombreEquipo) return "https://ui-avatars.com/api/?name=??&background=333&color=fff";
    const nombreMayus = nombreEquipo.toUpperCase();
    for (const [key, url] of Object.entries(LOGOS_EQUIPOS)) { if (nombreMayus.includes(key)) return url; }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreEquipo)}&background=random&length=2&bold=true&color=fff`;
}

// --- FASE 1: PROCESAMIENTO DE DATOS (MANTENEMOS LA LÓGICA V42 QUE FUNCIONA) ---
function procesarDatos() {
    console.log("⚙️  S.G.S. Aragua - Generando Sistema V44 (Head Coach Edition)...");
    let db = {}; 

    if (!fs.existsSync(CARPETA_RAIZ)) return db;

    const carpetasCategorias = fs.readdirSync(CARPETA_RAIZ, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    carpetasCategorias.forEach(categoria => {
        const nombreCategoria = categoria.toUpperCase();
        db[nombreCategoria] = { jugadores: {}, equipos: {} };
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

                [equipoLocal, equipoVisitante].forEach(eq => {
                    if (!db[nombreCategoria].equipos[eq]) {
                        db[nombreCategoria].equipos[eq] = {
                            nombre: eq, pts: 0, reb: 0, ast: 0, rob: 0, perdidas: 0, posesiones: 0
                        };
                    }
                });

                const registrarRoster = (lista, equipo) => {
                    if (!lista) return;
                    lista.forEach(j => {
                        const idNum = String(j.IdJugador);
                        const nombreLimpio = j.Nombre.trim().toUpperCase(); 
                        if (!dbJugadores[nombreLimpio]) {
                            dbJugadores[nombreLimpio] = { 
                                nombre: j.Nombre, equipo: equipo, pts: 0, tiros_intentados: 0, 
                                asistencias: 0, perdidas: 0, reb_def: 0, reb_of: 0, rob: 0, blk: 0, clutch_score: 0, faltas: 0
                            };
                        } else { dbJugadores[nombreLimpio].equipo = equipo; }
                    });
                };
                registrarRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoLocal, equipoLocal);
                registrarRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoVisitante, equipoVisitante);

                historial.forEach(acc => {
                    if (String(acc.eliminado).toUpperCase() === "TRUE") return; 
                    const idNum = String(acc.componente_id);
                    const nombreJugador = String(acc.nombre_jugador || "").trim().toUpperCase(); // Fallback
                    
                    // REINICIO DE LÓGICA DE LECTURA SEGURA
                    let playerStats = null;
                    for(const key in dbJugadores) {
                        // En producción usaríamos un mapa ID exacto, aquí asumimos carga por nombre/id previo
                    }
                });
                
                let mapaIds = {};
                const mapRoster = (lista, equipo) => {
                    if(!lista) return;
                    lista.forEach(j => { mapaIds[String(j.IdJugador)] = j.Nombre.trim().toUpperCase(); });
                };
                mapRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoLocal, equipoLocal);
                mapRoster(data.EnVivoJugadoresOTT?.JugadoresEnVivoVisitante, equipoVisitante);

                historial.forEach(acc => {
                    if (String(acc.eliminado).toUpperCase() === "TRUE") return;
                    const idNum = String(acc.componente_id);
                    const nombre = mapaIds[idNum];
                    
                    if (nombre && dbJugadores[nombre]) {
                        const p = dbJugadores[nombre];
                        const t = db[nombreCategoria].equipos[p.equipo];
                        const tipo = (acc.accion_tipo || "").toUpperCase();
                        const periodo = acc.numero_periodo || 1;
                        let pts = 0;

                        if (tipo.includes("CANASTA")) {
                            if (tipo.includes("3P")) pts = 3; else if (tipo.includes("2P")) pts = 2; else if (tipo.includes("1P")) pts = 1;
                        }
                        if (pts > 0) { p.pts += pts; if(t) t.pts += pts; }
                        
                        if (tipo.includes("CANASTA") || tipo.includes("FALLADO")) {
                            if (!tipo.includes("1P")) { p.tiros_intentados++; if(t) t.posesiones++; }
                        }
                        if (tipo.includes("ASISTENCIA")) { p.asistencias++; if(t) t.ast++; }
                        if (tipo.includes("PERDIDA")) { p.perdidas++; if(t) { t.perdidas++; t.posesiones++; } }
                        if (tipo.includes("REBOTE")) {
                            if (tipo.includes("DEF")) p.reb_def++; else p.reb_of++;
                            if(t) t.reb++;
                        }
                        if (tipo.includes("ROBO") || tipo.includes("RECUPERACION")) { p.rob++; if(t) { t.rob++; t.stops++; } }
                        if (tipo.includes("TAPON") && !tipo.includes("RECIBIDO")) { p.blk++; if(t) t.stops++; }
                        
                        // Clutch
                        if (periodo >= 4) {
                            p.clutch_score += pts;
                            if (tipo.includes("ASISTENCIA")) p.clutch_score += 1;
                            if (tipo.includes("REBOTE")) p.clutch_score += 0.5;
                            if (tipo.includes("ROBO")) p.clutch_score += 1.5; 
                            if (tipo.includes("PERDIDA")) p.clutch_score -= 2;
                        }
                    }
                });

            } catch (e) { console.error(`Error en ${archivo}:`, e.message); }
        });
    });
    return db;
}

// --- FASE 2: RANKING ---
function calcularRanking(db) {
    Object.keys(db).forEach(cat => {
        Object.values(db[cat].jugadores).forEach(j => {
            const reb_total = j.reb_def + j.reb_of;
            const posesiones = j.tiros_intentados + j.asistencias + j.perdidas;
            j.gop = posesiones > 0 ? ((j.pts + j.asistencias * 2) / posesiones) : 0;
            j.stops = reb_total + j.rob + j.blk;
            j.reb_total = reb_total;
            j.rankingScore = parseFloat(((j.gop * 20) + (j.pts * 0.4) + (j.stops * 1.5) + (j.clutch_score * 0.2)).toFixed(1));
        });
        Object.values(db[cat].equipos).forEach(e => {
            e.ortg = e.posesiones > 0 ? ((e.pts / e.posesiones) * 100).toFixed(1) : 0;
            e.ast_to_ratio = e.perdidas > 0 ? (e.ast / e.perdidas).toFixed(2) : e.ast;
        });
    });
    return db;
}

// --- FASE 3: GENERADOR HTML (PDF FIX + PROMPT PRO) ---
function generarHTML(db) {
    const categorias = Object.keys(db).sort();
    
    let rosterGlobal = {};
    let perfilSeleccion = {};

    categorias.forEach(cat => {
        const todosJugadores = Object.values(db[cat].jugadores).sort((a,b) => b.rankingScore - a.rankingScore);
        
        rosterGlobal[cat] = todosJugadores.map(j => ({
            nombre: j.nombre,
            equipo: j.equipo,
            full_stats: j 
        }));

        const top30 = todosJugadores.slice(0, 30);
        let sums = { pts:0, reb:0, ast:0, perd:0, rob:0, clutch:0 };
        top30.forEach(j => { 
            sums.pts+=j.pts; sums.reb+=j.reb_total; sums.ast+=j.asistencias; 
            sums.perd+=j.perdidas; sums.rob+=j.rob; sums.clutch+=j.clutch_score;
        });
        
        perfilSeleccion[cat] = {
            promedios: {
                Puntos_Promedio: (sums.pts/30).toFixed(1), 
                Rebotes_Promedio: (sums.reb/30).toFixed(1),
                Asistencias_Promedio: (sums.ast/30).toFixed(1), 
                Perdidas_Promedio: (sums.perd/30).toFixed(1),
                Robos_Promedio: (sums.rob/30).toFixed(1),
                Ratio_Cuidado_Balon: (sums.ast/(sums.perd||1)).toFixed(2)
            }
        };
    });

    const scriptJS = `
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
        <script>
            const ROSTER = ${JSON.stringify(rosterGlobal)};
            const PERFIL = ${JSON.stringify(perfilSeleccion)};
            let CATEGORIA_ACTIVA = ""; 
            
            function openCategoria(evt, catName) {
                var i, tabcontent, tablinks;
                tabcontent = document.getElementsByClassName("tabcontent");
                for (i = 0; i < tabcontent.length; i++) { tabcontent[i].style.display = "none"; }
                tablinks = document.getElementsByClassName("tablinks");
                for (i = 0; i < tablinks.length; i++) { tablinks[i].className = tablinks[i].className.replace(" active", ""); }
                document.getElementById(catName).style.display = "block";
                evt.currentTarget.className += " active";
                switchView(catName, 'trad');
                CATEGORIA_ACTIVA = catName;
                actualizarSelectorJugadores();
            }

            function switchView(catName, viewType) {
                document.getElementById(catName + '_tradicional').style.display = 'none';
                document.getElementById(catName + '_avanzada').style.display = 'none';
                document.getElementById(catName + '_convocados').style.display = 'none';
                document.getElementById('btn_trad_' + catName).className = 'btn-switch';
                document.getElementById('btn_adv_' + catName).className = 'btn-switch';
                document.getElementById('btn_top_' + catName).className = 'btn-preseleccion'; 
                if(viewType === 'trad') { document.getElementById(catName + '_tradicional').style.display = 'grid'; document.getElementById('btn_trad_' + catName).className += ' active-switch'; } 
                else if(viewType === 'adv') { document.getElementById(catName + '_avanzada').style.display = 'grid'; document.getElementById('btn_adv_' + catName).className += ' active-switch'; } 
                else if(viewType === 'top') { document.getElementById(catName + '_convocados').style.display = 'block'; document.getElementById('btn_top_' + catName).className += ' active-pre'; }
            }

            function actualizarSelectorJugadores() {
                const selector = document.getElementById('player-select');
                selector.innerHTML = '<option value="">-- Seleccionar Jugador --</option>';
                if (ROSTER[CATEGORIA_ACTIVA]) {
                    ROSTER[CATEGORIA_ACTIVA].forEach(j => {
                        const option = document.createElement('option');
                        option.value = j.nombre;
                        option.text = j.nombre + " (" + j.equipo + ")";
                        selector.appendChild(option);
                    });
                }
            }

            function checkApiKey() {
                const storedKey = localStorage.getItem("abea_ia_key");
                if (storedKey) {
                    document.getElementById('api-key-container').style.display = 'none';
                    document.getElementById('chat-interface').style.display = 'flex';
                }
            }
            function saveApiKey() {
                const key = document.getElementById('api-key-input').value;
                if (key.length > 10) { localStorage.setItem("abea_ia_key", key); checkApiKey(); } else { alert("Clave inválida"); }
            }
            function clearApiKey() { localStorage.removeItem("abea_ia_key"); location.reload(); }
            function toggleChat() {
                document.getElementById('side-panel').classList.toggle('open');
                checkApiKey();
            }

            // --- SISTEMA DE PDF PERFECTO (A4) ---
            function descargarPDF() {
                // Obtenemos el contenido LIMPIO
                const rawContent = document.getElementById('pdf-content').innerHTML;
                if (!rawContent.trim()) { alert("Primero genera un informe."); return; }

                // Creamos un contenedor temporal visible pero fuera de pantalla para que renderice bien
                const container = document.createElement('div');
                container.innerHTML = rawContent;
                container.style.width = '750px'; // Ancho fijo para A4
                container.style.padding = '20px';
                container.style.backgroundColor = 'white';
                container.style.position = 'absolute';
                container.style.top = '-9999px';
                container.style.left = '-9999px';
                document.body.appendChild(container);

                const opt = {
                    margin:       0.5,
                    filename:     'Reporte_Tecnico_ABEA.pdf',
                    image:        { type: 'jpeg', quality: 0.98 },
                    html2canvas:  { scale: 2, useCORS: true },
                    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
                };
                
                html2pdf().set(opt).from(container).save().then(() => {
                    document.body.removeChild(container);
                });
            }

            // --- FUNCIÓN LIMPIADORA DE RESPUESTA IA ---
            function limpiarRespuestaIA(texto) {
                // 1. Eliminar bloques de código markdown
                let limpio = texto.replace(/\\\`\\\`\\\`html/g, '').replace(/\\\`\\\`\\\`/g, '');
                // 2. Eliminar saludos o introducciones comunes antes del primer tag HTML
                const primerTag = limpio.indexOf('<');
                if (primerTag > 0) {
                    limpio = limpio.substring(primerTag);
                }
                // 3. Eliminar texto después del cierre del último tag (explicaciones finales)
                const ultimoTag = limpio.lastIndexOf('>');
                if (ultimoTag < limpio.length - 1) {
                    limpio = limpio.substring(0, ultimoTag + 1);
                }
                return limpio;
            }

            async function generarPretemporada() {
                const output = document.getElementById('chat-output');
                const apiKey = localStorage.getItem("abea_ia_key");
                if (!apiKey || !CATEGORIA_ACTIVA) { alert("Configura la API Key y Categoría."); return; }

                output.innerHTML = '<div class="msg bot loading">📅 Diseñando Plan Maestro de Selección (10 Semanas)...</div>';
                const stats = PERFIL[CATEGORIA_ACTIVA].promedios;
                
                // PROMPT EXPERTO FIBA
                let prompt = "ACTÚA COMO UN HEAD COACH DE SELECCIÓN NACIONAL (NIVEL FIBA). ESTÁS DISEÑANDO LA PREPARACIÓN PARA LA SELECCIÓN DE ARAGUA " + CATEGORIA_ACTIVA + ".\\n";
                prompt += "DATOS DEL GRUPO (PROMEDIOS): " + JSON.stringify(stats) + ".\\n";
                prompt += "CONDICIONES:\\n";
                prompt += "1. DURACIÓN: 10 Semanas.\\n";
                prompt += "2. FRECUENCIA: 3 Días/Semana (Lunes, Miércoles, Viernes) x 3 Horas.\\n";
                prompt += "3. FILOSOFÍA: DEFENSA TOTAL. Presión todo el campo y conversión rápida.\\n";
                prompt += "4. GESTIÓN DE CORTES: Debes indicar cuándo reducir la lista de 30 a 12.\\n";
                
                prompt += "ESTRUCTURA OBLIGATORIA DEL REPORTE (SOLO HTML):\\n";
                prompt += "1. DIAGNÓSTICO TÉCNICO (Breve análisis de los números).\\n";
                prompt += "2. CRONOGRAMA DE CORTES (Fechas sugeridas para los recortes).\\n";
                prompt += "3. PLAN MACRO-CICLO (Tabla con: Fase, Semanas, Foco Físico, Foco Táctico).\\n";
                prompt += "4. EJEMPLO DE SESIÓN DE ENTRENAMIENTO (Detalle minuto a minuto de las 3 horas).\\n";
                
                prompt += "IMPORTANTE: NO USES TEXTO DE RELLENO. SOLO EL REPORTE TÉCNICO EN HTML LIMPIO PARA IMPRIMIR.";

                llamarIA(apiKey, prompt, output, "PLAN DE SELECCIÓN ESTADAL - " + CATEGORIA_ACTIVA);
            }

            async function generarInformeIndividual() {
                const output = document.getElementById('chat-output');
                const apiKey = localStorage.getItem("abea_ia_key");
                const nombreJugador = document.getElementById('player-select').value;

                if (!apiKey || !nombreJugador) { alert("Selecciona un jugador."); return; }

                const jData = ROSTER[CATEGORIA_ACTIVA].find(j => j.nombre === nombreJugador).full_stats;
                output.innerHTML = '<div class="msg bot loading">👤 Realizando Scouting Profundo de ' + nombreJugador + '...</div>';
                
                let prompt = "ERES UN SCOUT PROFESIONAL. INFORME DE EVALUACIÓN PARA: " + nombreJugador + ".\\n";
                prompt += "ESTADÍSTICAS DEL TORNEO: " + JSON.stringify(jData) + ".\\n";
                
                prompt += "INSTRUCCIONES DE ANÁLISIS:\\n";
                prompt += "1. PERFIL: Define su arquetipo (ej: Anotador puro, Especialista defensivo, Organizador).\\n";
                prompt += "2. ANÁLISIS DE DATOS: Interpreta sus números. Si tiene muchas pérdidas, critícalo. Si tiene muchos rebotes ofensivos, alábalo.\\n";
                prompt += "3. ÁREAS DE DESARROLLO: 3 cosas específicas que debe mejorar para llegar a la Selección.\\n";
                prompt += "4. DRILLS RECOMENDADOS: 2 Ejercicios concretos para sus debilidades.\\n";
                
                prompt += "FORMATO: HTML LIMPIO. USA TABLAS PARA LOS DATOS Y LISTAS PARA EL TEXTO. SIN SALUDOS.";

                llamarIA(apiKey, prompt, output, "SCOUTING REPORT: " + nombreJugador);
            }

            async function llamarIA(apiKey, prompt, outputDiv, tituloReporte) {
                try {
                    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                        method: "POST",
                        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json", "HTTP-Referer": "http://localhost:3005" },
                        body: JSON.stringify({ 
                            "model": "google/gemini-2.0-flash-001",
                            "messages": [{"role": "system", "content": prompt}] 
                        })
                    });
                    const data = await response.json();
                    
                    // LIMPIEZA PROFUNDA DE LA RESPUESTA
                    const rawText = data.choices[0].message.content;
                    const htmlLimpio = limpiarRespuestaIA(rawText);
                    
                    // 1. Mostrar en pantalla (Preview)
                    outputDiv.innerHTML = htmlLimpio;
                    
                    // 2. Preparar el HTML Oculto para PDF (Con membrete oficial)
                    const fecha = new Date().toLocaleDateString();
                    const pdfTemplate = \`
                        <div style="font-family: 'Times New Roman', serif; color: black; padding: 20px;">
                            <table style="width: 100%; border-bottom: 2px solid #b71c1c; margin-bottom: 20px;">
                                <tr>
                                    <td style="width: 20%;"><img src="${LOGO_ASOCIACION}" style="height: 80px;"></td>
                                    <td style="width: 80%; text-align: right;">
                                        <h2 style="margin: 0; color: #b71c1c; font-size: 18px;">ASOCIACIÓN DE BALONCESTO DE ARAGUA</h2>
                                        <p style="margin: 5px 0; font-size: 12px; font-weight: bold;">DIRECCIÓN TÉCNICA DE SELECCIONES</p>
                                        <p style="margin: 0; font-size: 12px;">Fecha de Emisión: \${fecha}</p>
                                    </td>
                                </tr>
                            </table>
                            
                            <div style="text-align: center; background-color: #f0f0f0; padding: 8px; margin-bottom: 20px; border: 1px solid #ccc;">
                                <h1 style="margin: 0; font-size: 16px; text-transform: uppercase;">\${tituloReporte}</h1>
                            </div>

                            <div style="font-size: 12px; line-height: 1.5; text-align: justify;">
                                \${htmlLimpio}
                            </div>

                            <div style="margin-top: 40px; border-top: 1px solid #ccc; padding-top: 10px; text-align: center; font-size: 10px; color: #666;">
                                Reporte generado automáticamente por el Sistema de Gestión de Selecciones (SGS) - Aragua.
                            </div>
                        </div>
                    \`;
                    
                    document.getElementById('pdf-content').innerHTML = pdfTemplate;
                    document.getElementById('btn-download-pdf').style.display = 'block';

                } catch (e) {
                    outputDiv.innerHTML = '<div class="msg bot error">❌ Error de conexión o formato.</div>';
                }
            }

            window.onload = function() { 
                if(document.getElementsByClassName("tablinks").length > 0) document.getElementsByClassName("tablinks")[0].click(); 
            };
        </script>
    `;

    const estilosCSS = `
        <style>
            :root { --primary: #b71c1c; --dark: #263238; --light: #eceff1; }
            body { font-family: 'Segoe UI', sans-serif; background: var(--light); margin: 0; padding: 20px; color: #333; }
            
            .header { display: flex; justify-content: space-between; align-items: center; background: white; padding: 15px 30px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-left: 5px solid var(--primary); margin-bottom: 20px; }
            .header img { height: 65px; }
            .header h1 { margin: 0; font-size: 24px; color: var(--dark); }
            .btn-master { background: var(--dark); color: white; border: none; padding: 12px 30px; border-radius: 6px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
            
            .side-panel { position: fixed; top: 0; right: -650px; width: 600px; height: 100%; background: white; box-shadow: -10px 0 40px rgba(0,0,0,0.2); transition: 0.4s; z-index: 2000; display: flex; flex-direction: column; }
            .side-panel.open { right: 0; }
            .panel-header { background: var(--dark); color: white; padding: 20px; display: flex; justify-content: space-between; align-items: center; font-weight: bold; }
            .panel-body { flex: 1; padding: 20px; overflow-y: auto; background: #f4f6f8; }
            .panel-section { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .panel-section h3 { margin-top: 0; font-size: 14px; color: #546e7a; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            
            .action-btn { width: 100%; padding: 15px; margin-bottom: 10px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; text-align: left; display: flex; justify-content: space-between; font-size: 14px; }
            .btn-pretemporada { background: #e3f2fd; color: #1565c0; border: 1px solid #bbdefb; }
            .btn-individual { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
            .btn-pdf { background: #ffebee; color: #c62828; justify-content: center; display: none; margin-top: 20px; border: 1px solid #ffcdd2; }
            
            select { width: 100%; padding: 12px; border: 1px solid #ccc; border-radius: 5px; margin-bottom: 15px; }
            
            #chat-output { background: white; padding: 30px; border-radius: 8px; border: 1px solid #e0e0e0; min-height: 200px; font-size: 14px; color: #333; line-height: 1.6; }
            /* Estilos básicos para la vista previa */
            #chat-output table { width: 100%; border-collapse: collapse; margin: 15px 0; }
            #chat-output th, #chat-output td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            #chat-output th { background-color: #f5f5f5; }

            /* ÁREA OCULTA DE IMPRESIÓN (SOLO PARA PDF) */
            #pdf-content { display: none; } 

            /* BASE TABS/CARDS */
            .tab { background-color: var(--dark); border-radius: 8px 8px 0 0; display: flex; justify-content: center; padding: 5px; }
            .tab button { background: transparent; border: none; cursor: pointer; padding: 12px 25px; color: #cfd8dc; font-weight: 600; }
            .tab button.active { background: var(--primary); color: white; }
            .tabcontent { display: none; padding: 25px; background: white; border-radius: 0 0 8px 8px; }
            .control-panel { margin-bottom: 25px; text-align: center; background: #fcfcfc; padding: 20px; border-radius: 8px; border: 1px solid #eee; }
            .btn-preseleccion { width: 100%; padding: 15px; background: var(--dark); color: #ffd700; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
            .grid-tradicional, .grid-avanzada { display: none; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 25px; }
            .card { background: #fff; border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
            .card-head { padding: 15px; background: #fafafa; border-bottom: 1px solid #eee; text-align: center; }
            .head-title { font-weight: 800; color: #37474f; display: block; }
            .head-desc { font-size: 12px; color: #90a4ae; display: block; }
            .head-formula { font-family: monospace; font-size: 10px; background: #eceff1; padding: 3px 8px; border-radius: 4px; display: inline-block; margin-top: 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            td { padding: 12px 15px; border-bottom: 1px solid #f5f5f5; }
            .jugador-flex { display: flex; align-items: center; gap: 12px; }
            .team-logo { width: 36px; height: 36px; border-radius: 50%; object-fit: contain; border: 1px solid #eee; background: #fff; padding: 2px; }
            .jug-nombre { font-weight: 700; color: #263238; display: block; }
            .jug-equipo { font-size: 11px; color: #78909c; font-weight: 600; }
            .stat-val { font-weight: 800; text-align: right; font-size: 16px; color: #263238; }
            .rank-num { background: #eceff1; padding: 3px 8px; border-radius: 4px; font-size: 11px; margin-right: 5px; font-weight: 700; color: #546e7a; }
            .b-pts { border-top: 4px solid #b71c1c; } .b-reb { border-top: 4px solid #f57f17; } .b-ast { border-top: 4px solid #1565c0; } .b-rob { border-top: 4px solid #2e7d32; } .b-clutch { border-top: 4px solid #00bcd4; } .b-dark { border-top: 4px solid #37474f; }
            .btn-switch { padding: 10px 25px; border: 2px solid #cfd8dc; background: white; color: #78909c; font-weight: 700; cursor: pointer; border-radius: 6px; transition: 0.2s; }
            .active-switch { background: #546e7a; color: white; border-color: #546e7a; }
            .active-pre { background: #ffd700; color: #000; }
            .api-section { text-align: center; padding: 20px; border: 1px solid #ddd; margin-bottom: 20px; border-radius: 8px; }
            .api-section input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; }
            .btn-save { background: var(--primary); color: white; border: none; padding: 10px; width: 100%; cursor: pointer; }
            .close-btn { cursor:pointer; }
        </style>
    `;

    const renderCategoria = (cat, data) => {
        const jugadores = Object.values(data.jugadores).filter(x => x.nombre);
        if (jugadores.length === 0) return `<div id="${cat}" class="tabcontent" style="text-align:center; padding:40px;"><h3>⚠️ No encontré jugadores en ${cat}.</h3></div>`;

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

    let html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>S.G.S - ABEA</title>${estilosCSS}</head><body>
    <div class="header">
        <div class="header-left">
            <img src="${LOGO_ASOCIACION}" alt="ABEA">
            <div class="header-text"><h1>Gestión de Selecciones</h1><div style="font-size:12px; color:#777">ASOCIACIÓN DE BALONCESTO DE ARAGUA</div></div>
        </div>
        <button class="btn-master" onclick="toggleChat()">⚙️ COMANDO TÉCNICO</button>
    </div>
    <div class="tab">${categorias.map(cat => `<button class="tablinks" onclick="openCategoria(event, '${cat}')">${cat}</button>`).join('')}</div>
    ${categorias.length > 0 ? categorias.map(cat => renderCategoria(cat, db[cat])).join('') : '<div style="text-align:center; padding:50px;">Carga los archivos JSON.</div>'}
    
    <div id="side-panel" class="side-panel">
        <div class="panel-header"><span>🏢 DIRECTOR DEPORTIVO</span><span class="close-btn" onclick="toggleChat()">✖</span></div>
        <div class="panel-body">
            
            <div id="api-key-container" class="panel-section">
                <h3>🔐 ACCESO</h3>
                <input type="password" id="api-key-input" placeholder="Ingresa tu API Key">
                <button class="btn-save" onclick="saveApiKey()">Conectar</button>
            </div>

            <div id="chat-interface" style="display:none; flex-direction:column; height:100%;">
                
                <div class="panel-section">
                    <h3>📅 GESTIÓN DE EQUIPO</h3>
                    <button class="action-btn btn-pretemporada" onclick="generarPretemporada()">
                        <span>Generar Plan de Pretemporada</span> <span>➤</span>
                    </button>
                </div>

                <div class="panel-section">
                    <h3>👤 SCOUTING INDIVIDUAL</h3>
                    <select id="player-select"><option>Cargando jugadores...</option></select>
                    <button class="action-btn btn-individual" onclick="generarInformeIndividual()">
                        <span>Generar Informe Técnico</span> <span>➤</span>
                    </button>
                </div>

                <div class="panel-section" style="flex:1; display:flex; flex-direction:column;">
                    <h3>📄 RESULTADOS</h3>
                    <div id="chat-output">Aquí aparecerá el plan o informe...</div>
                    <button id="btn-download-pdf" class="action-btn btn-pdf" onclick="descargarPDF()">📥 DESCARGAR PDF</button>
                </div>

            </div>
        </div>
    </div>

    <div id="pdf-content"></div>
    
    ${scriptJS}</body></html>`;
    fs.writeFileSync('index.html', html);
    console.log("✅ index.html generado con V44.0 (PDF PROFESIONAL A4 + FILTRO DE IA + PLAN EXPERTO).");
}

try { let db = procesarDatos(); db = calcularRanking(db); generarHTML(db); } catch (e) { console.error(e); }