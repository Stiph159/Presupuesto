// File: app-limites.js
// ====================
// VERSIÓN CORREGIDA - SIN RECARGAS
// ====================

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
// FUNCIONES FIREBASE
// ====================

async function initFirebaseLimites() {
    try {
        console.log("🚫 Inicializando Firebase para límites...");
        await loadConfigLimitesFromFirebase();
        setupRealtimeListenersLimites();
        mostrarNotificacion("✅ Límites conectados a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
        return false;
    }
}

async function loadConfigLimitesFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            const configData = configDoc.data();
            if (configData.nombres) configLimites.nombres = configData.nombres;
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
        const savedConfig = localStorage.getItem('gastos_config');
        if (savedConfig) configLimites = JSON.parse(savedConfig);
    }
}

// ====================
// LISTENER CORREGIDO (SIN RECARGAS)
// ====================

function setupRealtimeListenersLimites() {
    if (unsubscribeLimites) unsubscribeLimites();
    if (unsubscribeConfigLimites) unsubscribeConfigLimites();
    
    const db = firebase.firestore();
    
    unsubscribeLimites = db.collection('limites')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("🚫 Cambios detectados en límites:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const limiteData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                if (limiteData.timestamp && limiteData.timestamp.toDate) {
                    limiteData.timestamp = limiteData.timestamp.toDate();
                }
                
                switch (cambio.type) {
                    case 'added':
                        const existe = registrosLimites.some(r => r.id === limiteData.id);
                        if (!existe && !limiteData.id.toString().startsWith('temp_')) {
                            console.log("➕ Nuevo registro remoto");
                            registrosLimites.push(limiteData);
                            mostrarNotificacion(`📊 Nuevo registro de límite`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = registrosLimites.findIndex(r => r.id === limiteData.id);
                        if (indexMod !== -1) registrosLimites[indexMod] = limiteData;
                        break;
                    case 'removed':
                        registrosLimites = registrosLimites.filter(r => r.id !== limiteData.id);
                        mostrarNotificacion(`📌 Un registro fue eliminado`, 'warning');
                        break;
                }
            });
            
            registrosLimites.sort((a, b) => {
                const dateA = a.fechaCreacion ? new Date(a.fechaCreacion) : (a.timestamp || new Date(a.fecha));
                const dateB = b.fechaCreacion ? new Date(b.fechaCreacion) : (b.timestamp || new Date(b.fecha));
                return dateB - dateA;
            });
            
            actualizarUILimites();
            saveLimitesToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener:", error);
        });
    
    unsubscribeConfigLimites = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const configData = doc.data();
                if (configData.nombres) {
                    configLimites.nombres = configData.nombres;
                    actualizarUILimites();
                    saveLimitesToLocalStorage();
                }
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración:", error);
        });
}

async function saveLimiteToFirebase(limite) {
    try {
        const db = firebase.firestore();
        const limiteData = {
            fecha: limite.fecha,
            gastoReal: limite.gastoReal,
            limite: limite.limite,
            exceso: limite.exceso,
            ahorroTotal: limite.ahorroTotal,
            ahorroPorPersona: limite.ahorroPorPersona,
            dentroDeLimite: limite.dentroDeLimite,
            descripcion: limite.descripcion,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('limites').add(limiteData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
        throw error;
    }
}

async function deleteLimiteFromFirebase(id) {
    try {
        await firebase.firestore().collection('limites').doc(id).delete();
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        throw error;
    }
}

async function eliminarTodosLimitesDeFirebase() {
    try {
        const db = firebase.firestore();
        const limitesSnapshot = await db.collection('limites')
            .where('sharedId', '==', 'nuestra_pareja')
            .get();
        
        const batch = db.batch();
        limitesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (error) {
        console.error("❌ Error eliminando todos:", error);
    }
}

async function saveConfigLimitesToFirebase() {
    try {
        const db = firebase.firestore();
        await db.collection('config')
            .doc('nuestra_pareja')
            .set({ nombres: configLimites.nombres }, { merge: true });
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveLimitesToLocalStorage() {
    try {
        localStorage.setItem('limites_registros', JSON.stringify(registrosLimites));
        localStorage.setItem('gastos_config', JSON.stringify(configLimites));
    } catch (error) {
        console.error("Error guardando:", error);
    }
}

function loadLimitesFromLocalStorage() {
    try {
        const savedLimites = localStorage.getItem('limites_registros');
        const savedConfig = localStorage.getItem('gastos_config');
        
        if (savedLimites) registrosLimites = JSON.parse(savedLimites);
        if (savedConfig) configLimites = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("🚫 Iniciando app de límites...");
    
    loadLimitesFromLocalStorage();
    inicializarAppLimites();
    actualizarUILimites();
    
    setTimeout(async () => {
        await initFirebaseLimites();
    }, 1000);
});

function inicializarAppLimites() {
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    configurarEventosLimites();
    actualizarNombresEnUILimites();
    
    document.getElementById('fecha-limite').value = new Date().toISOString().split('T')[0];
    
    inicializarGraficoLimites();
}

function actualizarNombresEnUILimites() {
    if (configLimites.nombres) {
        document.getElementById('name-persona1-result').textContent = configLimites.nombres.persona1;
        document.getElementById('name-persona2-result').textContent = configLimites.nombres.persona2;
    }
}

// ====================
// FUNCIONES PRINCIPALES
// ====================

function calcularLimite() {
    const gastoReal = parseFloat(document.getElementById('gasto-real').value);
    const descripcion = document.getElementById('descripcion-limite').value.trim();
    
    if (!gastoReal || gastoReal <= 0) {
        mostrarNotificacion('Ingresa un gasto válido', 'error');
        return;
    }
    
    if (limiteSeleccionado === null) {
        mostrarNotificacion('Selecciona un límite', 'error');
        return;
    }
    
    let exceso = 0;
    let ahorroTotal = 0;
    let ahorroPorPersona = 0;
    let dentroDeLimite = false;
    let montoLimite = limiteSeleccionado === 0 ? 0 : limiteSeleccionado;
    
    if (limiteSeleccionado === 0) {
        exceso = gastoReal;
        ahorroTotal = gastoReal;
        ahorroPorPersona = gastoReal / 2;
    } else {
        exceso = Math.max(gastoReal - montoLimite, 0);
        
        if (exceso > 0) {
            ahorroTotal = exceso;
            ahorroPorPersona = exceso / 2;
        } else {
            dentroDeLimite = true;
        }
    }
    
    document.getElementById('result-gasto-real').textContent = `S/${gastoReal.toFixed(2)}`;
    document.getElementById('result-limite').textContent = montoLimite === 0 ? 'Sin límite' : `S/${montoLimite.toFixed(2)}`;
    document.getElementById('result-exceso').textContent = `S/${exceso.toFixed(2)}`;
    document.getElementById('result-ahorro-total').textContent = `S/${ahorroTotal.toFixed(2)}`;
    document.getElementById('ahorro-persona1').textContent = `S/${ahorroPorPersona.toFixed(2)}`;
    document.getElementById('ahorro-persona2').textContent = `S/${ahorroPorPersona.toFixed(2)}`;
    
    document.getElementById('result-section').style.display = 'block';
    
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
}

// ====================
// FUNCIÓN GUARDAR REGISTRO CORREGIDA (CON ID TEMPORAL)
// ====================

async function guardarRegistroLimite() {
    if (!window.calculoTemporalLimite) {
        mostrarNotificacion('Primero calcula un resultado', 'error');
        return;
    }
    
    const calculo = window.calculoTemporalLimite;
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoRegistro = {
        id: tempId,
        fecha: calculo.fecha,
        gastoReal: calculo.gastoReal,
        limite: calculo.limite,
        exceso: calculo.exceso,
        ahorroTotal: calculo.ahorroTotal,
        ahorroPorPersona: calculo.ahorroPorPersona,
        dentroDeLimite: calculo.dentroDeLimite,
        descripcion: calculo.descripcion,
        timestamp: new Date(),
        fechaCreacion: new Date().toISOString(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    registrosLimites.unshift(nuevoRegistro);
    actualizarUILimites();
    
    // 3. Limpiar formulario
    document.getElementById('gasto-real').value = '';
    document.getElementById('descripcion-limite').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    document.getElementById('result-section').style.display = 'none';
    limiteSeleccionado = null;
    window.calculoTemporalLimite = null;
    habilitarBotonCalcular();
    
    const mensaje = calculo.dentroDeLimite 
        ? '⏳ Guardando... ¡Excelente! Cumpliste el límite'
        : `⏳ Guardando... Ahorro: S/${calculo.ahorroTotal.toFixed(2)}`;
    
    mostrarNotificacion(mensaje, 'info');
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await saveLimiteToFirebase(nuevoRegistro);
        
        const index = registrosLimites.findIndex(r => r.id === tempId);
        if (index !== -1) {
            registrosLimites[index].id = firebaseId;
            registrosLimites[index].sincronizando = false;
        }
        
        mostrarNotificacion('✅ Registro guardado en la nube', 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = registrosLimites.findIndex(r => r.id === tempId);
        if (index !== -1) {
            registrosLimites[index].error = true;
        }
        mostrarNotificacion('⚠️ Registro guardado localmente', 'warning');
    }
    
    saveLimitesToLocalStorage();
}

async function eliminarRegistroLimite(id) {
    if (!confirm('¿Eliminar este registro?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const registroEliminado = registrosLimites.find(r => r.id === id);
    registrosLimites = registrosLimites.filter(r => r.id !== id);
    actualizarUILimites();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deleteLimiteFromFirebase(id);
            mostrarNotificacion('✅ Registro eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Registro eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        if (registroEliminado) {
            registrosLimites.push(registroEliminado);
            actualizarUILimites();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveLimitesToLocalStorage();
}

async function eliminarTodosLimitesDeFirebase() {
    try {
        const db = firebase.firestore();
        const limitesSnapshot = await db.collection('limites')
            .where('sharedId', '==', 'nuestra_pareja')
            .get();
        
        const batch = db.batch();
        limitesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    } catch (error) {
        console.error("Error eliminando todos:", error);
    }
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configLimites.nombres.persona1 = nombre1;
    configLimites.nombres.persona2 = nombre2;
    
    actualizarNombresEnUILimites();
    actualizarUILimites();
    ocultarModal('names-modal');
    
    try {
        await saveConfigLimitesToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveLimitesToLocalStorage();
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosLimites() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTema);
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => window.location.href = 'index.html');
    }
    
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            limiteSeleccionado = parseFloat(this.dataset.limit);
            mostrarInfoLimiteSeleccionado();
            habilitarBotonCalcular();
        });
    });
    
    const calcularBtn = document.getElementById('calcular-btn');
    if (calcularBtn) calcularBtn.addEventListener('click', calcularLimite);
    
    const gastoRealInput = document.getElementById('gasto-real');
    if (gastoRealInput) {
        gastoRealInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') calcularLimite();
        });
        gastoRealInput.addEventListener('input', habilitarBotonCalcular);
    }
    
    const guardarBtn = document.getElementById('guardar-btn');
    if (guardarBtn) guardarBtn.addEventListener('click', guardarRegistroLimite);
    
    const clearAllBtn = document.getElementById('clear-all');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            if (confirm('¿Eliminar todos los registros?')) {
                registrosLimites = [];
                eliminarTodosLimitesDeFirebase();
                actualizarUILimites();
                saveLimitesToLocalStorage();
                mostrarNotificacion('Todos los registros eliminados', 'success');
            }
        });
    }
    
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGraficoLimites(this.dataset.chart);
        });
    });
    
    const editNamesBtn = document.getElementById('edit-names');
    if (editNamesBtn) {
        editNamesBtn.addEventListener('click', () => {
            document.getElementById('nombre-persona1').value = configLimites.nombres.persona1;
            document.getElementById('nombre-persona2').value = configLimites.nombres.persona2;
            mostrarModal('names-modal');
        });
    }
    
    const saveNamesBtn = document.getElementById('save-names');
    if (saveNamesBtn) saveNamesBtn.addEventListener('click', guardarNombres);
    
    const cancelNamesBtn = document.getElementById('cancel-names');
    if (cancelNamesBtn) {
        cancelNamesBtn.addEventListener('click', () => ocultarModal('names-modal'));
    }
}

function mostrarInfoLimiteSeleccionado() {
    const opcionInfo = document.getElementById('opcion-seleccionada-info');
    const texto = document.getElementById('opcion-seleccionada-texto');
    const tipo = document.getElementById('opcion-seleccionada-tipo');
    
    if (!opcionInfo) return;
    
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
    }
    
    texto.textContent = nombreLimite;
    tipo.textContent = tipoLimite;
    opcionInfo.style.display = 'block';
}

function habilitarBotonCalcular() {
    const gasto = document.getElementById('gasto-real').value;
    const boton = document.getElementById('calcular-btn');
    if (!boton) return;
    
    boton.disabled = !(limiteSeleccionado !== null && gasto && parseFloat(gasto) > 0);
}

function actualizarUILimites() {
    actualizarResumenLimites();
    cargarRegistrosLimites();
    actualizarGraficoLimites('excesos');
}

function actualizarResumenLimites() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const registrosHoy = registrosLimites.filter(r => r.fecha === hoy);
    const registrosSemana = registrosLimites.filter(r => new Date(r.fecha) >= inicioSemana);
    const registrosMes = registrosLimites.filter(r => new Date(r.fecha) >= inicioMes);
    
    const totalHoy = registrosHoy.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalSemana = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalMes = registrosMes.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalAhorro = registrosLimites.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalExcesos = registrosLimites.filter(r => r.exceso > 0).length;
    
    document.getElementById('summary-hoy-limite').textContent = `S/${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana-limite').textContent = `S/${totalSemana.toFixed(2)}`;
    document.getElementById('summary-mes-limite').textContent = `S/${totalMes.toFixed(2)}`;
    document.getElementById('total-ahorro-forzado').textContent = `S/${totalAhorro.toFixed(2)}`;
    document.getElementById('total-dias-exceso').textContent = totalExcesos;
}

function cargarRegistrosLimites() {
    const container = document.getElementById('registros-container');
    const emptyState = document.getElementById('empty-state-limites');
    const totales = document.getElementById('totales-limites');
    
    if (!container) return;
    
    if (registrosLimites.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    const registrosOrdenados = [...registrosLimites].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    let html = '';
    
    registrosOrdenados.forEach(registro => {
        const fechaHora = new Date(registro.fechaCreacion || registro.fecha).toLocaleString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const clase = registro.dentroDeLimite ? 'cumplido' : 'exceso';
        const statusText = registro.dentroDeLimite ? 'Dentro de límite' : 'Con exceso';
        const limiteText = registro.limite === 0 ? 'Sin límite' : `Límite: S/${registro.limite}`;
        
        const sincronizandoClass = registro.sincronizando ? 'sincronizando' : '';
        const sincronizandoIcon = registro.sincronizando ? '<i class="fas fa-sync fa-spin"></i>' : '';
        const errorIcon = registro.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i>' : '';
        
        html += `
            <div class="registro-item ${clase} ${sincronizandoClass}">
                <div class="registro-header">
                    <div class="registro-status ${clase}">${statusText}</div>
                    <div class="registro-monto">S/${registro.gastoReal.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarRegistroLimite('${registro.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${registro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span>${limiteText}</span>
                        ${!registro.dentroDeLimite ? `<span>Ahorro: S/${registro.ahorroTotal.toFixed(2)}</span>` : ''}
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function inicializarGraficoLimites() {
    const ctx = document.getElementById('limites-chart');
    if (!ctx) return;
    
    chartLimitesInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
            datasets: [{
                label: 'Ahorro Forzado (S/)',
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
                legend: { labels: { color: 'var(--text-color)' } }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'var(--text-secondary)',
                        callback: value => 'S/' + value
                    },
                    grid: { color: 'var(--border-color)' }
                },
                x: {
                    ticks: { color: 'var(--text-secondary)' },
                    grid: { color: 'var(--border-color)' }
                }
            }
        }
    });
}

function actualizarGraficoLimites(tipo) {
    if (!chartLimitesInstance) return;
    
    let labels = [];
    let datos = [];
    
    const hoy = new Date();
    
    if (tipo === 'excesos' || !tipo) {
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
        
        chartLimitesInstance.data.datasets[0].label = 'Ahorro Forzado (S/)';
        chartLimitesInstance.data.datasets[0].backgroundColor = '#f56565';
    } else if (tipo === 'ahorros') {
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
        
        chartLimitesInstance.data.datasets[0].label = 'Ahorro Semanal (S/)';
        chartLimitesInstance.data.datasets[0].backgroundColor = '#38a169';
    }
    
    chartLimitesInstance.data.labels = labels;
    chartLimitesInstance.data.datasets[0].data = datos;
    chartLimitesInstance.update();
}

function obtenerInicioSemanaFecha(fecha) {
    const fechaObj = new Date(fecha);
    const dia = fechaObj.getDay();
    const diff = fechaObj.getDate() - dia + (dia === 0 ? -6 : 1);
    return new Date(fechaObj.setDate(diff));
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
    
    mostrarNotificacion(`Modo ${nuevoTema === 'dark' ? 'oscuro' : 'claro'}`, 'info');
}

function actualizarIconoTema(tema) {
    const icono = document.querySelector('#theme-btn i');
    if (!icono) return;
    icono.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.getElementById('notification');
    if (!notificacion) return;
    
    notificacion.textContent = mensaje;
    notificacion.className = 'notification show';
    
    switch(tipo) {
        case 'success': notificacion.style.background = 'var(--success-color)'; break;
        case 'error': notificacion.style.background = 'var(--accent-color)'; break;
        default: notificacion.style.background = 'var(--primary-color)';
    }
    
    setTimeout(() => notificacion.classList.remove('show'), 3000);
}

function mostrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function ocultarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

window.eliminarRegistroLimite = eliminarRegistroLimite;

console.log("✅ app-limites.js cargado correctamente (versión sin recargas)");