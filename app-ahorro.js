// File: app-ahorro.js - VERSIÓN CON FILTROS NUEVOS
// ====================

let ahorros = [];
let configAhorro = {
    metaMensual: 500,
    metaAnual: 6000,
    resetMensual: true,
    montosOpciones: {
        opcion1: 4.00,
        opcion2: 5.00,
        opcion3: 6.00
    },
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let personaSeleccionada = 'persona1';
let opcionSeleccionada = null;
let chartAhorroInstance = null;
let unsubscribeAhorros = null;
let unsubscribeConfigAhorro = null;

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebaseAhorro() {
    try {
        console.log("💰 Inicializando Firebase para ahorros...");
        await loadConfigAhorroFromFirebase();
        setupRealtimeListenersAhorro();
        mostrarNotificacion("✅ Ahorros conectados a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
        return false;
    }
}

async function loadConfigAhorroFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            const configData = configDoc.data();
            if (configData.ahorroConfig) configAhorro = configData.ahorroConfig;
            if (configData.nombres) configAhorro.nombres = configData.nombres;
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
        const savedConfig = localStorage.getItem('ahorro_config');
        if (savedConfig) configAhorro = JSON.parse(savedConfig);
    }
}

function setupRealtimeListenersAhorro() {
    if (unsubscribeAhorros) unsubscribeAhorros();
    if (unsubscribeConfigAhorro) unsubscribeConfigAhorro();
    
    const db = firebase.firestore();
    
    unsubscribeAhorros = db.collection('ahorros')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("💰 Cambios detectados en ahorros:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const ahorroData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                if (ahorroData.timestamp && ahorroData.timestamp.toDate) {
                    ahorroData.timestamp = ahorroData.timestamp.toDate();
                }
                
                switch (cambio.type) {
                    case 'added':
                        const temporalIndex = ahorros.findIndex(a => 
                            a.id.toString().startsWith('temp_') && 
                            Math.abs(a.monto - ahorroData.monto) < 0.01 &&
                            a.fecha === ahorroData.fecha && 
                            a.descripcion === ahorroData.descripcion &&
                            a.persona === ahorroData.persona
                        );
                        
                        if (temporalIndex !== -1) {
                            console.log("🔄 Reemplazando nuestro ahorro temporal");
                            ahorros[temporalIndex] = {
                                ...ahorroData,
                                sincronizando: false,
                                id: ahorroData.id
                            };
                        } 
                        else if (!ahorros.some(a => a.id === ahorroData.id)) {
                            console.log("➕ Nuevo ahorro de otro dispositivo");
                            ahorros.push({
                                ...ahorroData,
                                sincronizando: false
                            });
                            mostrarNotificacion(`💰 Nuevo ahorro de S/${ahorroData.monto.toFixed(2)}`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = ahorros.findIndex(a => a.id === ahorroData.id);
                        if (indexMod !== -1) ahorros[indexMod] = ahorroData;
                        break;
                    case 'removed':
                        ahorros = ahorros.filter(a => a.id !== ahorroData.id);
                        mostrarNotificacion(`📌 Un ahorro fue eliminado`, 'warning');
                        break;
                }
            });
            
            ahorros.sort((a, b) => {
                const dateA = a.timestamp || new Date(a.fecha);
                const dateB = b.timestamp || new Date(b.fecha);
                return dateB - dateA;
            });
            
            actualizarUIAhorro();
            saveAhorrosToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener:", error);
        });
    
    unsubscribeConfigAhorro = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const configData = doc.data();
                if (configData.ahorroConfig) configAhorro = configData.ahorroConfig;
                if (configData.nombres) configAhorro.nombres = configData.nombres;
                actualizarUIAhorro();
                saveAhorrosToLocalStorage();
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración:", error);
        });
}

async function saveAhorroToFirebase(ahorro) {
    try {
        const db = firebase.firestore();
        const ahorroData = {
            fecha: ahorro.fecha,
            monto: ahorro.monto,
            descripcion: ahorro.descripcion,
            persona: ahorro.persona,
            opcion: ahorro.opcion,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('ahorros').add(ahorroData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
        throw error;
    }
}

async function deleteAhorroFromFirebase(id) {
    try {
        await firebase.firestore().collection('ahorros').doc(id).delete();
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveAhorrosToLocalStorage() {
    try {
        localStorage.setItem('nuestros_ahorros', JSON.stringify(ahorros));
        localStorage.setItem('ahorro_config', JSON.stringify(configAhorro));
    } catch (error) {
        console.error("Error guardando:", error);
    }
}

function loadAhorrosFromLocalStorage() {
    try {
        const savedAhorros = localStorage.getItem('nuestros_ahorros');
        const savedConfig = localStorage.getItem('ahorro_config');
        
        if (savedAhorros) ahorros = JSON.parse(savedAhorros);
        if (savedConfig) configAhorro = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("💰 Iniciando app de ahorros...");
    
    loadAhorrosFromLocalStorage();
    inicializarAhorroApp();
    actualizarUIAhorro();
    
    setTimeout(async () => {
        await initFirebaseAhorro();
    }, 1000);
});

function inicializarAhorroApp() {
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    configurarEventosAhorro();
    configurarFiltrosAhorro(); // <-- NUEVO
    actualizarNombresEnUIAhorro();
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-ahorro').value = hoy;
    
    document.getElementById('monto-opcion1').textContent = configAhorro.montosOpciones.opcion1.toFixed(2);
    document.getElementById('monto-opcion2').textContent = configAhorro.montosOpciones.opcion2.toFixed(2);
    document.getElementById('monto-opcion3').textContent = configAhorro.montosOpciones.opcion3.toFixed(2);
    
    document.getElementById('meta-mensual').textContent = `S/${configAhorro.metaMensual}`;
    document.getElementById('meta-anual').textContent = `S/${configAhorro.metaAnual}`;
    
    inicializarGraficoAhorro();
}

function actualizarNombresEnUIAhorro() {
    document.getElementById('name-persona1').textContent = configAhorro.nombres.persona1;
    document.getElementById('name-persona2').textContent = configAhorro.nombres.persona2;
    
    // Actualizar filtros
    const filtroPersona1 = document.getElementById('filtro-persona1-ahorro');
    const filtroPersona2 = document.getElementById('filtro-persona2-ahorro');
    if (filtroPersona1) filtroPersona1.textContent = configAhorro.nombres.persona1;
    if (filtroPersona2) filtroPersona2.textContent = configAhorro.nombres.persona2;
}

// ====================
// NUEVAS FUNCIONES DE FILTROS
// ====================

function configurarFiltrosAhorro() {
    const busquedaInput = document.getElementById('busqueda-ahorro');
    const filtroOpcion = document.getElementById('filtro-opcion-ahorro');
    const filtroPersona = document.getElementById('filtro-persona-ahorro');
    const filtroFecha = document.getElementById('filtro-fecha-ahorro');
    const rangoFechas = document.getElementById('rango-fechas-ahorro');
    const fechaDesde = document.getElementById('fecha-desde-ahorro');
    const fechaHasta = document.getElementById('fecha-hasta-ahorro');
    const btnAplicarFecha = document.getElementById('aplicar-fecha-ahorro');
    const btnLimpiar = document.getElementById('limpiar-filtros-ahorro');
    const btnLimpiarTodo = document.getElementById('limpiar-todo-historial-ahorro');
    const btnExportar = document.getElementById('export-ahorro-btn');
    
    if (!busquedaInput) {
        console.warn("No se encontraron los filtros de ahorro");
        return;
    }
    
    // Búsqueda en tiempo real
    busquedaInput.addEventListener('input', aplicarFiltrosAhorro);
    
    // Filtros por select
    filtroOpcion.addEventListener('change', aplicarFiltrosAhorro);
    filtroPersona.addEventListener('change', aplicarFiltrosAhorro);
    filtroFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            rangoFechas.style.display = 'block';
        } else {
            rangoFechas.style.display = 'none';
            aplicarFiltrosAhorro();
        }
    });
    
    // Aplicar fechas personalizadas
    btnAplicarFecha.addEventListener('click', aplicarFiltrosAhorro);
    
    // Botón limpiar filtros
    btnLimpiar.addEventListener('click', function() {
        busquedaInput.value = '';
        filtroOpcion.value = '';
        filtroPersona.value = '';
        filtroFecha.value = 'all';
        rangoFechas.style.display = 'none';
        fechaDesde.value = '';
        fechaHasta.value = '';
        aplicarFiltrosAhorro();
        mostrarNotificacion('Filtros limpiados', 'info');
    });
    
    // Botón limpiar todo
    btnLimpiarTodo.addEventListener('click', mostrarModalLimpiarTodoAhorro);
    
    // Botón exportar
    if (btnExportar) {
        btnExportar.addEventListener('click', exportarAhorros);
    }
    
    // Eventos del modal
    const cancelarBtn = document.getElementById('cancelar-limpiar-todo-ahorro');
    const confirmarBtn = document.getElementById('confirmar-limpiar-todo-ahorro');
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', function() {
            document.getElementById('modal-limpiar-todo-ahorro').classList.remove('active');
        });
    }
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', limpiarTodoHistorialAhorro);
    }
}

function aplicarFiltrosAhorro() {
    const busqueda = document.getElementById('busqueda-ahorro')?.value.toLowerCase() || '';
    const opcion = document.getElementById('filtro-opcion-ahorro')?.value || '';
    const persona = document.getElementById('filtro-persona-ahorro')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha-ahorro')?.value || 'all';
    const fechaDesde = document.getElementById('fecha-desde-ahorro')?.value || '';
    const fechaHasta = document.getElementById('fecha-hasta-ahorro')?.value || '';
    
    let ahorrosFiltrados = [...ahorros];
    
    // Filtro por búsqueda
    if (busqueda) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => 
            a.descripcion.toLowerCase().includes(busqueda)
        );
    }
    
    // Filtro por opción
    if (opcion) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.opcion === opcion);
    }
    
    // Filtro por persona
    if (persona) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.persona === persona);
    }
    
    // Filtro por fecha
    if (filtroFecha !== 'all') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        switch(filtroFecha) {
            case 'today':
                const hoyStr = hoy.toISOString().split('T')[0];
                ahorrosFiltrados = ahorrosFiltrados.filter(a => a.fecha === hoyStr);
                break;
            case 'week':
                const inicioSemana = obtenerInicioSemana();
                ahorrosFiltrados = ahorrosFiltrados.filter(a => new Date(a.fecha) >= new Date(inicioSemana));
                break;
            case 'month':
                const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                ahorrosFiltrados = ahorrosFiltrados.filter(a => new Date(a.fecha) >= inicioMes);
                break;
            case 'custom':
                if (fechaDesde && fechaHasta) {
                    const desde = new Date(fechaDesde);
                    const hasta = new Date(fechaHasta);
                    hasta.setHours(23, 59, 59, 999);
                    ahorrosFiltrados = ahorrosFiltrados.filter(a => {
                        const fechaA = new Date(a.fecha);
                        return fechaA >= desde && fechaA <= hasta;
                    });
                }
                break;
        }
    }
    
    // Ordenar
    ahorrosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    // Actualizar estadísticas
    const mostrandoEl = document.getElementById('filtro-mostrando-ahorro');
    const totalEl = document.getElementById('filtro-total-ahorro');
    const totalMontoEl = document.getElementById('filtro-total-monto-ahorro');
    
    if (mostrandoEl) mostrandoEl.textContent = ahorrosFiltrados.length;
    if (totalEl) totalEl.textContent = ahorros.length;
    
    const totalMonto = ahorrosFiltrados.reduce((sum, a) => sum + a.monto, 0);
    if (totalMontoEl) totalMontoEl.textContent = `S/${totalMonto.toFixed(2)}`;
    
    // Mostrar resultados
    mostrarAhorrosFiltrados(ahorrosFiltrados);
    
    // Actualizar totales originales
    const totalFiltrado = document.getElementById('total-filtrado-ahorro');
    const totalGeneral = document.getElementById('total-general-ahorro');
    
    if (totalFiltrado) totalFiltrado.textContent = `S/${totalMonto.toFixed(2)}`;
    if (totalGeneral) totalGeneral.textContent = `S/${ahorros.reduce((sum, a) => sum + a.monto, 0).toFixed(2)}`;
}

function mostrarAhorrosFiltrados(ahorrosFiltrados) {
    const container = document.getElementById('ahorros-container');
    const emptyState = document.getElementById('empty-state-ahorro');
    const totales = document.getElementById('totales-ahorro');
    
    if (!container) return;
    
    if (ahorrosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: block;">
                <i class="far fa-search"></i>
                <h4>No se encontraron ahorros</h4>
                <p>Intenta con otros filtros.</p>
            </div>
        `;
        if (emptyState) emptyState.style.display = 'none';
        if (totales) totales.style.display = 'none';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (totales) totales.style.display = 'block';
    
    let html = '';
    
    ahorrosFiltrados.forEach(ahorro => {
        let fechaFormateada;
        const fechaAhorro = new Date(ahorro.fecha + 'T00:00:00');
        const ahora = new Date();
        const esHoy = fechaAhorro.toDateString() === ahora.toDateString();

        if (esHoy && ahorro.timestamp) {
            const hora = new Date(ahorro.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            fechaFormateada = `Hoy ${hora}`;
        } else if (ahorro.timestamp) {
            const fecha = fechaAhorro.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const hora = new Date(ahorro.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            fechaFormateada = `${fecha} ${hora}`;
        } else {
            fechaFormateada = fechaAhorro.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
        }
        
        const nombrePersona = ahorro.persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
        let nombreOpcion = '';
        let claseBadge = '';
        
        switch(ahorro.opcion) {
            case '1':
                nombreOpcion = 'Opción 1';
                claseBadge = 'badge-opcion1';
                break;
            case '2':
                nombreOpcion = 'Opción 2';
                claseBadge = 'badge-opcion2';
                break;
            case '3':
                nombreOpcion = 'Opción 3';
                claseBadge = 'badge-opcion3';
                break;
        }
        
        const sincronizandoClass = ahorro.sincronizando ? 'sincronizando' : '';
        const sincronizandoIcon = ahorro.sincronizando ? '<i class="fas fa-sync fa-spin"></i>' : '';
        const errorIcon = ahorro.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i>' : '';
        
        html += `
            <div class="ahorro-item ${ahorro.persona} ${sincronizandoClass}">
                <div class="gasto-header">
                    <div class="ahorro-monto">S/${ahorro.monto.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarAhorro('${ahorro.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${ahorro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona">${nombrePersona}</span>
                        <span class="ahorro-opcion ${claseBadge}">${nombreOpcion}</span>
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarModalLimpiarTodoAhorro() {
    const totalRegistros = document.getElementById('total-registros-eliminar-ahorro');
    const totalMonto = document.getElementById('monto-total-eliminar-ahorro');
    
    if (totalRegistros) totalRegistros.textContent = ahorros.length;
    
    const sumaTotal = ahorros.reduce((sum, a) => sum + a.monto, 0);
    if (totalMonto) totalMonto.textContent = `S/${sumaTotal.toFixed(2)}`;
    
    document.getElementById('modal-limpiar-todo-ahorro').classList.add('active');
}

async function limpiarTodoHistorialAhorro() {
    mostrarNotificacion('Eliminando todo el historial...', 'info');
    
    const idsFirebase = ahorros.filter(a => !a.id.toString().startsWith('temp_')).map(a => a.id);
    for (const id of idsFirebase) {
        try {
            await deleteAhorroFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando:", id);
        }
    }
    
    ahorros = [];
    actualizarUIAhorro();
    saveAhorrosToLocalStorage();
    
    document.getElementById('modal-limpiar-todo-ahorro').classList.remove('active');
    mostrarNotificacion('Todo el historial eliminado', 'success');
}

function exportarAhorros() {
    const dataStr = JSON.stringify(ahorros, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `ahorros_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Datos exportados', 'success');
}

// ====================
// FUNCIONES PRINCIPALES
// ====================

async function agregarAhorro() {
    if (!opcionSeleccionada) {
        mostrarNotificacion('Selecciona una opción', 'error');
        return;
    }
    
    const descripcion = document.getElementById('descripcion-ahorro').value.trim();
    const fecha = document.getElementById('fecha-ahorro').value;
    
    let monto = 0;
    let nombreOpcion = '';
    
    switch(opcionSeleccionada) {
        case '1':
            monto = configAhorro.montosOpciones.opcion1;
            nombreOpcion = 'Opción 1';
            break;
        case '2':
            monto = configAhorro.montosOpciones.opcion2;
            nombreOpcion = 'Opción 2';
            break;
        case '3':
            monto = configAhorro.montosOpciones.opcion3;
            nombreOpcion = 'Opción 3';
            break;
    }
    
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoAhorro = {
        id: tempId,
        fecha: fecha,
        monto: monto,
        descripcion: descripcion || nombreOpcion,
        persona: personaSeleccionada,
        opcion: opcionSeleccionada,
        timestamp: new Date(),
        sincronizando: true
    };
    
    ahorros.unshift(nuevoAhorro);
    actualizarUIAhorro();
    
    document.getElementById('descripcion-ahorro').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    opcionSeleccionada = null;
    habilitarBotonAgregar();
    
    const nombrePersona = personaSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    try {
        const firebaseId = await saveAhorroToFirebase(nuevoAhorro);
        
        const index = ahorros.findIndex(a => a.id === tempId);
        if (index !== -1) {
            ahorros[index].id = firebaseId;
            ahorros[index].sincronizando = false;
        }
        
        mostrarNotificacion(`✅ ${nombrePersona} ahorró S/${monto.toFixed(2)}`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = ahorros.findIndex(a => a.id === tempId);
        if (index !== -1) {
            ahorros[index].error = true;
        }
        mostrarNotificacion(`⚠️ ${nombrePersona} ahorró S/${monto.toFixed(2)} (sin conexión)`, 'warning');
    }
    
    saveAhorrosToLocalStorage();
}

async function eliminarAhorro(id) {
    if (!confirm('¿Estás seguro de eliminar este ahorro?')) return;
    
    mostrarNotificacion('⌛ Eliminando...', 'info');
    
    const ahorroEliminado = ahorros.find(a => a.id === id);
    ahorros = ahorros.filter(a => a.id !== id);
    actualizarUIAhorro();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deleteAhorroFromFirebase(id);
            mostrarNotificacion('✅ Ahorro eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Ahorro eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        if (ahorroEliminado) {
            ahorros.push(ahorroEliminado);
            actualizarUIAhorro();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveAhorrosToLocalStorage();
}

// ====================
// FUNCIONES DE CONFIGURACIÓN
// ====================

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configAhorro.nombres.persona1 = nombre1;
    configAhorro.nombres.persona2 = nombre2;
    
    actualizarNombresEnUIAhorro();
    actualizarUIAhorro();
    ocultarModal('names-modal');
    
    try {
        await saveConfigAhorroToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveAhorrosToLocalStorage();
}

async function guardarMetas() {
    const metaMensual = parseFloat(document.getElementById('meta-mensual-input').value);
    const metaAnual = parseFloat(document.getElementById('meta-anual-input').value);
    const resetMensual = document.getElementById('reset-mensual').checked;
    
    if (metaMensual && metaMensual > 0 && metaAnual && metaAnual > 0) {
        configAhorro.metaMensual = metaMensual;
        configAhorro.metaAnual = metaAnual;
        configAhorro.resetMensual = resetMensual;
        
        document.getElementById('meta-mensual').textContent = `S/${metaMensual}`;
        document.getElementById('meta-anual').textContent = `S/${metaAnual}`;
        actualizarUIAhorro();
        ocultarModal('meta-modal');
        
        try {
            await saveConfigAhorroToFirebase();
            mostrarNotificacion('Metas actualizadas', 'success');
        } catch (error) {
            console.error("Error guardando metas:", error);
            mostrarNotificacion('Metas actualizadas (local)', 'warning');
        }
        
        saveAhorrosToLocalStorage();
    }
}

async function guardarMontos() {
    const monto1 = parseFloat(document.getElementById('monto-opcion1-input').value);
    const monto2 = parseFloat(document.getElementById('monto-opcion2-input').value);
    const monto3 = parseFloat(document.getElementById('monto-opcion3-input').value);
    
    if (monto1 >= 0 && monto2 >= 0 && monto3 >= 0) {
        configAhorro.montosOpciones.opcion1 = monto1;
        configAhorro.montosOpciones.opcion2 = monto2;
        configAhorro.montosOpciones.opcion3 = monto3;
        
        document.getElementById('monto-opcion1').textContent = monto1.toFixed(2);
        document.getElementById('monto-opcion2').textContent = monto2.toFixed(2);
        document.getElementById('monto-opcion3').textContent = monto3.toFixed(2);
        ocultarModal('montos-modal');
        
        try {
            await saveConfigAhorroToFirebase();
            mostrarNotificacion('Montos actualizados', 'success');
        } catch (error) {
            console.error("Error guardando montos:", error);
            mostrarNotificacion('Montos actualizados (local)', 'warning');
        }
        
        saveAhorrosToLocalStorage();
    }
}

async function saveConfigAhorroToFirebase() {
    try {
        const db = firebase.firestore();
        const configDocRef = db.collection('config').doc('nuestra_pareja');
        const configDoc = await configDocRef.get();
        let configData = configDoc.exists ? configDoc.data() : {};
        
        configData.ahorroConfig = configAhorro;
        configData.nombres = configAhorro.nombres;
        
        await configDocRef.set(configData, { merge: true });
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosAhorro() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTema);
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => window.location.href = 'index.html');
    }
    
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
            habilitarBotonAgregar();
        });
    });
    
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('click', function() {
            document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            opcionSeleccionada = this.dataset.opcion;
            
            const opcionInfo = document.getElementById('opcion-seleccionada-info');
            const texto = document.getElementById('opcion-seleccionada-texto');
            const monto = document.getElementById('opcion-seleccionada-monto');
            
            if (opcionInfo && texto && monto) {
                let nombreOpcion = '';
                let montoOpcion = 0;
                
                switch(opcionSeleccionada) {
                    case '1':
                        nombreOpcion = 'Opción 1';
                        montoOpcion = configAhorro.montosOpciones.opcion1;
                        break;
                    case '2':
                        nombreOpcion = 'Opción 2';
                        montoOpcion = configAhorro.montosOpciones.opcion2;
                        break;
                    case '3':
                        nombreOpcion = 'Opción 3';
                        montoOpcion = configAhorro.montosOpciones.opcion3;
                        break;
                }
                
                texto.textContent = nombreOpcion;
                monto.textContent = `S/${montoOpcion.toFixed(2)}`;
                opcionInfo.style.display = 'block';
            }
            
            habilitarBotonAgregar();
        });
    });
    
    const addBtn = document.getElementById('add-ahorro-btn');
    if (addBtn) addBtn.addEventListener('click', agregarAhorro);
    
    const descInput = document.getElementById('descripcion-ahorro');
    if (descInput) {
        descInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') agregarAhorro();
        });
    }
    
    const editNamesBtn = document.getElementById('edit-names');
    if (editNamesBtn) {
        editNamesBtn.addEventListener('click', () => {
            document.getElementById('nombre-persona1').value = configAhorro.nombres.persona1;
            document.getElementById('nombre-persona2').value = configAhorro.nombres.persona2;
            mostrarModal('names-modal');
        });
    }
    
    const saveNamesBtn = document.getElementById('save-names');
    if (saveNamesBtn) saveNamesBtn.addEventListener('click', guardarNombres);
    
    const cancelNamesBtn = document.getElementById('cancel-names');
    if (cancelNamesBtn) {
        cancelNamesBtn.addEventListener('click', () => ocultarModal('names-modal'));
    }
    
    const editMetaBtn = document.getElementById('edit-meta');
    if (editMetaBtn) {
        editMetaBtn.addEventListener('click', () => {
            document.getElementById('meta-mensual-input').value = configAhorro.metaMensual;
            document.getElementById('meta-anual-input').value = configAhorro.metaAnual;
            document.getElementById('reset-mensual').checked = configAhorro.resetMensual;
            mostrarModal('meta-modal');
        });
    }
    
    const saveMetaBtn = document.getElementById('save-meta');
    if (saveMetaBtn) saveMetaBtn.addEventListener('click', guardarMetas);
    
    const cancelMetaBtn = document.getElementById('cancel-meta');
    if (cancelMetaBtn) {
        cancelMetaBtn.addEventListener('click', () => ocultarModal('meta-modal'));
    }
    
    const saveMontosBtn = document.getElementById('save-montos');
    if (saveMontosBtn) saveMontosBtn.addEventListener('click', guardarMontos);
    
    const cancelMontosBtn = document.getElementById('cancel-montos');
    if (cancelMontosBtn) {
        cancelMontosBtn.addEventListener('click', () => ocultarModal('montos-modal'));
    }
    
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGraficoAhorro(this.dataset.chart);
        });
    });
}

function habilitarBotonAgregar() {
    const boton = document.getElementById('add-ahorro-btn');
    if (!boton) return;
    
    boton.disabled = !(opcionSeleccionada && personaSeleccionada);
}

function actualizarUIAhorro() {
    actualizarResumenAhorro();
    actualizarMetas();
    aplicarFiltrosAhorro(); // Usar los nuevos filtros
    actualizarGraficoAhorro('opciones');
}

function actualizarResumenAhorro() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const ahorrosHoy = ahorros.filter(a => a.fecha === hoy);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const totalHoy = ahorrosHoy.reduce((sum, a) => sum + a.monto, 0);
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    
    document.getElementById('summary-hoy-ahorro').textContent = `S/${totalHoy.toFixed(2)}`;
    document.getElementById('summary-mes-ahorro').textContent = `S/${totalMes.toFixed(2)}`;
    
    const porcentajeElement = document.getElementById('summary-porcentaje-meta');
    if (porcentajeElement) {
        const porcentajeMeta = (totalMes / configAhorro.metaMensual) * 100;
        porcentajeElement.textContent = `${Math.min(porcentajeMeta, 100).toFixed(1)}%`;
        
        if (porcentajeMeta >= 100) porcentajeElement.style.color = 'var(--success-color)';
        else if (porcentajeMeta >= 70) porcentajeElement.style.color = 'var(--warning-color)';
        else porcentajeElement.style.color = 'var(--accent-color)';
    }
}

function actualizarMetas() {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const inicioAnio = new Date(new Date().getFullYear(), 0, 1);
    
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    const ahorrosAnio = ahorros.filter(a => new Date(a.fecha) >= inicioAnio);
    
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    const totalAnio = ahorrosAnio.reduce((sum, a) => sum + a.monto, 0);
    
    document.getElementById('ahorrado-mensual').textContent = `S/${totalMes.toFixed(2)}`;
    document.getElementById('restante-mensual').textContent = `S/${Math.max(configAhorro.metaMensual - totalMes, 0).toFixed(2)}`;
    document.getElementById('ahorrado-anual').textContent = `S/${totalAnio.toFixed(2)}`;
    document.getElementById('restante-anual').textContent = `S/${Math.max(configAhorro.metaAnual - totalAnio, 0).toFixed(2)}`;
    
    const progressMensual = document.getElementById('progress-mensual');
    const progressAnual = document.getElementById('progress-anual');
    
    if (progressMensual && progressAnual) {
        const porcentajeMensual = Math.min((totalMes / configAhorro.metaMensual) * 100, 100);
        const porcentajeAnual = Math.min((totalAnio / configAhorro.metaAnual) * 100, 100);
        
        progressMensual.style.width = `${porcentajeMensual}%`;
        progressAnual.style.width = `${porcentajeAnual}%`;
    }
}

function inicializarGraficoAhorro() {
    const ctx = document.getElementById('ahorro-chart');
    if (!ctx) return;
    
    chartAhorroInstance = new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: ['Opción 1', 'Opción 2', 'Opción 3'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: ['#667eea', '#f56565', '#38a169'],
                borderWidth: 2,
                borderColor: 'var(--card-bg)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: 'var(--text-color)', padding: 20 }
                }
            }
        }
    });
}

function actualizarGraficoAhorro(tipo) {
    if (!chartAhorroInstance) return;
    
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const totalOpcion1 = ahorrosMes.filter(a => a.opcion === '1').reduce((sum, a) => sum + a.monto, 0);
    const totalOpcion2 = ahorrosMes.filter(a => a.opcion === '2').reduce((sum, a) => sum + a.monto, 0);
    const totalOpcion3 = ahorrosMes.filter(a => a.opcion === '3').reduce((sum, a) => sum + a.monto, 0);
    
    chartAhorroInstance.data.datasets[0].data = [totalOpcion1, totalOpcion2, totalOpcion3];
    chartAhorroInstance.update();
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
        case 'warning': notificacion.style.background = 'var(--warning-color)'; break;
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

// Hacer funciones globales
window.eliminarAhorro = eliminarAhorro;

console.log("✅ app-ahorro.js cargado correctamente (versión con filtros nuevos)");