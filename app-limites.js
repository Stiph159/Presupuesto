// ====================
// CONFIGURACIÓN INICIAL - LÍMITES CON FIREBASE
// ====================

// Variables globales PARA LÍMITES
let registrosLimites = [];
let configLimites = {
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let limiteSeleccionado = null;
let chartLimitesInstance = null;
let unsubscribeLimites = null;
let unsubscribeConfigLimites = null;

// ====================
// FUNCIONES FIREBASE PARA LÍMITES
// ====================

async function initFirebaseLimites() {
    try {
        console.log("🚫 Inicializando Firebase para límites...");
        
        // Cargar configuración
        await loadConfigLimitesFromFirebase();
        
        // Cargar límites y escuchar cambios
        setupRealtimeListenersLimites();
        
        mostrarNotificacion("✅ Límites conectados a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error inicializando Firebase para límites:", error);
        mostrarNotificacion("⚠️ Usando datos locales para límites", "warning");
        return false;
    }
}

async function loadConfigLimitesFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            const configData = configDoc.data();
            if (configData.nombres) {
                configLimites.nombres = configData.nombres;
            }
            console.log("✅ Configuración de límites cargada desde Firebase:", configLimites);
        }
    } catch (error) {
        console.error("❌ Error cargando configuración de límites:", error);
        // Cargar desde localStorage como fallback
        const savedConfig = localStorage.getItem('gastos_config');
        if (savedConfig) {
            configLimites = JSON.parse(savedConfig);
        }
    }
}

function setupRealtimeListenersLimites() {
    // Detener escuchas anteriores si existen
    if (unsubscribeLimites) unsubscribeLimites();
    if (unsubscribeConfigLimites) unsubscribeConfigLimites();
    
    const db = firebase.firestore();
    
    // Escuchar cambios en límites
    unsubscribeLimites = db.collection('limites')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            const cambios = snapshot.docChanges();
            let huboCambios = false;
            
            cambios.forEach((cambio) => {
                const limiteData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                // Convertir timestamps de Firebase a Date
                if (limiteData.timestamp && limiteData.timestamp.toDate) {
                    limiteData.timestamp = limiteData.timestamp.toDate();
                }
                
                const index = registrosLimites.findIndex(r => r.id === limiteData.id);
                
                if (cambio.type === 'added' && index === -1) {
                    registrosLimites.unshift(limiteData);
                    huboCambios = true;
                } else if (cambio.type === 'modified' && index !== -1) {
                    registrosLimites[index] = limiteData;
                    huboCambios = true;
                } else if (cambio.type === 'removed' && index !== -1) {
                    registrosLimites.splice(index, 1);
                    huboCambios = true;
                }
            });
            
            if (huboCambios) {
                // Ordenar por fecha
                registrosLimites.sort((a, b) => {
                    const dateA = a.timestamp || new Date(a.fecha);
                    const dateB = b.timestamp || new Date(b.fecha);
                    return dateB - dateA;
                });
                
                // Actualizar UI
                actualizarUILimites();
                
                // Guardar backup local
                saveLimitesToLocalStorage();
                
                console.log("🔄 Límites actualizados desde la nube");
            }
        }, (error) => {
            console.error("❌ Error en listener de límites:", error);
        });
    
    // Escuchar cambios en configuración
    unsubscribeConfigLimites = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const configData = doc.data();
                if (configData.nombres) {
                    configLimites.nombres = configData.nombres;
                    actualizarNombresEnUILimites();
                }
                actualizarUILimites();
                saveLimitesToLocalStorage();
                console.log("🔄 Configuración de límites actualizada desde la nube");
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración de límites:", error);
        });
}

async function saveLimiteToFirebase(limite) {
    try {
        const db = firebase.firestore();
        const limiteData = {
            ...limite,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Eliminar id local si existe
        if (limiteData.id && limiteData.id.toString().startsWith('local_')) {
            delete limiteData.id;
        }
        
        const docRef = await db.collection('limites').add(limiteData);
        console.log("✅ Límite guardado en Firebase con ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando límite en Firebase:", error);
        throw error;
    }
}

async function deleteLimiteFromFirebase(id) {
    try {
        await firebase.firestore().collection('limites').doc(id).delete();
        console.log("✅ Límite eliminado de Firebase:", id);
    } catch (error) {
        console.error("❌ Error eliminando límite de Firebase:", error);
        throw error;
    }
}

async function saveConfigLimitesToFirebase() {
    try {
        const db = firebase.firestore();
        const configDocRef = db.collection('config').doc('nuestra_pareja');
        
        // Primero obtener el documento actual
        const configDoc = await configDocRef.get();
        let configData = {};
        
        if (configDoc.exists) {
            configData = configDoc.data();
        }
        
        // Actualizar solo los nombres (se sincronizan con las otras páginas)
        configData.nombres = configLimites.nombres;
        
        await configDocRef.set(configData, { merge: true });
        console.log("✅ Configuración de límites guardada en Firebase");
    } catch (error) {
        console.error("❌ Error guardando configuración de límites:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE (BACKUP)
// ====================

function saveLimitesToLocalStorage() {
    try {
        localStorage.setItem('limites_registros', JSON.stringify(registrosLimites));
        localStorage.setItem('gastos_config', JSON.stringify(configLimites));
    } catch (error) {
        console.error("Error guardando límites en localStorage:", error);
    }
}

function loadLimitesFromLocalStorage() {
    try {
        const savedLimites = localStorage.getItem('limites_registros');
        const savedConfig = localStorage.getItem('gastos_config');
        
        if (savedLimites) {
            registrosLimites = JSON.parse(savedLimites);
        }
        
        if (savedConfig) {
            configLimites = JSON.parse(savedConfig);
        }
    } catch (error) {
        console.error("Error cargando límites de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("🚫 Iniciando app de límites...");
    
    // Primero cargar desde localStorage (más rápido)
    loadLimitesFromLocalStorage();
    
    // Inicializar app básica
    inicializarAppLimites();
    actualizarUILimites();
    
    // Luego conectar con Firebase
    setTimeout(async () => {
        await initFirebaseLimites();
    }, 1000);
});

function inicializarAppLimites() {
    console.log("⚙️ Inicializando límites...");
    
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventosLimites();
    
    // Configurar nombres
    actualizarNombresEnUILimites();
    
    // Configurar fecha por defecto
    document.getElementById('fecha-limite').value = new Date().toISOString().split('T')[0];
    
    // Inicializar gráfico
    inicializarGraficoLimites();
    
    console.log("✅ Límites inicializado");
}

function actualizarNombresEnUILimites() {
    if (configLimites.nombres) {
        document.getElementById('name-persona1-result').textContent = configLimites.nombres.persona1;
        document.getElementById('name-persona2-result').textContent = configLimites.nombres.persona2;
    }
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosLimites() {
    console.log("🔗 Configurando eventos de límites...");
    
    // Toggle tema
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTema);
    }
    
    // Botón volver
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', function() {
            window.location.href = 'index.html';
        });
    }
    
    // Selección de límites
    const opcionesCards = document.querySelectorAll('.opcion-card');
    console.log("📌 Opciones encontradas:", opcionesCards.length);
    
    opcionesCards.forEach(card => {
        card.addEventListener('click', function() {
            console.log("🎯 Opción clickeada - Límite:", this.dataset.limit);
            
            // Deseleccionar todas
            opcionesCards.forEach(c => {
                c.classList.remove('selected');
            });
            
            // Seleccionar esta
            this.classList.add('selected');
            limiteSeleccionado = parseFloat(this.dataset.limit);
            console.log("✅ Límite seleccionado:", limiteSeleccionado);
            
            // Mostrar información de límite seleccionado
            mostrarInfoLimiteSeleccionado();
            
            habilitarBotonCalcular();
        });
    });
    
    // Botón calcular
    const calcularBtn = document.getElementById('calcular-btn');
    if (calcularBtn) {
        calcularBtn.addEventListener('click', calcularLimite);
    }
    
    // Enter en gasto real también calcula
    const gastoRealInput = document.getElementById('gasto-real');
    if (gastoRealInput) {
        gastoRealInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const btn = document.getElementById('calcular-btn');
                if (btn && !btn.disabled) {
                    calcularLimite();
                }
            }
        });
    }
    
    // Habilitar botón cuando se ingresa gasto
    if (gastoRealInput) {
        gastoRealInput.addEventListener('input', habilitarBotonCalcular);
    }
    
    // Botón guardar
    const guardarBtn = document.getElementById('guardar-btn');
    if (guardarBtn) {
        guardarBtn.addEventListener('click', guardarRegistroLimite);
    }
    
    // Botón limpiar todo
    const clearAllBtn = document.getElementById('clear-all');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            if (confirm('¿Estás seguro de eliminar todos los registros?')) {
                registrosLimites = [];
                localStorage.setItem('limites_registros', JSON.stringify(registrosLimites));
                // También eliminar de Firebase
                eliminarTodosLimitesDeFirebase();
                cargarRegistrosLimites();
                actualizarUILimites();
                mostrarNotificacion('Todos los registros eliminados', 'success');
            }
        });
    }
    
    // Botones de gráficos
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGraficoLimites(this.dataset.chart);
        });
    });
    
    // Botón editar nombres
    const editNamesBtn = document.getElementById('edit-names');
    if (editNamesBtn) {
        editNamesBtn.addEventListener('click', function() {
            document.getElementById('nombre-persona1').value = configLimites.nombres.persona1;
            document.getElementById('nombre-persona2').value = configLimites.nombres.persona2;
            mostrarModal('names-modal');
        });
    }
    
    const saveNamesBtn = document.getElementById('save-names');
    if (saveNamesBtn) {
        saveNamesBtn.addEventListener('click', guardarNombres);
    }
    
    const cancelNamesBtn = document.getElementById('cancel-names');
    if (cancelNamesBtn) {
        cancelNamesBtn.addEventListener('click', function() {
            ocultarModal('names-modal');
        });
    }
    
    console.log("✅ Eventos de límites configurados");
}

// ====================
// FUNCIONES PRINCIPALES (CON FIREBASE)
// ====================

async function eliminarTodosLimitesDeFirebase() {
    try {
        const db = firebase.firestore();
        const limitesSnapshot = await db.collection('limites')
            .where('sharedId', '==', 'nuestra_pareja')
            .get();
        
        const batch = db.batch();
        limitesSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
        console.log("✅ Todos los límites eliminados de Firebase");
    } catch (error) {
        console.error("❌ Error eliminando límites de Firebase:", error);
    }
}

async function guardarRegistroLimite() {
    if (!window.calculoTemporalLimite) {
        mostrarNotificacion('Primero debes calcular un resultado', 'error');
        return;
    }
    
    const calculo = window.calculoTemporalLimite;
    
    // Crear objeto de registro
    const nuevoRegistro = {
        id: 'local_' + Date.now(), // ID temporal
        fecha: calculo.fecha,
        gastoReal: calculo.gastoReal,
        limite: calculo.limite,
        exceso: calculo.exceso,
        ahorroTotal: calculo.ahorroTotal,
        ahorroPorPersona: calculo.ahorroPorPersona,
        dentroDeLimite: calculo.dentroDeLimite,
        descripcion: calculo.descripcion,
        timestamp: new Date()
    };
    
    // Agregar al array local
    //registrosLimites.push(nuevoRegistro);
    
    // Actualizar UI
    //actualizarUILimites();
    //cargarRegistrosLimites();
    
    // Limpiar formulario
    document.getElementById('gasto-real').value = '';
    document.getElementById('descripcion-limite').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    document.getElementById('result-section').style.display = 'none';
    limiteSeleccionado = null;
    window.calculoTemporalLimite = null;
    habilitarBotonCalcular();
    
    // Mostrar confirmación
    const mensaje = calculo.dentroDeLimite 
        ? '⏳ Guardando... ¡Excelente! Cumpliste el límite del día'
        : `⏳ Guardando... Ahorro forzado: $${calculo.ahorroTotal.toFixed(2)}`;
    
    mostrarNotificacion(mensaje, 'info');
    
    // Guardar en Firebase (en segundo plano)
    setTimeout(async () => {
        try {
            const firebaseId = await saveLimiteToFirebase(nuevoRegistro);
            // Actualizar el ID local con el de Firebase
            nuevoRegistro.id = firebaseId;
            mostrarNotificacion('✅ Registro guardado en la nube', 'success');
        } catch (error) {
            console.error("Error guardando en Firebase, usando solo local:", error);
            mostrarNotificacion('✅ Registro guardado localmente', 'warning');
        }
        saveLimitesToLocalStorage();
    }, 500);
}

async function eliminarRegistroLimite(id) {
    if (!confirm('¿Estás seguro de eliminar este registro?')) return;
    
    // Mostrar notificación inmediatamente
    mostrarNotificacion('⏳ Eliminando registro...', 'info');
    
    // Intentar eliminar de Firebase
    try {
        if (id && !id.toString().startsWith('local_')) {
            await deleteLimiteFromFirebase(id);
            // La notificación de éxito vendrá del listener de Firebase
        } else {
            // Si es un ID local, eliminar del array local
            const index = registrosLimites.findIndex(r => r.id === id);
            if (index !== -1) {
                registrosLimites.splice(index, 1);
                actualizarUILimites();
                saveLimitesToLocalStorage();
                mostrarNotificacion('Registro eliminado (local)', 'success');
            }
        }
    } catch (error) {
        console.error("Error eliminando registro:", error);
        mostrarNotificacion('Error al eliminar el registro', 'error');
    }
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configLimites.nombres.persona1 = nombre1;
    configLimites.nombres.persona2 = nombre2;
    
    // Actualizar UI
    actualizarNombresEnUILimites();
    actualizarUILimites();
    ocultarModal('names-modal');
    
    // Guardar en Firebase
    try {
        await saveConfigLimitesToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres en Firebase:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    // Guardar localmente
    saveLimitesToLocalStorage();
}

// ====================
// CÁLCULOS (SIN CAMBIOS)
// ====================

function calcularLimite() {
    console.log("🧮 Calculando límite...");
    
    const gastoReal = parseFloat(document.getElementById('gasto-real').value);
    const descripcion = document.getElementById('descripcion-limite').value.trim();
    
    if (!gastoReal || gastoReal <= 0) {
        mostrarNotificacion('Por favor ingresa un gasto válido', 'error');
        return;
    }
    
    if (limiteSeleccionado === null) {
        mostrarNotificacion('Por favor selecciona un límite', 'error');
        return;
    }
    
    // Calcular según el límite seleccionado
    let exceso = 0;
    let ahorroTotal = 0;
    let ahorroPorPersona = 0;
    let dentroDeLimite = false;
    let montoLimite = limiteSeleccionado === 0 ? 0 : limiteSeleccionado;
    
    if (limiteSeleccionado === 0) {
        // Caso sin límite: todo el gasto se divide entre 2
        exceso = gastoReal;
        ahorroTotal = gastoReal;
        ahorroPorPersona = gastoReal / 2;
    } else {
        // Caso con límite
        exceso = Math.max(gastoReal - montoLimite, 0);
        
        if (exceso > 0) {
            // Hay exceso: se divide el exceso entre 2
            ahorroTotal = exceso;
            ahorroPorPersona = exceso / 2;
        } else {
            // Dentro del límite
            dentroDeLimite = true;
            ahorroTotal = 0;
            ahorroPorPersona = 0;
        }
    }
    
    console.log("📊 Resultados cálculo:", {
        gastoReal,
        limite: montoLimite,
        exceso,
        ahorroTotal,
        ahorroPorPersona,
        dentroDeLimite
    });
    
    // Mostrar resultados
    document.getElementById('result-gasto-real').textContent = `$${gastoReal.toFixed(2)}`;
    document.getElementById('result-limite').textContent = montoLimite === 0 ? 'Sin límite' : `$${montoLimite.toFixed(2)}`;
    document.getElementById('result-exceso').textContent = `$${exceso.toFixed(2)}`;
    document.getElementById('result-ahorro-total').textContent = `$${ahorroTotal.toFixed(2)}`;
    document.getElementById('ahorro-persona1').textContent = `$${ahorroPorPersona.toFixed(2)}`;
    document.getElementById('ahorro-persona2').textContent = `$${ahorroPorPersona.toFixed(2)}`;
    
    // Mostrar sección de resultados
    document.getElementById('result-section').style.display = 'block';
    
    // Guardar cálculo temporal
    window.calculoTemporalLimite = {
        fecha: document.getElementById('fecha-limite').value,
        gastoReal: gastoReal,
        limite: montoLimite,
        exceso: exceso,
        ahorroTotal: ahorroTotal,
        ahorroPorPersona: ahorroPorPersona,
        dentroDeLimite: dentroDeLimite,
        descripcion: descripcion || `Gasto del día`
    };
    
    console.log("✅ Cálculo completado");
}

// ====================
// INTERFAZ DE USUARIO (SIN CAMBIOS)
// ====================

function actualizarUILimites() {
    actualizarResumenLimites();
    cargarRegistrosLimites();
    actualizarGraficoLimites('excesos');
}

function actualizarResumenLimites() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // Filtrar registros
    const registrosHoy = registrosLimites.filter(r => r.fecha === hoy);
    const registrosSemana = registrosLimites.filter(r => new Date(r.fecha) >= inicioSemana);
    const registrosMes = registrosLimites.filter(r => new Date(r.fecha) >= inicioMes);
    
    // Calcular totales
    const totalHoy = registrosHoy.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalSemana = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalMes = registrosMes.reduce((sum, r) => sum + r.ahorroTotal, 0);
    
    // Calcular totales generales
    const totalAhorro = registrosLimites.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalExcesos = registrosLimites.filter(r => r.exceso > 0).length;
    
    // Actualizar resumen
    const hoyElement = document.getElementById('summary-hoy-limite');
    const semanaElement = document.getElementById('summary-semana-limite');
    const mesElement = document.getElementById('summary-mes-limite');
    const totalAhorroElement = document.getElementById('total-ahorro-forzado');
    const totalExcesosElement = document.getElementById('total-dias-exceso');
    
    if (hoyElement) hoyElement.textContent = `$${totalHoy.toFixed(2)}`;
    if (semanaElement) semanaElement.textContent = `$${totalSemana.toFixed(2)}`;
    if (mesElement) mesElement.textContent = `$${totalMes.toFixed(2)}`;
    if (totalAhorroElement) totalAhorroElement.textContent = `$${totalAhorro.toFixed(2)}`;
    if (totalExcesosElement) totalExcesosElement.textContent = totalExcesos;
}

function cargarRegistrosLimites() {
    const container = document.getElementById('registros-container');
    const emptyState = document.getElementById('empty-state-limites');
    const totales = document.getElementById('totales-limites');
    
    if (!container || !emptyState || !totales) {
        console.error("❌ Elementos del DOM no encontrados");
        return;
    }
    
    if (registrosLimites.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    // Ordenar por fecha (más reciente primero)
    const registrosOrdenados = [...registrosLimites].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    let html = '';
    
    registrosOrdenados.forEach(registro => {
        const fechaFormateada = new Date(registro.fecha).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        const clase = registro.dentroDeLimite ? 'cumplido' : 'exceso';
        const statusText = registro.dentroDeLimite ? 'Dentro de límite' : 'Con exceso';
        const limiteText = registro.limite === 0 ? 'Sin límite' : `Límite: $${registro.limite}`;
        
        html += `
            <div class="registro-item ${clase}">
                <div class="registro-header">
                    <div class="registro-status ${clase}">${statusText}</div>
                    <div class="registro-monto">$${registro.gastoReal.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarRegistroLimite('${registro.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${registro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span>${limiteText}</span>
                        ${!registro.dentroDeLimite ? 
                            `<span>Ahorro: $${registro.ahorroTotal.toFixed(2)}</span>` : 
                            ''
                        }
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ====================
// GRÁFICOS (SIN CAMBIOS)
// ====================

function inicializarGraficoLimites() {
    const ctx = document.getElementById('limites-chart');
    if (!ctx) {
        console.error("❌ No se encontró el canvas limites-chart");
        return;
    }
    
    chartLimitesInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
            datasets: [{
                label: 'Ahorro Forzado ($)',
                data: [0, 0, 0, 0, 0, 0, 0],
                backgroundColor: '#667eea',
                borderColor: '#764ba2',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'var(--text-color)'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'var(--text-secondary)',
                        callback: function(value) {
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: 'var(--border-color)'
                    }
                },
                x: {
                    ticks: {
                        color: 'var(--text-secondary)'
                    },
                    grid: {
                        color: 'var(--border-color)'
                    }
                }
            }
        }
    });
    
    console.log("📊 Gráfico de límites inicializado");
}

function actualizarGraficoLimites(tipo) {
    if (!chartLimitesInstance) {
        console.error("❌ chartLimitesInstance no está inicializado");
        return;
    }
    
    let labels = [];
    let datos = [];
    
    const hoy = new Date();
    
    if (tipo === 'excesos' || !tipo) {
        // Últimos 7 días
        const ultimos7Dias = Array.from({length: 7}, (_, i) => {
            const fecha = new Date();
            fecha.setDate(fecha.getDate() - i);
            return fecha.toISOString().split('T')[0];
        }).reverse();
        
        labels = ultimos7Dias.map(fecha => {
            const d = new Date(fecha);
            return d.toLocaleDateString('es-ES', { weekday: 'short' });
        });
        
        ultimos7Dias.forEach(fecha => {
            const registrosDia = registrosLimites.filter(r => r.fecha === fecha);
            const totalAhorro = registrosDia.reduce((sum, r) => sum + r.ahorroTotal, 0);
            datos.push(totalAhorro);
        });
        
        chartLimitesInstance.data.datasets[0].label = 'Ahorro Forzado ($)';
        chartLimitesInstance.data.datasets[0].backgroundColor = '#f56565';
    } else if (tipo === 'ahorros') {
        // Ahorro por semana (últimas 4 semanas)
        const ultimas4Semanas = Array.from({length: 4}, (_, i) => {
            const fecha = new Date();
            fecha.setDate(fecha.getDate() - (i * 7));
            const inicioSemanaFecha = obtenerInicioSemanaFecha(fecha);
            return inicioSemanaFecha;
        }).reverse();
        
        labels = ultimas4Semanas.map(fecha => {
            const d = new Date(fecha);
            return `Sem ${d.getDate()}/${d.getMonth() + 1}`;
        });
        
        ultimas4Semanas.forEach(inicioSemanaFecha => {
            const finSemana = new Date(inicioSemanaFecha);
            finSemana.setDate(finSemana.getDate() + 6);
            
            const registrosSemana = registrosLimites.filter(r => {
                const fechaReg = new Date(r.fecha);
                return fechaReg >= inicioSemanaFecha && fechaReg <= finSemana;
            });
            
            const totalAhorro = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
            datos.push(totalAhorro);
        });
        
        chartLimitesInstance.data.datasets[0].label = 'Ahorro Semanal ($)';
        chartLimitesInstance.data.datasets[0].backgroundColor = '#38a169';
    }
    
    chartLimitesInstance.data.labels = labels;
    chartLimitesInstance.data.datasets[0].data = datos;
    chartLimitesInstance.update();
    
    console.log("📈 Gráfico actualizado:", tipo);
}

function obtenerInicioSemanaFecha(fecha) {
    const fechaObj = new Date(fecha);
    const dia = fechaObj.getDay();
    const diff = fechaObj.getDate() - dia + (dia === 0 ? -6 : 1);
    return new Date(fechaObj.setDate(diff));
}

// ====================
// FUNCIONES AUXILIARES
// ====================

function mostrarInfoLimiteSeleccionado() {
    const opcionInfo = document.getElementById('opcion-seleccionada-info');
    const texto = document.getElementById('opcion-seleccionada-texto');
    const tipo = document.getElementById('opcion-seleccionada-tipo');
    
    if (!opcionInfo || !texto || !tipo) return;
    
    let nombreLimite = '';
    let tipoLimite = '';
    
    switch(limiteSeleccionado) {
        case 30:
            nombreLimite = '$30.00';
            tipoLimite = 'Estricto';
            break;
        case 20:
            nombreLimite = '$20.00';
            tipoLimite = 'Moderado';
            break;
        case 10:
            nombreLimite = '$10.00';
            tipoLimite = 'Suave';
            break;
        case 0:
            nombreLimite = 'Sin límite';
            tipoLimite = 'Todo se divide en 2';
            break;
        default:
            nombreLimite = 'No seleccionado';
            tipoLimite = '';
    }
    
    texto.textContent = nombreLimite;
    tipo.textContent = tipoLimite;
    opcionInfo.style.display = 'block';
}

function habilitarBotonCalcular() {
    const gasto = document.getElementById('gasto-real').value;
    const boton = document.getElementById('calcular-btn');
    
    if (!boton) {
        console.error("❌ No se encontró el botón calcular");
        return;
    }
    
    const estaHabilitado = !!(limiteSeleccionado !== null && gasto && parseFloat(gasto) > 0);
    
    console.log("🔘 Estado botón calcular:", {
        limite: limiteSeleccionado,
        gasto: gasto,
        habilitado: estaHabilitado
    });
    
    boton.disabled = !estaHabilitado;
}

function obtenerInicioSemana() {
    const hoy = new Date();
    const dia = hoy.getDay();
    const diff = hoy.getDate() - dia + (dia === 0 ? -6 : 1);
    return new Date(hoy.setDate(diff)).setHours(0, 0, 0, 0);
}

function toggleTema() {
    const temaActual = document.documentElement.getAttribute('data-theme');
    const nuevoTema = temaActual === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('tema', nuevoTema);
    actualizarIconoTema(nuevoTema);
}

function actualizarIconoTema(tema) {
    const icono = document.querySelector('#theme-btn i');
    if (!icono) return;
    
    if (tema === 'dark') {
        icono.className = 'fas fa-sun';
    } else {
        icono.className = 'fas fa-moon';
    }
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.getElementById('notification');
    if (!notificacion) {
        console.log("📢 " + mensaje);
        return;
    }
    
    notificacion.textContent = mensaje;
    notificacion.className = 'notification show';
    
    // Color según tipo
    switch(tipo) {
        case 'success':
            notificacion.style.background = 'var(--success-color)';
            break;
        case 'error':
            notificacion.style.background = 'var(--accent-color)';
            break;
        default:
            notificacion.style.background = 'var(--primary-color)';
    }
    
    // Auto-ocultar
    setTimeout(() => {
        notificacion.classList.remove('show');
    }, 3000);
}

function mostrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function ocultarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

console.log("✅ app-limites.js (con Firebase) cargado correctamente");