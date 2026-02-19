// File: app.js
// ====================
// CONFIGURACIÓN INICIAL - VERSIÓN CORREGIDA (SIN RECARGAS)
// ====================

// Variables globales
let gastos = [];
let config = {
    presupuesto: 1500,
    resetSemanal: true,
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let personaSeleccionada = 'persona1';
let categoriaSeleccionada = 'otros';
let chartInstance = null;
let unsubscribeGastos = null;
let unsubscribeConfig = null;

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebase() {
    try {
        console.log("🔥 Inicializando Firebase...");
        
        if (typeof firebase === 'undefined') {
            console.error("Firebase no está cargado");
            mostrarNotificacion("⚠️ Firebase no disponible", "warning");
            return false;
        }
        
        try {
            await firebase.auth().signInAnonymously();
            console.log("✅ Autenticado anónimamente");
        } catch (authError) {
            console.warn("No se pudo autenticar:", authError);
        }
        
        await loadConfigFromFirebase();
        setupRealtimeListeners();
        
        mostrarNotificacion("✅ Conectado a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error inicializando Firebase:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
        return false;
    }
}

async function loadConfigFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            config = configDoc.data();
            console.log("✅ Configuración cargada:", config);
        } else {
            await db.collection('config').doc('nuestra_pareja').set(config);
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
    }
}

// ====================
// LISTENER CORREGIDO (SIN RECARGAS)
// ====================

function setupRealtimeListeners() {
    if (unsubscribeGastos) unsubscribeGastos();
    if (unsubscribeConfig) unsubscribeConfig();
    
    const db = firebase.firestore();
    
    unsubscribeGastos = db.collection('gastos')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("🔔 Cambios detectados en gastos:", snapshot.docChanges().length);
            
            // PROCESAR CADA CAMBIO INDIVIDUALMENTE
            snapshot.docChanges().forEach(cambio => {
                const docData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                if (docData.timestamp && docData.timestamp.toDate) {
                    docData.timestamp = docData.timestamp.toDate();
                }
                
                switch (cambio.type) {
                    case 'added':
                        const existe = gastos.some(g => g.id === docData.id);
                        if (!existe && !docData.id.toString().startsWith('temp_')) {
                            console.log("➕ Nuevo gasto remoto:", docData.descripcion);
                            gastos.push(docData);
                            mostrarNotificacion(`🔔 Nuevo gasto de S/${docData.monto.toFixed(2)}`, 'info');
                        }
                        break;
                        
                    case 'modified':
                        console.log("✏️ Gasto modificado:", docData.id);
                        const indexMod = gastos.findIndex(g => g.id === docData.id);
                        if (indexMod !== -1) {
                            gastos[indexMod] = docData;
                        }
                        break;
                        
                    case 'removed':
                        console.log("❌ Gasto eliminado:", docData.id);
                        gastos = gastos.filter(g => g.id !== docData.id);
                        mostrarNotificacion(`📌 Un gasto fue eliminado`, 'warning');
                        break;
                }
            });
            
            gastos.sort((a, b) => {
            // Primero intenta con fechaCreacion (la del celular)
            const dateA = a.fechaCreacion 
                ? new Date(a.fechaCreacion) 
                : (a.timestamp || new Date(a.fecha));
            
            const dateB = b.fechaCreacion 
                ? new Date(b.fechaCreacion) 
                : (b.timestamp || new Date(b.fecha));
            
            return dateB - dateA;
        });
            
            actualizarUI();
            saveToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener:", error);
        });
    
    unsubscribeConfig = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                config = doc.data();
                actualizarUI();
                saveToLocalStorage();
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración:", error);
        });
}

async function saveGastoToFirebase(gasto) {
    try {
        const db = firebase.firestore();
        const gastoData = {
            fecha: gasto.fecha,
            monto: gasto.monto,
            descripcion: gasto.descripcion,
            persona: gasto.persona,
            categoria: gasto.categoria,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('gastos').add(gastoData);
        console.log("✅ Gasto guardado en Firebase con ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
        throw error;
    }
}

async function deleteGastoFromFirebase(id) {
    try {
        await firebase.firestore().collection('gastos').doc(id).delete();
        console.log("✅ Gasto eliminado:", id);
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        throw error;
    }
}

async function saveConfigToFirebase() {
    try {
        await firebase.firestore()
            .collection('config')
            .doc('nuestra_pareja')
            .set(config, { merge: true });
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveToLocalStorage() {
    try {
        localStorage.setItem('nuestros_gastos', JSON.stringify(gastos));
        localStorage.setItem('gastos_config', JSON.stringify(config));
    } catch (error) {
        console.error("Error guardando en localStorage:", error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedGastos = localStorage.getItem('nuestros_gastos');
        const savedConfig = localStorage.getItem('gastos_config');
        
        if (savedGastos) gastos = JSON.parse(savedGastos);
        if (savedConfig) config = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("🚀 Iniciando aplicación...");
    
    loadFromLocalStorage();
    inicializarApp();
    actualizarUI();
    
    setTimeout(async () => {
        await initFirebase();
    }, 1000);
});

function inicializarApp() {
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    configurarEventos();
    actualizarNombresEnUI();
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-gasto').value = hoy;
    
    inicializarGrafico();
}

// ====================
// FUNCIÓN AGREGAR GASTO CORREGIDA (CON ID TEMPORAL)
// ====================

async function agregarGasto() {
    const monto = parseFloat(document.getElementById('monto').value);
    const descripcion = document.getElementById('descripcion').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        document.getElementById('monto').focus();
        return;
    }
    
    if (!descripcion) {
        mostrarNotificacion('Ingresa una descripción', 'error');
        document.getElementById('descripcion').focus();
        return;
    }
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoGasto = {
        id: tempId,
        fecha: fecha,
        monto: monto,
        descripcion: descripcion,
        persona: personaSeleccionada,
        categoria: categoriaSeleccionada,
        timestamp: new Date(),
        fechaCreacion: new Date().toISOString(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    gastos.unshift(nuevoGasto);
    actualizarUI();
    
    // 3. Limpiar formulario
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('monto').focus();
    
    const nombrePersona = personaSeleccionada === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await saveGastoToFirebase(nuevoGasto);
        
        // 5. ACTUALIZAR el gasto existente con el ID real
        const index = gastos.findIndex(g => g.id === tempId);
        if (index !== -1) {
            gastos[index].id = firebaseId;
            gastos[index].sincronizando = false;
            // No necesitas actualizar UI, el gasto ya está visible
        }
        
        mostrarNotificacion(`✅ ${nombrePersona} gastó S/${monto.toFixed(2)}`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = gastos.findIndex(g => g.id === tempId);
        if (index !== -1) {
            gastos[index].error = true;
        }
        mostrarNotificacion(`⚠️ ${nombrePersona} gastó S/${monto.toFixed(2)} (sin conexión)`, 'warning');
    }
    
    saveToLocalStorage();
}

async function eliminarGasto(id) {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    // Guardar copia por si algo sale mal
    const gastoEliminado = gastos.find(g => g.id === id);
    gastos = gastos.filter(g => g.id !== id);
    actualizarUI();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deleteGastoFromFirebase(id);
            mostrarNotificacion('✅ Gasto eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Gasto eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        // Restaurar si falla
        if (gastoEliminado) {
            gastos.push(gastoEliminado);
            actualizarUI();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveToLocalStorage();
}

// ====================
// RESTO DE FUNCIONES (SIN CAMBIOS)
// ====================

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    config.nombres.persona1 = nombre1;
    config.nombres.persona2 = nombre2;
    
    actualizarNombresEnUI();
    actualizarUI();
    ocultarModalNombres();
    
    try {
        await saveConfigToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveToLocalStorage();
}

async function guardarPresupuesto() {
    const presupuesto = parseFloat(document.getElementById('presupuesto-semanal').value);
    const resetSemanal = document.getElementById('reset-semanal').checked;
    
    if (presupuesto && presupuesto > 0) {
        config.presupuesto = presupuesto;
        config.resetSemanal = resetSemanal;
        
        actualizarUI();
        ocultarModalPresupuesto();
        
        try {
            await saveConfigToFirebase();
            mostrarNotificacion(`Presupuesto: S/${presupuesto.toFixed(2)}`, 'success');
        } catch (error) {
            console.error("Error guardando presupuesto:", error);
            mostrarNotificacion('Presupuesto actualizado (local)', 'warning');
        }
        
        saveToLocalStorage();
    }
}

function configurarEventos() {
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
        });
    });
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categoriaSeleccionada = this.dataset.category;
            
            const sugerencias = {
                comida: 'Supermercado, restaurante...',
                transporte: 'Uber, gasolina...',
                entretenimiento: 'Cine, concierto...',
                compras: 'Ropa, regalos...',
                otros: 'Otros gastos...'
            };
            
            document.getElementById('descripcion').placeholder = sugerencias[categoriaSeleccionada] || 'Descripción...';
        });
    });
    
    document.getElementById('add-btn').addEventListener('click', agregarGasto);
    
    document.getElementById('descripcion').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarGasto();
    });
    
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            ejecutarAccion(accion);
        });
    });
    
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGrafico(this.dataset.chart);
        });
    });
    
    document.getElementById('edit-names').addEventListener('click', mostrarModalNombres);
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', ocultarModalNombres);
    
    document.getElementById('edit-budget').addEventListener('click', mostrarModalPresupuesto);
    document.getElementById('save-budget').addEventListener('click', guardarPresupuesto);
    document.getElementById('cancel-budget').addEventListener('click', ocultarModalPresupuesto);
    
    document.getElementById('export-btn').addEventListener('click', exportarDatos);
    document.getElementById('search-toggle').addEventListener('click', toggleBusqueda);
    document.getElementById('search-clear').addEventListener('click', limpiarBusqueda);
    document.getElementById('search-input').addEventListener('input', filtrarGastos);
    
    document.getElementById('filter-category').addEventListener('change', filtrarGastos);
    document.getElementById('filter-person').addEventListener('change', filtrarGastos);
    document.getElementById('filter-date').addEventListener('change', filtrarGastos);
    document.getElementById('clear-filters').addEventListener('click', limpiarFiltros);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
            ocultarModalPresupuesto();
        }
    });
}

function ejecutarAccion(accion) {
    switch(accion) {
        case 'ver-mis-gastos':
            document.getElementById('filter-person').value = 'persona1';
            filtrarGastos();
            break;
        case 'ver-mis-finanzas':
            window.location.href = 'finanzas-personales.html?persona=yo';
            break;
        case 'ver-sus-finanzas':
            window.location.href = 'finanzas-personales.html?persona=ella';
            break;
        case 'ver-limites':
            window.location.href = 'limites.html';
            break;
        case 'ver-sus-gastos':
            document.getElementById('filter-person').value = 'persona2';
            filtrarGastos();
            break;
        case 'ver-semana':
            document.getElementById('filter-date').value = 'week';
            filtrarGastos();
            break;
        case 'ver-todos':
            limpiarFiltros();
            break;
        case 'ver-ahorros':
            window.location.href = 'ahorro.html';
            break;
        case 'ver-dias-especiales':
            window.location.href = 'dias-especiales.html';
            break;
    }
}

function actualizarUI() {
    actualizarResumen();
    actualizarPresupuesto();
    actualizarGrafico('categorias');
    filtrarGastos();
    actualizarQuickSummary();
    actualizarNombresEnUI();
}

function actualizarNombresEnUI() {
    const el1 = document.getElementById('name-persona1');
    const el2 = document.getElementById('name-persona2');
    if (el1) el1.textContent = config.nombres.persona1;
    if (el2) el2.textContent = config.nombres.persona2;
}

function actualizarResumen() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('summary-hoy').textContent = `S/${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `S/${totalSemana.toFixed(2)}`;
    
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
    
    const diferenciaElement = document.getElementById('summary-diferencia');
    diferenciaElement.textContent = `S/${diferencia.toFixed(2)}`;
    
    if (diferencia === 0) diferenciaElement.style.color = 'var(--success-color)';
    else if (diferencia > 500) diferenciaElement.style.color = 'var(--accent-color)';
    else diferenciaElement.style.color = 'var(--warning-color)';
}

function actualizarPresupuesto() {
    const inicioSemana = obtenerInicioSemana();
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    const presupuesto = config.presupuesto;
    const porcentaje = Math.min((totalSemana / presupuesto) * 100, 100);
    
    document.getElementById('budget-amount').textContent = presupuesto.toFixed(2);
    document.getElementById('budget-remaining').textContent = Math.max(presupuesto - totalSemana, 0).toFixed(2);
    document.getElementById('budget-progress').style.width = `${porcentaje}%`;
    
    const progressBar = document.getElementById('budget-progress');
    if (porcentaje < 70) progressBar.style.background = 'var(--gradient-success)';
    else if (porcentaje < 90) progressBar.style.background = 'var(--gradient-warning)';
    else progressBar.style.background = 'var(--gradient-primary)';
    
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('budget-persona1').textContent = `S/${gastosPersona1.toFixed(2)}`;
    document.getElementById('budget-persona2').textContent = `S/${gastosPersona2.toFixed(2)}`;
}

function filtrarGastos() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoria = document.getElementById('filter-category').value;
    const persona = document.getElementById('filter-person').value;
    const rangoFecha = document.getElementById('filter-date').value;
    
    let gastosFiltrados = [...gastos];
    
    if (searchTerm) {
        gastosFiltrados = gastosFiltrados.filter(g => 
            g.descripcion.toLowerCase().includes(searchTerm)
        );
    }
    
    if (categoria) gastosFiltrados = gastosFiltrados.filter(g => g.categoria === categoria);
    if (persona) gastosFiltrados = gastosFiltrados.filter(g => g.persona === persona);
    
    if (rangoFecha && rangoFecha !== 'all') {
        const hoy = new Date();
        let fechaInicio;
        
        switch(rangoFecha) {
            case 'today':
                fechaInicio = new Date(hoy.setHours(0, 0, 0, 0));
                break;
            case 'week':
                fechaInicio = obtenerInicioSemana();
                break;
            case 'month':
                fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                break;
            default:
                fechaInicio = null;
        }
        
        if (fechaInicio) {
            gastosFiltrados = gastosFiltrados.filter(g => new Date(g.fecha) >= fechaInicio);
        }
    }
    
    gastosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    mostrarGastosFiltrados(gastosFiltrados);
    
    const totalFiltrado = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
    const totalGeneral = gastos.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('total-filtrado').textContent = `S/${totalFiltrado.toFixed(2)}`;
    document.getElementById('total-general').textContent = `S/${totalGeneral.toFixed(2)}`;
}

function mostrarGastosFiltrados(gastosFiltrados) {
    const container = document.getElementById('gastos-container');
    const emptyState = document.getElementById('empty-state');
    const totales = document.getElementById('totales');
    
    if (gastosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="far fa-search"></i>
                <h4>No se encontraron gastos</h4>
                <p>Intenta con otros filtros.</p>
            </div>
        `;
        emptyState.style.display = 'none';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    const iconosCategorias = {
        comida: '🍔',
        transporte: '🚗',
        entretenimiento: '🎬',
        compras: '🛍️',
        otros: '📦'
    };
    
    const nombresCategorias = {
        comida: 'Comida',
        transporte: 'Transporte',
        entretenimiento: 'Entretenimiento',
        compras: 'Compras',
        otros: 'Otros'
    };
    
    let html = '';
    
    gastosFiltrados.forEach(gasto => {
        const fechaHora = new Date(gasto.fechaCreacion || gasto.fecha).toLocaleString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const nombrePersona = gasto.persona === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const iconoCategoria = iconosCategorias[gasto.categoria] || '📦';
        const nombreCategoria = nombresCategorias[gasto.categoria] || 'Otros';
        const idSeguro = gasto.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        const sincronizandoClass = gasto.sincronizando ? 'sincronizando' : '';
        const sincronizandoIcon = gasto.sincronizando ? '<i class="fas fa-sync fa-spin"></i>' : '';
        const errorIcon = gasto.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i>' : '';
        
        html += `
            <div class="gasto-item ${gasto.persona} ${sincronizandoClass}" data-id="${gasto.id}">
                <div class="gasto-header">
                    <div class="gasto-monto">S/${gasto.monto.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarGasto('${idSeguro}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${gasto.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona">${nombrePersona}</span>
                        <span class="gasto-categoria">${iconoCategoria} ${nombreCategoria}</span>
                    </div>
                    <div class="gasto-fecha">${fechaHora}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function limpiarFiltros() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-person').value = '';
    document.getElementById('filter-date').value = 'all';
    document.getElementById('search-box').style.display = 'none';
    filtrarGastos();
    mostrarNotificacion('Filtros limpiados', 'info');
}

function inicializarGrafico() {
    const ctx = document.getElementById('gastos-chart').getContext('2d');
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: ['#667eea', '#764ba2', '#f56565', '#ed8936', '#38a169'],
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
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `S/${context.parsed.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

function actualizarGrafico(tipo) {
    if (!chartInstance) return;
    
    let labels = [];
    let datos = [];
    
    const inicioSemana = obtenerInicioSemana();
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    switch(tipo) {
        case 'categorias':
            const categorias = ['comida', 'transporte', 'entretenimiento', 'compras', 'otros'];
            labels = ['Comida', 'Transporte', 'Entretenimiento', 'Compras', 'Otros'];
            categorias.forEach(cat => {
                const total = gastosSemana.filter(g => g.categoria === cat).reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
        case 'personas':
            labels = [config.nombres.persona1, config.nombres.persona2];
            const totalPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
            const totalPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
            datos.push(totalPersona1, totalPersona2);
            break;
        case 'semana':
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
                const total = gastos.filter(g => g.fecha === fecha).reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
    }
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = datos;
    chartInstance.update();
}

function exportarDatos() {
    const dataStr = JSON.stringify(gastos, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `gastos_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Datos exportados', 'success');
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
    if (tema === 'dark') {
        icono.className = 'fas fa-sun';
    } else {
        icono.className = 'fas fa-moon';
    }
}

function obtenerInicioSemana() {
    const hoy = new Date();
    const dia = hoy.getDay();
    const diff = hoy.getDate() - dia + (dia === 0 ? -6 : 1);
    return new Date(hoy.setDate(diff)).setHours(0, 0, 0, 0);
}

function toggleBusqueda() {
    const searchBox = document.getElementById('search-box');
    searchBox.style.display = searchBox.style.display === 'none' ? 'block' : 'none';
    if (searchBox.style.display === 'block') document.getElementById('search-input').focus();
}

function limpiarBusqueda() {
    document.getElementById('search-input').value = '';
    filtrarGastos();
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

function actualizarQuickSummary() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    document.getElementById('summary-hoy').textContent = `S/${gastosHoy.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `S/${gastosSemana.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
}

function mostrarModalNombres() {
    document.getElementById('nombre-persona1').value = config.nombres.persona1;
    document.getElementById('nombre-persona2').value = config.nombres.persona2;
    document.getElementById('names-modal').classList.add('active');
}

function ocultarModalNombres() {
    document.getElementById('names-modal').classList.remove('active');
}

function mostrarModalPresupuesto() {
    document.getElementById('presupuesto-semanal').value = config.presupuesto;
    document.getElementById('reset-semanal').checked = config.resetSemanal;
    document.getElementById('budget-modal').classList.add('active');
}

function ocultarModalPresupuesto() {
    document.getElementById('budget-modal').classList.remove('active');
}

// Hacer funciones globales
window.eliminarGasto = eliminarGasto;

console.log("✅ app.js cargado correctamente (versión sin recargas)");