// ====================
// CONFIGURACIÓN INICIAL
// ====================

// Variables globales - SOLO UNA VEZ
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
        console.log("🔵 Inicializando Firebase...");
        
        // Esperar a que Firebase se cargue
        if (typeof firebase === 'undefined') {
            console.error("Firebase no está cargado");
            mostrarNotificacion("⚠️ Firebase no disponible", "warning");
            return false;
        }
        
        // Verificar autenticación
        try {
            await firebase.auth().signInAnonymously();
            console.log("✅ Autenticado anónimamente");
        } catch (authError) {
            console.warn("No se pudo autenticar:", authError);
        }
        
        // Cargar configuración
        await loadConfigFromFirebase();
        
        // Cargar gastos y escuchar cambios
        setupRealtimeListeners();
        
        mostrarNotificacion("✅ Conectado a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error inicializando Firebase:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
        return false;
    }
}

// Cargar configuración desde Firebase
async function loadConfigFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            config = configDoc.data();
            console.log("✅ Configuración cargada desde Firebase:", config);
        } else {
            // Crear configuración inicial
            await db.collection('config').doc('nuestra_pareja').set(config);
            console.log("✅ Configuración inicial creada en Firebase");
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
    }
}

// Configurar escuchas en tiempo real
// CONFIGURACIÓN DE LISTENERS - VERSIÓN MEJORADA
// ====================

function setupRealtimeListeners() {
    // Detener escuchas anteriores si existen
    if (unsubscribeGastos) unsubscribeGastos();
    if (unsubscribeConfig) unsubscribeConfig();
    
    const db = firebase.firestore();
    
    // Escuchar cambios en gastos
    unsubscribeGastos = db.collection('gastos')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("🔄 Cambios detectados en gastos:", snapshot.docChanges().length);
            
            // 🔥 DETECTAR SI HUBO CAMBIOS DESDE OTRO DISPOSITIVO
            let huboCambiosRemotos = false;
            const cambios = snapshot.docChanges();
            
            cambios.forEach(cambio => {
                console.log(`  ${cambio.type}: ${cambio.doc.id}`);
                
                // Si el documento fue ELIMINADO o MODIFICADO, es muy probable que sea remoto
                if (cambio.type === 'removed' || cambio.type === 'modified') {
                    huboCambiosRemotos = true;
                    console.log("  🔥 Posible cambio remoto detectado");
                }
                
                // Si fue agregado, verificar si es local o remoto
                if (cambio.type === 'added') {
                    const docData = cambio.doc.data();
                    const docId = cambio.doc.id;
                    
                    // Verificar si este documento ya existe localmente
                    const existeLocal = gastos.some(g => g.id === docId);
                    
                    // Si NO existe localmente y tiene timestamp reciente (< 2 segundos), podría ser remoto
                    if (!existeLocal) {
                        const timestamp = docData.timestamp;
                        if (timestamp) {
                            const fechaDoc = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                            const ahora = new Date();
                            const diferencia = ahora - fechaDoc;
                            
                            // Si el documento es más viejo que 2 segundos, probablemente vino de otro dispositivo
                            if (diferencia > 2000) {
                                huboCambiosRemotos = true;
                                console.log("  🔥 Documento remoto detectado (timestamp antiguo)");
                            }
                        }
                    }
                }
            });
            
            // 🔥 LIMPIAR CACHE LOCAL SI HUBO CAMBIOS REMOTOS
            if (huboCambiosRemotos) {
                console.log("🧹 Limpiando caché local por cambios remotos...");
                
                // Vaciar array local COMPLETAMENTE
                gastos = [];
                
                // Opcional: limpiar localStorage
                localStorage.removeItem('nuestros_gastos');
                
                // Recargar página después de 1 segundo para forzar sincronización
                setTimeout(() => {
                    console.log("🔄 Recargando para sincronizar...");
                    location.reload();
                }, 1000);
            }
            
            // RECARGAR TODOS LOS DATOS DESDE FIREBASE (siempre)
            gastos = []; // Vaciar primero
            
            snapshot.forEach(doc => {
                const gastoData = {
                    id: doc.id,
                    ...doc.data()
                };
                
                // Convertir timestamps de Firebase a Date
                if (gastoData.timestamp && gastoData.timestamp.toDate) {
                    gastoData.timestamp = gastoData.timestamp.toDate();
                }
                
                gastos.push(gastoData);
            });
            
            // Ordenar por fecha
            gastos.sort((a, b) => {
                const dateA = a.timestamp || new Date(a.fecha);
                const dateB = b.timestamp || new Date(b.fecha);
                return dateB - dateA;
            });
            
            // Actualizar UI
            actualizarUI();
            
            // Guardar en localStorage (SOLO datos de Firebase)
            saveToLocalStorage();
            
            console.log(`✅ Gastos actualizados: ${gastos.length} items`);
            
        }, (error) => {
            console.error("❌ Error en listener de gastos:", error);
        });
    
    // Escuchar cambios en configuración (mantener igual)
    unsubscribeConfig = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                config = doc.data();
                actualizarUI();
                saveToLocalStorage();
                console.log("🔄 Configuración actualizada desde la nube");
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración:", error);
        });
}

// Guardar gasto en Firebase
async function saveGastoToFirebase(gasto) {
    try {
        const db = firebase.firestore();
        const gastoData = {
            ...gasto,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Eliminar id local si existe
        if (gastoData.id && gastoData.id.toString().startsWith('local_')) {
            delete gastoData.id;
        }
        
        const docRef = await db.collection('gastos').add(gastoData);
        console.log("✅ Gasto guardado en Firebase con ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando en Firebase:", error);
        throw error;
    }
}

// Eliminar gasto de Firebase
async function deleteGastoFromFirebase(id) {
    try {
        await firebase.firestore().collection('gastos').doc(id).delete();
        console.log("✅ Gasto eliminado de Firebase:", id);
    } catch (error) {
        console.error("❌ Error eliminando de Firebase:", error);
        throw error;
    }
}

// Guardar configuración en Firebase
async function saveConfigToFirebase() {
    try {
        // Asegurar que los nombres también se guarden
        const configData = {
            ...config,
            ahorroConfig: window.configAhorro || null, // Referencia a la config de ahorros
            // Los nombres ya están en config.nombres
        };
        
        await firebase.firestore()
            .collection('config')
            .doc('nuestra_pareja')
            .set(configData, { merge: true });
        console.log("✅ Configuración guardada en Firebase");
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
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
    console.log("🚀 Iniciando aplicación...");
    
    // Primero cargar desde localStorage (más rápido)
    loadFromLocalStorage();
    
    // Inicializar app básica
    inicializarApp();
    actualizarUI();
    
    // Luego conectar con Firebase
    setTimeout(async () => {
        await initFirebase();
    }, 1000);
});

function inicializarApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventos();
    
    // Configurar nombres
    actualizarNombresEnUI();
    
    // Configurar fecha por defecto
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-gasto').value = hoy;
    
    // Inicializar gráfico
    inicializarGrafico();
    
    console.log("✅ App inicializada");
}

// ====================
// FUNCIONES PRINCIPALES
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
        id: 'local_' + Date.now(), // ID temporal
        fecha: fecha,
        monto: monto,
        descripcion: descripcion,
        persona: personaSeleccionada,
        categoria: categoriaSeleccionada,
        timestamp: new Date()
    };
    
    // Agregar al array local
    // gastos.unshift(nuevoGasto);  // ← COMENTADA: NO guardar localmente
    
    // Limpiar formulario
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('monto').focus();
    
    // Actualizar UI inmediatamente
    // actualizarUI();  // ← COMENTADA: NO actualizar UI localmente
    
    // Mostrar confirmación
    const nombrePersona = personaSeleccionada === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    mostrarNotificacion(`⏳ Guardando gasto de $${monto.toFixed(2)}...`, 'info');
    
    // Guardar en Firebase (en segundo plano)
    setTimeout(async () => {
        try {
            const firebaseId = await saveGastoToFirebase(nuevoGasto);
            // Actualizar el ID local con el de Firebase
            nuevoGasto.id = firebaseId;
            mostrarNotificacion(`✅ ${nombrePersona} gastó $${monto.toFixed(2)}`, 'success');
        } catch (error) {
            console.error("Error guardando en Firebase, usando solo local:", error);
            mostrarNotificacion(`✅ ${nombrePersona} gastó $${monto.toFixed(2)} (guardado local)`, 'warning');
        }
        saveToLocalStorage();
    }, 500);
}

async function eliminarGasto(id) {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return;
    
    // Mostrar notificación inmediatamente
    mostrarNotificacion('⏳ Eliminando gasto...', 'info');
    
    // NO eliminar localmente - dejar que Firebase lo haga
    // const index = gastos.findIndex(g => g.id === id);
    // if (index === -1) return;
    // gastos.splice(index, 1);  // ← COMENTADA
    
    // NO actualizar UI localmente - Firebase lo hará
    // actualizarUI();  // ← COMENTADA
    
    // Intentar eliminar de Firebase
    try {
        if (id && !id.toString().startsWith('local_')) {
            await deleteGastoFromFirebase(id);
            // La notificación de éxito vendrá del listener de Firebase
        } else {
            // Si es un ID local, eliminar del array local
            const index = gastos.findIndex(g => g.id === id);
            if (index !== -1) {
                gastos.splice(index, 1);
                actualizarUI();
                saveToLocalStorage();
                mostrarNotificacion('Gasto eliminado (local)', 'success');
            }
        }
    } catch (error) {
        console.error("Error eliminando gasto:", error);
        mostrarNotificacion('Error al eliminar el gasto', 'error');
    }
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    config.nombres.persona1 = nombre1;
    config.nombres.persona2 = nombre2;
    
    // Actualizar UI
    actualizarNombresEnUI();
    actualizarUI();
    ocultarModalNombres();
    
    // Guardar en Firebase
    try {
        await saveConfigToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres en Firebase:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    // Guardar localmente
    saveToLocalStorage();
}

async function guardarPresupuesto() {
    const presupuesto = parseFloat(document.getElementById('presupuesto-semanal').value);
    const resetSemanal = document.getElementById('reset-semanal').checked;
    
    if (presupuesto && presupuesto > 0) {
        config.presupuesto = presupuesto;
        config.resetSemanal = resetSemanal;
        
        // Actualizar UI
        actualizarUI();
        ocultarModalPresupuesto();
        
        // Guardar en Firebase
        try {
            await saveConfigToFirebase();
            mostrarNotificacion(`Presupuesto: $${presupuesto.toFixed(2)}`, 'success');
        } catch (error) {
            console.error("Error guardando presupuesto en Firebase:", error);
            mostrarNotificacion('Presupuesto actualizado (local)', 'warning');
        }
        
        // Guardar localmente
        saveToLocalStorage();
    }
}

// ====================
// CONFIGURACIÓN DE EVENTOS
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
    
    // Cerrar modales
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
            ocultarModalPresupuesto();
        }
    });
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUI() {
    actualizarResumen();
    actualizarPresupuesto();
    actualizarGrafico('categorias');
    filtrarGastos();
    actualizarQuickSummary();
    actualizarNombresEnUI();
}

function actualizarNombresEnUI() {
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
    
    // Color según diferencia
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
    
    document.getElementById('budget-amount').textContent = presupuesto.toFixed(2);
    document.getElementById('budget-remaining').textContent = Math.max(presupuesto - totalSemana, 0).toFixed(2);
    document.getElementById('budget-progress').style.width = `${porcentaje}%`;
    
    // Color de la barra
    const progressBar = document.getElementById('budget-progress');
    if (porcentaje < 70) {
        progressBar.style.background = 'var(--gradient-success)';
    } else if (porcentaje < 90) {
        progressBar.style.background = 'var(--gradient-warning)';
    } else {
        progressBar.style.background = 'var(--gradient-primary)';
    }
    
    // Gastos por persona
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('budget-persona1').textContent = `$${gastosPersona1.toFixed(2)}`;
    document.getElementById('budget-persona2').textContent = `$${gastosPersona2.toFixed(2)}`;
}

// ====================
// FILTRADO Y BÚSQUEDA
// ====================

function filtrarGastos() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoria = document.getElementById('filter-category').value;
    const persona = document.getElementById('filter-person').value;
    const rangoFecha = document.getElementById('filter-date').value;
    
    let gastosFiltrados = [...gastos];
    
    // Aplicar filtros
    if (searchTerm) {
        gastosFiltrados = gastosFiltrados.filter(g => 
            g.descripcion.toLowerCase().includes(searchTerm)
        );
    }
    
    if (categoria) {
        gastosFiltrados = gastosFiltrados.filter(g => g.categoria === categoria);
    }
    
    if (persona) {
        gastosFiltrados = gastosFiltrados.filter(g => g.persona === persona);
    }
    
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
        }
        
        if (fechaInicio) {
            gastosFiltrados = gastosFiltrados.filter(g => 
                new Date(g.fecha) >= fechaInicio
            );
        }
    }
    
    // Ordenar por fecha
    gastosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    // Mostrar resultados
    mostrarGastosFiltrados(gastosFiltrados);
    
    // Actualizar totales
    const totalFiltrado = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
    const totalGeneral = gastos.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('total-filtrado').textContent = `$${totalFiltrado.toFixed(2)}`;
    document.getElementById('total-general').textContent = `$${totalGeneral.toFixed(2)}`;
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
                <p>Intenta con otros filtros o términos de búsqueda.</p>
            </div>
        `;
        emptyState.style.display = 'none';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    const iconosCategorias = {
        comida: '🍕',
        transporte: '🚗',
        entretenimiento: '🎬',
        compras: '🛍️',
        otros: '📝'
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
        const fechaFormateada = new Date(gasto.fecha).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        const nombrePersona = gasto.persona === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const iconoCategoria = iconosCategorias[gasto.categoria] || '📝';
        const nombreCategoria = nombresCategorias[gasto.categoria];
        const idSeguro = gasto.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        html += `
            <div class="gasto-item ${gasto.persona}">
                <div class="gasto-header">
                    <div class="gasto-monto">$${gasto.monto.toFixed(2)}</div>
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
                    <div class="gasto-fecha">${fechaFormateada}</div>
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

// ====================
// GRÁFICOS
// ====================

function inicializarGrafico() {
    const ctx = document.getElementById('gastos-chart').getContext('2d');
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#667eea', '#764ba2', '#f56565', '#ed8936', '#38a169'
                ],
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
                    labels: {
                        color: 'var(--text-color)',
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `$${context.parsed.toFixed(2)}`;
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
                const total = gastosSemana
                    .filter(g => g.categoria === cat)
                    .reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
            
        case 'personas':
            labels = [config.nombres.persona1, config.nombres.persona2];
            
            const totalPersona1 = gastosSemana
                .filter(g => g.persona === 'persona1')
                .reduce((sum, g) => sum + g.monto, 0);
            
            const totalPersona2 = gastosSemana
                .filter(g => g.persona === 'persona2')
                .reduce((sum, g) => sum + g.monto, 0);
            
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
                const total = gastos
                    .filter(g => g.fecha === fecha)
                    .reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
    }
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = datos;
    chartInstance.update();
}

// ====================
// ACCIONES
// ====================

function ejecutarAccion(accion) {
    switch(accion) {
        case 'ver-mis-gastos':
            document.getElementById('filter-person').value = 'persona1';
            filtrarGastos();
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
    }
}

// ====================
// MODALES
// ====================

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

// ====================
// EXPORTACIÓN
// ====================

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

// ====================
// UTILIDADES
// ====================

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
    
    if (searchBox.style.display === 'block') {
        document.getElementById('search-input').focus();
    }
}

function limpiarBusqueda() {
    document.getElementById('search-input').value = '';
    filtrarGastos();
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.getElementById('notification');
    
    notificacion.textContent = mensaje;
    notificacion.className = 'notification show';
    
    switch(tipo) {
        case 'success':
            notificacion.style.background = 'var(--success-color)';
            break;
        case 'error':
            notificacion.style.background = 'var(--accent-color)';
            break;
        case 'warning':
            notificacion.style.background = 'var(--warning-color)';
            break;
        default:
            notificacion.style.background = 'var(--primary-color)';
    }
    
    setTimeout(() => {
        notificacion.classList.remove('show');
    }, 3000);
}

function actualizarQuickSummary() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('summary-hoy').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `$${totalSemana.toFixed(2)}`;
    
    // Calcular diferencia
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1')
        .reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2')
        .reduce((sum, g) => sum + g.monto, 0);
    
    const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
    document.getElementById('summary-diferencia').textContent = `$${diferencia.toFixed(2)}`;
}

// ====================
// INICIALIZAR AL CARGAR
// ====================

console.log("🔄 App.js cargado correctamente");