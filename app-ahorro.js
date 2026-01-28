// ====================
// CONFIGURACIÓN INICIAL - VERSIÓN CON FIREBASE
// ====================

// Variables globales para ahorro
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

// Tips de ahorro
const tipsAhorro = [
    "Cada moneda cuenta. Pequeños ahorros diarios se convierten en grandes sumas con el tiempo.",
    "Antes de comprar algo, pregúntate: ¿Realmente lo necesito o solo lo quiero?",
    "El ahorro no es un sacrificio, es una inversión en tu futuro tranquilo."
];

// ====================
// FUNCIONES FIREBASE PARA AHORROS
// ====================

async function initFirebaseAhorro() {
    try {
        console.log("💰 Inicializando Firebase para ahorros...");
        
        // Cargar configuración
        await loadConfigAhorroFromFirebase();
        
        // Cargar ahorros y escuchar cambios
        setupRealtimeListenersAhorro();
        
        mostrarNotificacion("✅ Ahorros conectados a la nube", "success");
        return true;
    } catch (error) {
        console.error("❌ Error inicializando Firebase para ahorros:", error);
        mostrarNotificacion("⚠️ Usando datos locales para ahorros", "warning");
        return false;
    }
}

async function loadConfigAhorroFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            const configData = configDoc.data();
            if (configData.ahorroConfig) {
                configAhorro = configData.ahorroConfig;
            }
            if (configData.nombres) {
                configAhorro.nombres = configData.nombres;
            }
            console.log("✅ Configuración de ahorros cargada desde Firebase:", configAhorro);
        }
    } catch (error) {
        console.error("❌ Error cargando configuración de ahorros:", error);
        // Cargar desde localStorage como fallback
        const savedConfig = localStorage.getItem('ahorro_config');
        if (savedConfig) {
            configAhorro = JSON.parse(savedConfig);
        }
    }
}

function setupRealtimeListenersAhorro() {
    // Detener escuchas anteriores si existen
    if (unsubscribeAhorros) unsubscribeAhorros();
    if (unsubscribeConfigAhorro) unsubscribeConfigAhorro();
    
    const db = firebase.firestore();
    
    // Escuchar cambios en ahorros
    unsubscribeAhorros = db.collection('ahorros')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("💰 Cambios detectados en ahorros:", snapshot.docChanges().length);
            
            // 🔥 DETECTAR CAMBIOS REMOTOS
            let huboCambiosRemotos = false;
            const cambios = snapshot.docChanges();
            
            cambios.forEach(cambio => {
                console.log(`  ${cambio.type}: ${cambio.doc.id}`);
                
                if (cambio.type === 'removed' || cambio.type === 'modified') {
                    huboCambiosRemotos = true;
                }
            });
            
            // 🔥 LIMPIAR SI HAY CAMBIOS REMOTOS
            if (huboCambiosRemotos) {
                console.log("🧹 Limpiando caché de ahorros por cambios remotos...");
                ahorros = [];
                localStorage.removeItem('nuestros_ahorros');
                
                setTimeout(() => {
                    location.reload();
                }, 1000);
            }
            
            // Recargar desde Firebase
            ahorros = [];
            
            snapshot.forEach(doc => {
                const ahorroData = {
                    id: doc.id,
                    ...doc.data()
                };
                
                if (ahorroData.timestamp && ahorroData.timestamp.toDate) {
                    ahorroData.timestamp = ahorroData.timestamp.toDate();
                }
                
                ahorros.push(ahorroData);
            });
            
            // Ordenar
            ahorros.sort((a, b) => {
                const dateA = a.timestamp || new Date(a.fecha);
                const dateB = b.timestamp || new Date(b.fecha);
                return dateB - dateA;
            });
            
            // Actualizar UI
            actualizarUIAhorro();
            
            // Guardar localmente
            saveAhorrosToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener de ahorros:", error);
        });
    
    // Configuración (mantener igual)
    unsubscribeConfigAhorro = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const configData = doc.data();
                if (configData.ahorroConfig) {
                    configAhorro = configData.ahorroConfig;
                }
                if (configData.nombres) {
                    configAhorro.nombres = configData.nombres;
                    actualizarNombresEnUIAhorro();
                }
                actualizarUIAhorro();
                saveAhorrosToLocalStorage();
            }
        }, (error) => {
            console.error("❌ Error en listener de configuración de ahorros:", error);
        });
}

async function saveAhorroToFirebase(ahorro) {
    try {
        const db = firebase.firestore();
        const ahorroData = {
            ...ahorro,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Eliminar id local si existe
        if (ahorroData.id && ahorroData.id.toString().startsWith('local_')) {
            delete ahorroData.id;
        }
        
        const docRef = await db.collection('ahorros').add(ahorroData);
        console.log("✅ Ahorro guardado en Firebase con ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando ahorro en Firebase:", error);
        throw error;
    }
}

async function deleteAhorroFromFirebase(id) {
    try {
        await firebase.firestore().collection('ahorros').doc(id).delete();
        console.log("✅ Ahorro eliminado de Firebase:", id);
    } catch (error) {
        console.error("❌ Error eliminando ahorro de Firebase:", error);
        throw error;
    }
}

async function saveConfigAhorroToFirebase() {
    try {
        const db = firebase.firestore();
        const configDocRef = db.collection('config').doc('nuestra_pareja');
        
        // Primero obtener el documento actual
        const configDoc = await configDocRef.get();
        let configData = {};
        
        if (configDoc.exists) {
            configData = configDoc.data();
        }
        
        // Actualizar solo la configuración de ahorros
        configData.ahorroConfig = configAhorro;
        configData.nombres = configAhorro.nombres; // Mantener nombres sincronizados
        
        await configDocRef.set(configData, { merge: true });
        console.log("✅ Configuración de ahorros guardada en Firebase");
    } catch (error) {
        console.error("❌ Error guardando configuración de ahorros:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE (BACKUP)
// ====================

function saveAhorrosToLocalStorage() {
    try {
        localStorage.setItem('nuestros_ahorros', JSON.stringify(ahorros));
        localStorage.setItem('ahorro_config', JSON.stringify(configAhorro));
    } catch (error) {
        console.error("Error guardando ahorros en localStorage:", error);
    }
}

function loadAhorrosFromLocalStorage() {
    try {
        const savedAhorros = localStorage.getItem('nuestros_ahorros');
        const savedConfig = localStorage.getItem('ahorro_config');
        
        if (savedAhorros) {
            ahorros = JSON.parse(savedAhorros);
        }
        
        if (savedConfig) {
            configAhorro = JSON.parse(savedConfig);
        }
    } catch (error) {
        console.error("Error cargando ahorros de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("💰 Iniciando app de ahorros...");
    
    // Primero cargar desde localStorage (más rápido)
    loadAhorrosFromLocalStorage();
    
    // Inicializar app básica
    inicializarAhorroApp();
    actualizarUIAhorro();
    
    // Luego conectar con Firebase
    setTimeout(async () => {
        await initFirebaseAhorro();
    }, 1000);
});

function inicializarAhorroApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventosAhorro();
    
    // Configurar nombres
    actualizarNombresEnUIAhorro();
    
    // Configurar fecha por defecto
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-ahorro').value = hoy;
    
    // Configurar montos de opciones
    document.getElementById('monto-opcion1').textContent = configAhorro.montosOpciones.opcion1.toFixed(2);
    document.getElementById('monto-opcion2').textContent = configAhorro.montosOpciones.opcion2.toFixed(2);
    document.getElementById('monto-opcion3').textContent = configAhorro.montosOpciones.opcion3.toFixed(2);
    
    // Configurar metas
    document.getElementById('meta-mensual').textContent = `$${configAhorro.metaMensual}`;
    document.getElementById('meta-anual').textContent = `$${configAhorro.metaAnual}`;
    
    // Inicializar gráfico
    inicializarGraficoAhorro();
    
    // Mostrar un tip aleatorio
    mostrarTipAleatorio();
    
    console.log("✅ App ahorros inicializada");
}

function actualizarNombresEnUIAhorro() {
    document.getElementById('name-persona1').textContent = configAhorro.nombres.persona1;
    document.getElementById('name-persona2').textContent = configAhorro.nombres.persona2;
}

// ====================
// FUNCIONES PRINCIPALES (CON FIREBASE)
// ====================

async function agregarAhorro() {
    console.log("➕ Intentando agregar ahorro...");
    
    if (!opcionSeleccionada) {
        mostrarNotificacion('Por favor selecciona una opción de ahorro', 'error');
        console.error("❌ No hay opción seleccionada");
        return;
    }
    
    const descripcion = document.getElementById('descripcion-ahorro').value.trim();
    const fecha = document.getElementById('fecha-ahorro').value;
    
    // Obtener monto según opción
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
    
    console.log("📊 Datos del ahorro:", { monto, descripcion, fecha, persona: personaSeleccionada, opcion: opcionSeleccionada });
    
    // Crear objeto de ahorro
    const nuevoAhorro = {
        id: 'local_' + Date.now(), // ID temporal
        fecha: fecha,
        monto: monto,
        descripcion: descripcion || nombreOpcion,
        persona: personaSeleccionada,
        opcion: opcionSeleccionada,
        timestamp: new Date()
    };
    
    // Agregar al array local
    //ahorros.unshift(nuevoAhorro);     LOCAL ELIMINADO POR STIPH, PARA QUE NO SE DUPLIQUE
    
     // Limpiar formulario
    document.getElementById('descripcion-ahorro').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    opcionSeleccionada = null;
    habilitarBotonAgregar();
    
    // Actualizar UI inmediatamente
    //actualizarUIAhorro();             LOCAL ELIMINADO POR STIPH, PARA QUE NO SE DUPLIQUE
    
    // Mostrar confirmación
    const nombrePersona = personaSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    mostrarNotificacion(`⏳ Guardando ahorro de $${monto.toFixed(2)}...`, 'info');
    
    // Guardar en Firebase (en segundo plano)
    setTimeout(async () => {
        try {
            const firebaseId = await saveAhorroToFirebase(nuevoAhorro);
            // Actualizar el ID local con el de Firebase
            nuevoAhorro.id = firebaseId;
            mostrarNotificacion(`✅ ${nombrePersona} ahorró $${monto.toFixed(2)}`, 'success');
        } catch (error) {
            console.error("Error guardando en Firebase, usando solo local:", error);
            mostrarNotificacion(`✅ ${nombrePersona} ahorró $${monto.toFixed(2)} (guardado local)`, 'warning');
        }
        saveAhorrosToLocalStorage();
    }, 500);
}

async function eliminarAhorro(id) {
    if (!confirm('¿Estás seguro de eliminar este ahorro?')) return;
    
    // Mostrar notificación inmediatamente
    mostrarNotificacion('⏳ Eliminando ahorro...', 'info');
    
    // Intentar eliminar de Firebase
    try {
        if (id && !id.toString().startsWith('local_')) {
            await deleteAhorroFromFirebase(id);
            // La notificación de éxito vendrá del listener de Firebase
        } else {
            // Si es un ID local, eliminar del array local
            const index = ahorros.findIndex(a => a.id === id);
            if (index !== -1) {
                ahorros.splice(index, 1);
                actualizarUIAhorro();
                saveAhorrosToLocalStorage();
                mostrarNotificacion('Ahorro eliminado (local)', 'success');
            }
        }
    } catch (error) {
        console.error("Error eliminando ahorro:", error);
        mostrarNotificacion('Error al eliminar el ahorro', 'error');
    }
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configAhorro.nombres.persona1 = nombre1;
    configAhorro.nombres.persona2 = nombre2;
    
    // Actualizar UI
    actualizarNombresEnUIAhorro();
    actualizarUIAhorro();
    ocultarModal('names-modal');
    
    // Guardar en Firebase
    try {
        await saveConfigAhorroToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres en Firebase:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    // Guardar localmente
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
        
        // Actualizar UI
        document.getElementById('meta-mensual').textContent = `$${metaMensual}`;
        document.getElementById('meta-anual').textContent = `$${metaAnual}`;
        actualizarUIAhorro();
        ocultarModal('meta-modal');
        
        // Guardar en Firebase
        try {
            await saveConfigAhorroToFirebase();
            mostrarNotificacion('Metas actualizadas', 'success');
        } catch (error) {
            console.error("Error guardando metas en Firebase:", error);
            mostrarNotificacion('Metas actualizadas (local)', 'warning');
        }
        
        // Guardar localmente
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
        
        // Actualizar UI
        document.getElementById('monto-opcion1').textContent = monto1.toFixed(2);
        document.getElementById('monto-opcion2').textContent = monto2.toFixed(2);
        document.getElementById('monto-opcion3').textContent = monto3.toFixed(2);
        ocultarModal('montos-modal');
        
        // Guardar en Firebase
        try {
            await saveConfigAhorroToFirebase();
            mostrarNotificacion('Montos actualizados', 'success');
        } catch (error) {
            console.error("Error guardando montos en Firebase:", error);
            mostrarNotificacion('Montos actualizados (local)', 'warning');
        }
        
        // Guardar localmente
        saveAhorrosToLocalStorage();
    }
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosAhorro() {
    console.log("⚙️ Configurando eventos de ahorros...");
    
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
    
    // Selector de persona
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            console.log("👤 Persona seleccionada:", this.dataset.person);
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
            habilitarBotonAgregar();
        });
    });
    
    // Selección de opciones
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('click', function() {
            console.log("🎯 Opción clickeada:", this.dataset.opcion);
            
            // Deseleccionar todas
            document.querySelectorAll('.opcion-card').forEach(c => {
                c.classList.remove('selected');
                console.log("❌ Deseleccionada:", c.dataset.opcion);
            });
            
            // Seleccionar esta
            this.classList.add('selected');
            opcionSeleccionada = this.dataset.opcion;
            console.log("✅ Seleccionada:", opcionSeleccionada);
            
            // Mostrar información de opción seleccionada
            const opcionInfo = document.getElementById('opcion-seleccionada-info');
            const texto = document.getElementById('opcion-seleccionada-texto');
            const monto = document.getElementById('opcion-seleccionada-monto');
            
            if (opcionInfo && texto && monto) {
                let nombreOpcion = '';
                let montoOpcion = 0;
                
                switch(opcionSeleccionada) {
                    case '1':
                        nombreOpcion = 'Opción 1 (Pequeño)';
                        montoOpcion = configAhorro.montosOpciones.opcion1;
                        break;
                    case '2':
                        nombreOpcion = 'Opción 2 (Medio)';
                        montoOpcion = configAhorro.montosOpciones.opcion2;
                        break;
                    case '3':
                        nombreOpcion = 'Opción 3 (Grande)';
                        montoOpcion = configAhorro.montosOpciones.opcion3;
                        break;
                }
                
                texto.textContent = nombreOpcion;
                monto.textContent = `$${montoOpcion.toFixed(2)}`;
                opcionInfo.style.display = 'block';
                console.log("📝 Mostrando info:", nombreOpcion, montoOpcion);
            }
            
            habilitarBotonAgregar();
        });
    });
    
    // Botón agregar ahorro
    const addBtn = document.getElementById('add-ahorro-btn');
    if (addBtn) {
        addBtn.addEventListener('click', agregarAhorro);
    }
    
    // Enter en descripción también agrega
    const descInput = document.getElementById('descripcion-ahorro');
    if (descInput) {
        descInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const addBtn = document.getElementById('add-ahorro-btn');
                if (addBtn && !addBtn.disabled) {
                    agregarAhorro();
                }
            }
        });
    }
    
    // Botón refresh tip
    const refreshTipBtn = document.getElementById('refresh-tip');
    if (refreshTipBtn) {
        refreshTipBtn.addEventListener('click', mostrarTipAleatorio);
    }
    
    // Botón editar nombres
    const editNamesBtn = document.getElementById('edit-names');
    if (editNamesBtn) {
        editNamesBtn.addEventListener('click', function() {
            document.getElementById('nombre-persona1').value = configAhorro.nombres.persona1;
            document.getElementById('nombre-persona2').value = configAhorro.nombres.persona2;
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
    
    // Botón editar metas
    const editMetaBtn = document.getElementById('edit-meta');
    if (editMetaBtn) {
        editMetaBtn.addEventListener('click', function() {
            document.getElementById('meta-mensual-input').value = configAhorro.metaMensual;
            document.getElementById('meta-anual-input').value = configAhorro.metaAnual;
            document.getElementById('reset-mensual').checked = configAhorro.resetMensual;
            mostrarModal('meta-modal');
        });
    }
    
    const saveMetaBtn = document.getElementById('save-meta');
    if (saveMetaBtn) {
        saveMetaBtn.addEventListener('click', guardarMetas);
    }
    
    const cancelMetaBtn = document.getElementById('cancel-meta');
    if (cancelMetaBtn) {
        cancelMetaBtn.addEventListener('click', function() {
            ocultarModal('meta-modal');
        });
    }
    
    // Botón editar montos
    const saveMontosBtn = document.getElementById('save-montos');
    if (saveMontosBtn) {
        saveMontosBtn.addEventListener('click', guardarMontos);
    }
    
    const cancelMontosBtn = document.getElementById('cancel-montos');
    if (cancelMontosBtn) {
        cancelMontosBtn.addEventListener('click', function() {
            ocultarModal('montos-modal');
        });
    }
    
    console.log("✅ Eventos de ahorros configurados");
}

function habilitarBotonAgregar() {
    const boton = document.getElementById('add-ahorro-btn');
    if (!boton) {
        console.error("❌ No se encontró el botón add-ahorro-btn");
        return;
    }
    
    const estaHabilitado = !!(opcionSeleccionada && personaSeleccionada);
    console.log("🔘 Habilitar botón:", {
        opcion: opcionSeleccionada,
        persona: personaSeleccionada,
        habilitado: estaHabilitado
    });
    
    boton.disabled = !estaHabilitado;
    
    if (!boton.disabled) {
        boton.style.opacity = '1';
        boton.style.cursor = 'pointer';
        console.log("✅ Botón HABILITADO");
    } else {
        boton.style.opacity = '0.7';
        boton.style.cursor = 'not-allowed';
        console.log("❌ Botón DESHABILITADO");
    }
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUIAhorro() {
    console.log("🔄 Actualizando UI de ahorros...");
    actualizarResumenAhorro();
    actualizarMetas();
    actualizarEstadisticas();
    actualizarGraficoAhorro('opciones');
    mostrarAhorros();
    actualizarQuickSummaryAhorro();
}

function actualizarResumenAhorro() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const ahorrosHoy = ahorros.filter(a => a.fecha === hoy);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const totalHoy = ahorrosHoy.reduce((sum, a) => sum + a.monto, 0);
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    
    const hoyElement = document.getElementById('summary-hoy-ahorro');
    const mesElement = document.getElementById('summary-mes-ahorro');
    const porcentajeElement = document.getElementById('summary-porcentaje-meta');
    
    if (hoyElement) hoyElement.textContent = `$${totalHoy.toFixed(2)}`;
    if (mesElement) mesElement.textContent = `$${totalMes.toFixed(2)}`;
    
    if (porcentajeElement) {
        const porcentajeMeta = (totalMes / configAhorro.metaMensual) * 100;
        porcentajeElement.textContent = `${Math.min(porcentajeMeta, 100).toFixed(1)}%`;
        
        // Color según porcentaje
        if (porcentajeMeta >= 100) {
            porcentajeElement.style.color = 'var(--success-color)';
        } else if (porcentajeMeta >= 70) {
            porcentajeElement.style.color = 'var(--warning-color)';
        } else {
            porcentajeElement.style.color = 'var(--accent-color)';
        }
    }
}

function actualizarMetas() {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const inicioAnio = new Date(new Date().getFullYear(), 0, 1);
    
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    const ahorrosAnio = ahorros.filter(a => new Date(a.fecha) >= inicioAnio);
    
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    const totalAnio = ahorrosAnio.reduce((sum, a) => sum + a.monto, 0);
    
    // Actualizar montos
    const ahorradoMensual = document.getElementById('ahorrado-mensual');
    const restanteMensual = document.getElementById('restante-mensual');
    const ahorradoAnual = document.getElementById('ahorrado-anual');
    const restanteAnual = document.getElementById('restante-anual');
    const progressMensual = document.getElementById('progress-mensual');
    const progressAnual = document.getElementById('progress-anual');
    
    if (ahorradoMensual) ahorradoMensual.textContent = `$${totalMes.toFixed(2)}`;
    if (restanteMensual) restanteMensual.textContent = `$${Math.max(configAhorro.metaMensual - totalMes, 0).toFixed(2)}`;
    if (ahorradoAnual) ahorradoAnual.textContent = `$${totalAnio.toFixed(2)}`;
    if (restanteAnual) restanteAnual.textContent = `$${Math.max(configAhorro.metaAnual - totalAnio, 0).toFixed(2)}`;
    
    if (progressMensual && progressAnual) {
        const porcentajeMensual = Math.min((totalMes / configAhorro.metaMensual) * 100, 100);
        const porcentajeAnual = Math.min((totalAnio / configAhorro.metaAnual) * 100, 100);
        
        progressMensual.style.width = `${porcentajeMensual}%`;
        progressAnual.style.width = `${porcentajeAnual}%`;
        
        // Colores de las barras
        if (porcentajeMensual >= 100) {
            progressMensual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
        } else if (porcentajeMensual >= 70) {
            progressMensual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
        } else {
            progressMensual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
        
        if (porcentajeAnual >= 100) {
            progressAnual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
        } else if (porcentajeAnual >= 70) {
            progressAnual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
        } else {
            progressAnual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        }
    }
}

function mostrarAhorros() {
    const container = document.getElementById('ahorros-container');
    const emptyState = document.getElementById('empty-state-ahorro');
    const totales = document.getElementById('totales-ahorro');
    
    if (!container || !emptyState || !totales) {
        console.error("❌ Elementos del DOM no encontrados");
        return;
    }
    
    if (ahorros.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    let html = '';
    
    ahorros.forEach(ahorro => {
        const fechaFormateada = new Date(ahorro.fecha).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
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
        
        html += `
            <div class="ahorro-item ${ahorro.persona}">
                <div class="gasto-header">
                    <div class="ahorro-monto">$${ahorro.monto.toFixed(2)}</div>
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

// ====================
// GRÁFICOS
// ====================

function inicializarGraficoAhorro() {
    const ctx = document.getElementById('ahorro-chart');
    if (!ctx) {
        console.error("❌ No se encontró el canvas ahorro-chart");
        return;
    }
    
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
                    labels: {
                        color: 'var(--text-color)',
                        padding: 20
                    }
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

// ====================
// UTILIDADES
// ====================

function toggleTema() {
    const temaActual = document.documentElement.getAttribute('data-theme');
    const nuevoTema = temaActual === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('tema', nuevoTema);
    actualizarIconoTema(nuevoTema);
    
    mostrarNotificacion(`Modo ${nuevoTema === 'dark' ? 'oscuro' : 'claro'} activado`, 'info');
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

function mostrarTipAleatorio() {
    const tipText = document.getElementById('tip-text');
    if (tipText && tipsAhorro.length > 0) {
        const randomIndex = Math.floor(Math.random() * tipsAhorro.length);
        tipText.textContent = `"${tipsAhorro[randomIndex]}"`;
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
        case 'warning':
            notificacion.style.background = 'var(--warning-color)';
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

function actualizarEstadisticas() {
    // Implementación básica - puedes expandir esto
    const rachaElement = document.getElementById('racha-dias');
    const promedioElement = document.getElementById('promedio-diario');
    const proyeccionElement = document.getElementById('proyeccion-6meses');
    const diferenciaElement = document.getElementById('diferencia-ahorro');
    
    if (rachaElement) rachaElement.textContent = '0 días';
    if (promedioElement) promedioElement.textContent = '$0.00';
    if (proyeccionElement) proyeccionElement.textContent = '$0.00';
    if (diferenciaElement) diferenciaElement.textContent = '$0.00';
}

function actualizarQuickSummaryAhorro() {
    // Ya se hace en actualizarResumenAhorro()
}

console.log("✅ app-ahorro.js (con Firebase) cargado correctamente");