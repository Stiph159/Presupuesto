// ====================
// CONFIGURACIÓN INICIAL
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

// Inicializar Firebase y cargar datos
async function initFirebase() {
    try {
        // Esperar a que Firebase se cargue
        if (typeof firebase === 'undefined') {
            console.error("Firebase no está cargado");
            loadFromLocalStorage();
            return;
        }
        
        // Verificar autenticación
        await firebase.auth().signInAnonymously();
        
        // Cargar configuración
        await loadConfigFromFirebase();
        
        // Cargar gastos y escuchar cambios
        setupRealtimeListeners();
        
        mostrarNotificacion("✅ Conectado a la nube", "success");
    } catch (error) {
        console.error("Error inicializando Firebase:", error);
        loadFromLocalStorage();
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
    }
}

// Cargar configuración desde Firebase
async function loadConfigFromFirebase() {
    try {
        const configDoc = await firebase.firestore()
            .collection('config')
            .doc('nuestra_pareja')
            .get();
        
        if (configDoc.exists) {
            config = configDoc.data();
            console.log("Configuración cargada:", config);
        } else {
            // Crear configuración inicial
            await firebase.firestore()
                .collection('config')
                .doc('nuestra_pareja')
                .set(config);
            console.log("Configuración inicial creada");
        }
    } catch (error) {
        console.error("Error cargando configuración:", error);
    }
}

// Configurar escuchas en tiempo real
function setupRealtimeListeners() {
    // Detener escuchas anteriores si existen
    if (unsubscribeGastos) unsubscribeGastos();
    if (unsubscribeConfig) unsubscribeConfig();
    
    // Escuchar cambios en gastos
    unsubscribeGastos = firebase.firestore()
        .collection('gastos')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            const changes = snapshot.docChanges();
            
            changes.forEach((change) => {
                const gastoData = {
                    id: change.doc.id,
                    ...change.doc.data()
                };
                
                // Convertir timestamps de Firebase a Date
                if (gastoData.timestamp && gastoData.timestamp.toDate) {
                    gastoData.timestamp = gastoData.timestamp.toDate();
                }
                
                if (change.type === 'added') {
                    // Evitar duplicados
                    if (!gastos.find(g => g.id === gastoData.id)) {
                        gastos.push(gastoData);
                    }
                } else if (change.type === 'modified') {
                    const index = gastos.findIndex(g => g.id === gastoData.id);
                    if (index !== -1) {
                        gastos[index] = gastoData;
                    }
                } else if (change.type === 'removed') {
                    gastos = gastos.filter(g => g.id !== gastoData.id);
                }
            });
            
            // Ordenar por fecha
            gastos.sort((a, b) => {
                const dateA = a.timestamp || new Date(a.fecha);
                const dateB = b.timestamp || new Date(b.fecha);
                return dateB - dateA;
            });
            
            // Actualizar UI
            actualizarUI();
            
            // Guardar backup local
            saveToLocalStorage();
        });
    
    // Escuchar cambios en configuración
    unsubscribeConfig = firebase.firestore()
        .collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                config = doc.data();
                actualizarUI();
                saveToLocalStorage();
            }
        });
}

// Guardar gasto en Firebase
async function saveGastoToFirebase(gasto) {
    try {
        const gastoData = {
            ...gasto,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Eliminar id temporal si existe
        delete gastoData.id;
        
        const docRef = await firebase.firestore()
            .collection('gastos')
            .add(gastoData);
        
        return docRef.id;
    } catch (error) {
        console.error("Error guardando en Firebase:", error);
        throw error;
    }
}

// Eliminar gasto de Firebase
async function deleteGastoFromFirebase(id) {
    try {
        await firebase.firestore()
            .collection('gastos')
            .doc(id)
            .delete();
        console.log("Gasto eliminado de Firebase");
    } catch (error) {
        console.error("Error eliminando de Firebase:", error);
        throw error;
    }
}

// Guardar configuración en Firebase
async function saveConfigToFirebase() {
    try {
        await firebase.firestore()
            .collection('config')
            .doc('nuestra_pareja')
            .set(config, { merge: true });
        console.log("Configuración guardada en Firebase");
    } catch (error) {
        console.error("Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// FUNCIONES LOCALSTORAGE (BACKUP)
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
        
        if (savedGastos) {
            gastos = JSON.parse(savedGastos);
            // Convertir fechas de string a Date
            gastos.forEach(gasto => {
                if (typeof gasto.timestamp === 'string') {
                    gasto.timestamp = new Date(gasto.timestamp);
                }
            });
        }
        
        if (savedConfig) {
            config = JSON.parse(savedConfig);
        }
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    // Primero cargar desde localStorage (más rápido)
    loadFromLocalStorage();
    
    // Inicializar app básica
    inicializarApp();
    cargarGastos();
    actualizarUI();
    
    // Luego conectar con Firebase
    await initFirebase();
});

function inicializarApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventos();
    
    // Configurar nombres
    document.getElementById('name-persona1').textContent = config.nombres.persona1;
    document.getElementById('name-persona2').textContent = config.nombres.persona2;
    
    // Configurar fecha por defecto
    document.getElementById('fecha-gasto').value = new Date().toISOString().split('T')[0];
    
    // Inicializar gráfico
    inicializarGrafico();
}

// ====================
// FUNCIONES PRINCIPALES (MODIFICADAS)
// ====================

async function agregarGasto() {
    const monto = parseFloat(document.getElementById('monto').value);
    const descripcion = document.getElementById('descripcion').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    
    // Validaciones
    if (!monto || monto <= 0) {
        mostrarNotificacion('Por favor ingresa un monto válido', 'error');
        document.getElementById('monto').focus();
        return;
    }
    
    if (!descripcion) {
        mostrarNotificacion('Por favor ingresa una descripción', 'error');
        document.getElementById('descripcion').focus();
        return;
    }
    
    // Crear objeto de gasto
    const nuevoGasto = {
        fecha: fecha,
        monto: monto,
        descripcion: descripcion,
        persona: personaSeleccionada,
        categoria: categoriaSeleccionada,
        timestamp: new Date()
    };
    
    // Agregar al array local temporalmente
    gastos.unshift(nuevoGasto);
    
    // Limpiar formulario inmediatamente (mejor experiencia de usuario)
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('descripcion').placeholder = '¿En qué gastamos?';
    document.getElementById('monto').focus();
    
    // Actualizar UI temporal
    actualizarUI();
    
    // Mostrar confirmación inmediata
    const nombrePersona = personaSeleccionada === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    mostrarNotificacion(`⏳ Guardando gasto de $${monto.toFixed(2)}...`, 'info');
    
    // Guardar en Firebase (en segundo plano)
    try {
        const id = await saveGastoToFirebase(nuevoGasto);
        nuevoGasto.id = id;
        mostrarNotificacion(`✅ ${nombrePersona} gastó $${monto.toFixed(2)} en ${descripcion}`, 'success');
    } catch (error) {
        console.error("Error guardando en Firebase:", error);
        // Asignar ID temporal
        nuevoGasto.id = 'local_' + Date.now();
        mostrarNotificacion(`✅ ${nombrePersona} gastó $${monto.toFixed(2)} (guardado localmente)`, 'warning');
        saveToLocalStorage();
    }
}

async function eliminarGasto(id) {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return;
    
    // Eliminar localmente primero
    const gastoEliminado = gastos.find(g => g.id === id);
    gastos = gastos.filter(gasto => gasto.id !== id);
    
    // Actualizar UI inmediatamente
    actualizarUI();
    
    // Intentar eliminar de Firebase
    try {
        if (id && !id.startsWith('local_')) {
            await deleteGastoFromFirebase(id);
        }
        mostrarNotificacion('Gasto eliminado correctamente', 'success');
    } catch (error) {
        console.error("Error eliminando de Firebase:", error);
        mostrarNotificacion('Gasto eliminado (solo local)', 'warning');
    }
    
    // Guardar backup local
    saveToLocalStorage();
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    config.nombres.persona1 = nombre1;
    config.nombres.persona2 = nombre2;
    
    // Actualizar UI inmediatamente
    actualizarUI();
    ocultarModalNombres();
    
    // Guardar en Firebase
    try {
        await saveConfigToFirebase();
        mostrarNotificacion('Nombres actualizados correctamente', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (solo local)', 'warning');
    }
    
    // Guardar backup local
    saveToLocalStorage();
}

async function guardarPresupuesto() {
    const presupuesto = parseFloat(document.getElementById('presupuesto-semanal').value);
    const resetSemanal = document.getElementById('reset-semanal').checked;
    
    if (presupuesto && presupuesto > 0) {
        config.presupuesto = presupuesto;
        config.resetSemanal = resetSemanal;
        
        // Actualizar UI inmediatamente
        actualizarUI();
        ocultarModalPresupuesto();
        
        // Guardar en Firebase
        try {
            await saveConfigToFirebase();
            mostrarNotificacion(`Presupuesto actualizado a $${presupuesto.toFixed(2)}`, 'success');
        } catch (error) {
            console.error("Error guardando presupuesto:", error);
            mostrarNotificacion('Presupuesto actualizado (solo local)', 'warning');
        }
        
        // Guardar backup local
        saveToLocalStorage();
    }
}

// ====================
// EL RESTO DEL CÓDIGO SE MANTIENE IGUAL
// ====================

function configurarEventos() {
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Selector de persona
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
        });
    });
    
    // Categorías rápidas
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categoriaSeleccionada = this.dataset.category;
            
            // Sugerir descripción basada en categoría
            const sugerencias = {
                comida: 'Supermercado, restaurante, delivery...',
                transporte: 'Uber, gasolina, metro, bus...',
                entretenimiento: 'Cine, concierto, parque...',
                compras: 'Ropa, electrónica, regalos...',
                otros: 'Otros gastos...'
            };
            
            document.getElementById('descripcion').placeholder = sugerencias[categoriaSeleccionada];
        });
    });
    
    // Botón agregar gasto
    document.getElementById('add-btn').addEventListener('click', agregarGasto);
    
    // Enter en descripción también agrega
    document.getElementById('descripcion').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarGasto();
    });
    
    // Botones de acción
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            ejecutarAccion(accion);
        });
    });
    
    // Botones de gráficos
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGrafico(this.dataset.chart);
        });
    });
    
    // Botón editar nombres
    document.getElementById('edit-names').addEventListener('click', mostrarModalNombres);
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', ocultarModalNombres);
    
    // Botón editar presupuesto
    document.getElementById('edit-budget').addEventListener('click', mostrarModalPresupuesto);
    document.getElementById('save-budget').addEventListener('click', guardarPresupuesto);
    document.getElementById('cancel-budget').addEventListener('click', ocultarModalPresupuesto);
    
    // Exportar datos
    document.getElementById('export-btn').addEventListener('click', exportarDatos);
    
    // Búsqueda
    document.getElementById('search-toggle').addEventListener('click', toggleBusqueda);
    document.getElementById('search-clear').addEventListener('click', limpiarBusqueda);
    document.getElementById('search-input').addEventListener('input', filtrarGastos);
    
    // Filtros
    document.getElementById('filter-category').addEventListener('change', filtrarGastos);
    document.getElementById('filter-person').addEventListener('change', filtrarGastos);
    document.getElementById('filter-date').addEventListener('change', filtrarGastos);
    document.getElementById('clear-filters').addEventListener('click', limpiarFiltros);
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
            ocultarModalPresupuesto();
        }
    });
}

// ====================
// FUNCIONES DE UI (SE MANTIENEN IGUAL)
// ====================

function actualizarUI() {
    actualizarResumen();
    actualizarPresupuesto();
    actualizarGrafico('categorias');
    filtrarGastos();
    actualizarQuickSummary();
    
    // Actualizar nombres en la interfaz
    document.getElementById('name-persona1').textContent = config.nombres.persona1;
    document.getElementById('name-persona2').textContent = config.nombres.persona2;
}

function actualizarResumen() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('summary-hoy').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `$${totalSemana.toFixed(2)}`;
    
    // Calcular diferencia
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
    
    document.getElementById('summary-diferencia').textContent = `$${diferencia.toFixed(2)}`;
    
    // Actualizar colores según diferencia
    const diferenciaElement = document.getElementById('summary-diferencia');
    if (diferencia === 0) {
        diferenciaElement.style.color = 'var(--success-color)';
    } else if (diferencia > 500) {
        diferenciaElement.style.color = 'var(--accent-color)';
    } else {
        diferenciaElement.style.color = 'var(--warning-color)';
    }
}

function actualizarPresupuesto() {
    const inicioSemana = obtenerInicioSemana();
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    const presupuesto = config.presupuesto;
    const porcentaje = Math.min((totalSemana / presupuesto) * 100, 100);
    
    // Actualizar elementos
    document.getElementById('budget-amount').textContent = presupuesto.toFixed(2);
    document.getElementById('budget-remaining').textContent = Math.max(presupuesto - totalSemana, 0).toFixed(2);
    document.getElementById('budget-progress').style.width = `${porcentaje}%`;
    
    // Actualizar colores de la barra
    const progressBar = document.getElementById('budget-progress');
    if (porcentaje < 70) {
        progressBar.style.background = 'var(--gradient-success)';
    } else if (porcentaje < 90) {
        progressBar.style.background = 'var(--gradient-warning)';
    } else {
        progressBar.style.background = 'var(--gradient-primary)';
    }
    
    // Actualizar gastos por persona
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('budget-persona1').textContent = `$${gastosPersona1.toFixed(2)}`;
    document.getElementById('budget-persona2').textContent = `$${gastosPersona2.toFixed(2)}`;
}

function cargarGastos() {
    const container = document.getElementById('gastos-container');
    const emptyState = document.getElementById('empty-state');
    const totales = document.getElementById('totales');
    
    if (gastos.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
}

// ... EL RESTO DE LAS FUNCIONES SE MANTIENEN IGUAL ...
// (filtrarGastos, mostrarGastosFiltrados, inicializarGrafico, etc.)