// File: app-ahorro.js
// ====================
// VERSIÓN CORREGIDA - SIN RECARGAS
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

const tipsAhorro = [
    "Cada moneda cuenta. Pequeños ahorros diarios se convierten en grandes sumas con el tiempo.",
    "Antes de comprar algo, pregúntate: ¿Realmente lo necesito o solo lo quiero?",
    "El ahorro no es un sacrificio, es una inversión en tu futuro tranquilo."
];

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

// ====================
// LISTENER CORREGIDO (SIN RECARGAS)
// ====================

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
                        // Buscar si tenemos un temporal que coincida
                        const temporalIndex = ahorros.findIndex(a => 
                            a.id.toString().startsWith('temp_') && 
                            Math.abs(a.monto - ahorroData.monto) < 0.01 &&
                            a.fecha === ahorroData.fecha && 
                            a.descripcion === ahorroData.descripcion &&
                            a.persona === ahorroData.persona
                        );
                        
                        if (temporalIndex !== -1) {
                            // ✅ Es NUESTRO ahorro
                            console.log("🔄 Reemplazando nuestro ahorro temporal");
                            ahorros[temporalIndex] = {
                                ...ahorroData,
                                sincronizando: false,
                                id: ahorroData.id
                            };
                        } 
                        else if (!ahorros.some(a => a.id === ahorroData.id)) {
                            // ✅ Es ahorro de OTRO dispositivo
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
    actualizarNombresEnUIAhorro();
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-ahorro').value = hoy;
    
    document.getElementById('monto-opcion1').textContent = configAhorro.montosOpciones.opcion1.toFixed(2);
    document.getElementById('monto-opcion2').textContent = configAhorro.montosOpciones.opcion2.toFixed(2);
    document.getElementById('monto-opcion3').textContent = configAhorro.montosOpciones.opcion3.toFixed(2);
    
    document.getElementById('meta-mensual').textContent = `S/${configAhorro.metaMensual}`;
    document.getElementById('meta-anual').textContent = `S/${configAhorro.metaAnual}`;
    
    inicializarGraficoAhorro();
    mostrarTipAleatorio();
}

function actualizarNombresEnUIAhorro() {
    document.getElementById('name-persona1').textContent = configAhorro.nombres.persona1;
    document.getElementById('name-persona2').textContent = configAhorro.nombres.persona2;
}

// ====================
// FUNCIÓN AGREGAR AHORRO CORREGIDA (CON ID TEMPORAL)
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
    
    // 1. Crear ID TEMPORAL
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
    
    // 2. MOSTRAR INMEDIATAMENTE
    ahorros.unshift(nuevoAhorro);
    actualizarUIAhorro();
    
    // 3. Limpiar formulario
    document.getElementById('descripcion-ahorro').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    opcionSeleccionada = null;
    habilitarBotonAgregar();
    
    const nombrePersona = personaSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    // 4. Guardar en Firebase
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
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
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
// RESTO DE FUNCIONES
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
    
    const refreshTipBtn = document.getElementById('refresh-tip');
    if (refreshTipBtn) refreshTipBtn.addEventListener('click', mostrarTipAleatorio);
    
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
}

function habilitarBotonAgregar() {
    const boton = document.getElementById('add-ahorro-btn');
    if (!boton) return;
    
    boton.disabled = !(opcionSeleccionada && personaSeleccionada);
}

function actualizarUIAhorro() {
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
        
        if (porcentajeMensual >= 100) progressMensual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
        else if (porcentajeMensual >= 70) progressMensual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
        else progressMensual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        
        if (porcentajeAnual >= 100) progressAnual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
        else if (porcentajeAnual >= 70) progressAnual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
        else progressAnual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
}

function mostrarAhorros() {
    const container = document.getElementById('ahorros-container');
    const emptyState = document.getElementById('empty-state-ahorro');
    const totales = document.getElementById('totales-ahorro');
    
    if (!container) return;
    
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
        // Formatear fecha con hora
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

function actualizarEstadisticas() {
    document.getElementById('racha-dias').textContent = '0 días';
    document.getElementById('promedio-diario').textContent = 'S/0.00';
    document.getElementById('proyeccion-6meses').textContent = 'S/0.00';
    document.getElementById('diferencia-ahorro').textContent = 'S/0.00';
}

function actualizarQuickSummaryAhorro() {}

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

function mostrarTipAleatorio() {
    const tipText = document.getElementById('tip-text');
    if (tipText && tipsAhorro.length > 0) {
        const randomIndex = Math.floor(Math.random() * tipsAhorro.length);
        tipText.textContent = `"${tipsAhorro[randomIndex]}"`;
    }
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

window.eliminarAhorro = eliminarAhorro;

console.log("✅ app-ahorro.js cargado correctamente (versión sin recargas)");