// VARIABLES GLOBALES
// ====================

let ahorros = [];           // Eventos de ahorro (cuando activan una opción)
let pagosAhorro = [];        // Pagos realizados (retiros de alcancía)
let configAhorro = {
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
let personaPagoSeleccionada = null; // Para pagos individuales
let chartAhorroInstance = null;
let unsubscribeAhorros = null;
let unsubscribePagosAhorro = null;
let unsubscribeConfig = null;
let ignoreNextSnapshot = false;

// ====================
// FUNCIÓN PARA OBTENER FECHA LOCAL CORRECTA
// ====================

function obtenerFechaLocal() {
    const ahora = new Date();
    // Ajustar por zona horaria (Perú UTC-5)
    const fechaLocal = new Date(ahora.getTime() - (ahora.getTimezoneOffset() * 60000));
    return fechaLocal.toISOString().split('T')[0];
}

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebaseAhorro() {
    try {
        console.log("💰 Inicializando Firebase para ahorros...");
        
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
        
        mostrarNotificacion("✅ Ahorros conectados a la nube", "success");
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
            const configData = configDoc.data();
            if (configData.ahorroConfig) {
                configAhorro = {
                    ...configAhorro,
                    ...configData.ahorroConfig
                };
            }
            if (configData.nombres) {
                configAhorro.nombres = configData.nombres;
            }
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
        const savedConfig = localStorage.getItem('ahorro_config');
        if (savedConfig) {
            configAhorro = JSON.parse(savedConfig);
        }
    }
}

function setupRealtimeListeners() {
    if (unsubscribeAhorros) unsubscribeAhorros();
    if (unsubscribePagosAhorro) unsubscribePagosAhorro();
    if (unsubscribeConfig) unsubscribeConfig();
    
    const db = firebase.firestore();
    
    // Listener para ahorros (eventos)
    unsubscribeAhorros = db.collection('ahorros')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            if (ignoreNextSnapshot) {
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("📊 Cambios en ahorros:", snapshot.docChanges().length);
            
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
                        if (!ahorros.some(a => a.id === ahorroData.id)) {
                            ahorros.push(ahorroData);
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
            
            ahorros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            actualizarUIAhorro();
            saveToLocalStorage();
        }, (error) => {
            console.error("❌ Error en listener de ahorros:", error);
        });
    
    // Listener para pagos de ahorro
    unsubscribePagosAhorro = db.collection('pagos_ahorro')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            if (ignoreNextSnapshot) {
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("💸 Cambios en pagos de ahorro:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const pagoData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                if (pagoData.timestamp && pagoData.timestamp.toDate) {
                    pagoData.timestamp = pagoData.timestamp.toDate();
                }
                
                switch (cambio.type) {
                    case 'added':
                        if (!pagosAhorro.some(p => p.id === pagoData.id)) {
                            pagosAhorro.push(pagoData);
                            mostrarNotificacion(`💸 Nuevo pago registrado`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = pagosAhorro.findIndex(p => p.id === pagoData.id);
                        if (indexMod !== -1) pagosAhorro[indexMod] = pagoData;
                        break;
                    case 'removed':
                        pagosAhorro = pagosAhorro.filter(p => p.id !== pagoData.id);
                        mostrarNotificacion(`📌 Un pago fue eliminado`, 'warning');
                        break;
                }
            });
            
            pagosAhorro.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            actualizarUIAhorro();
            saveToLocalStorage();
        }, (error) => {
            console.error("❌ Error en listener de pagos:", error);
        });
    
    unsubscribeConfig = db.collection('config')
        .doc('nuestra_pareja')
        .onSnapshot((doc) => {
            if (doc.exists) {
                const configData = doc.data();
                if (configData.ahorroConfig) {
                    configAhorro = {
                        ...configAhorro,
                        ...configData.ahorroConfig
                    };
                }
                if (configData.nombres) {
                    configAhorro.nombres = configData.nombres;
                }
                actualizarUIAhorro();
                saveToLocalStorage();
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
        
        ignoreNextSnapshot = true;
        const docRef = await db.collection('ahorros').add(ahorroData);
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
        
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

async function savePagoAhorroToFirebase(pago) {
    try {
        const db = firebase.firestore();
        const pagoData = {
            fecha: pago.fecha,
            monto: pago.monto,
            descripcion: pago.descripcion,
            persona: pago.persona,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        ignoreNextSnapshot = true;
        const docRef = await db.collection('pagos_ahorro').add(pagoData);
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
        
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando pago:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

async function deleteAhorroFromFirebase(id) {
    try {
        ignoreNextSnapshot = true;
        await firebase.firestore().collection('ahorros').doc(id).delete();
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

async function deletePagoAhorroFromFirebase(id) {
    try {
        ignoreNextSnapshot = true;
        await firebase.firestore().collection('pagos_ahorro').doc(id).delete();
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
    } catch (error) {
        console.error("❌ Error eliminando pago:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveToLocalStorage() {
    try {
        localStorage.setItem('nuestros_ahorros', JSON.stringify(ahorros));
        localStorage.setItem('pagos_ahorro', JSON.stringify(pagosAhorro));
        localStorage.setItem('ahorro_config', JSON.stringify(configAhorro));
    } catch (error) {
        console.error("Error guardando en localStorage:", error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedAhorros = localStorage.getItem('nuestros_ahorros');
        const savedPagos = localStorage.getItem('pagos_ahorro');
        const savedConfig = localStorage.getItem('ahorro_config');
        
        if (savedAhorros) ahorros = JSON.parse(savedAhorros);
        if (savedPagos) pagosAhorro = JSON.parse(savedPagos);
        if (savedConfig) configAhorro = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("💰 Iniciando app de ahorros...");
    
    loadFromLocalStorage();
    inicializarApp();
    actualizarUIAhorro();
    
    setTimeout(async () => {
        await initFirebaseAhorro();
    }, 1000);
});

function inicializarApp() {
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    configurarEventos();
    configurarFiltros();
    configurarSelectorFecha();
    configurarBarraInferior();
    
    // CORREGIDO: Usar obtenerFechaLocal()
    const fechaLocal = obtenerFechaLocal();
    document.getElementById('fecha-ahorro').value = fechaLocal;
    document.getElementById('pago-individual-fecha').value = fechaLocal;
    
    document.getElementById('monto-opcion1').textContent = configAhorro.montosOpciones.opcion1.toFixed(2);
    document.getElementById('monto-opcion2').textContent = configAhorro.montosOpciones.opcion2.toFixed(2);
    document.getElementById('monto-opcion3').textContent = configAhorro.montosOpciones.opcion3.toFixed(2);
    
    actualizarNombresEnUI();
    inicializarGraficoAhorro();
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventos() {
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Botón volver
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // Selector de persona
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
            habilitarBotonAgregar();
        });
    });
    
    // Tarjetas de opciones
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
    
    // Botón agregar ahorro
    document.getElementById('add-ahorro-btn').addEventListener('click', agregarAhorro);
    
    // Enter en descripción
    document.getElementById('descripcion-ahorro').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarAhorro();
    });
    
    // Botones de pagar individual
    document.querySelectorAll('.btn-pagar-individual').forEach(btn => {
        btn.addEventListener('click', function() {
            const persona = this.dataset.persona;
            abrirFormularioPago(persona);
        });
    });
    
    // Cerrar formulario de pago
    document.getElementById('cerrar-pago-form').addEventListener('click', cerrarFormularioPago);
    document.getElementById('cancelar-pago-individual').addEventListener('click', cerrarFormularioPago);
    
    // Confirmar pago
    document.getElementById('confirmar-pago-individual').addEventListener('click', mostrarModalConfirmacionPago);
    
    // Modal confirmación pago
    document.getElementById('confirmar-pago-final-ahorro').addEventListener('click', guardarPago);
    document.getElementById('cancelar-confirmacion-ahorro').addEventListener('click', () => {
        document.getElementById('modal-confirmar-pago-ahorro').classList.remove('active');
    });
    
    // Editar nombres
    document.getElementById('edit-names').addEventListener('click', () => {
        document.getElementById('nombre-persona1').value = configAhorro.nombres.persona1;
        document.getElementById('nombre-persona2').value = configAhorro.nombres.persona2;
        document.getElementById('names-modal').classList.add('active');
    });
    
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', () => {
        document.getElementById('names-modal').classList.remove('active');
    });
    
    // Editar montos
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('dblclick', function() {
            document.getElementById('monto-opcion1-input').value = configAhorro.montosOpciones.opcion1;
            document.getElementById('monto-opcion2-input').value = configAhorro.montosOpciones.opcion2;
            document.getElementById('monto-opcion3-input').value = configAhorro.montosOpciones.opcion3;
            document.getElementById('montos-modal').classList.add('active');
        });
    });
    
    document.getElementById('save-montos').addEventListener('click', guardarMontos);
    document.getElementById('cancel-montos').addEventListener('click', () => {
        document.getElementById('montos-modal').classList.remove('active');
    });
    
    // Exportar
    document.getElementById('export-ahorro-btn').addEventListener('click', exportarDatos);
    
    // Escape para cerrar modales
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.getElementById('names-modal').classList.remove('active');
            document.getElementById('montos-modal').classList.remove('active');
            document.getElementById('modal-limpiar-todo-ahorro').classList.remove('active');
            document.getElementById('modal-confirmar-pago-ahorro').classList.remove('active');
            cerrarFormularioPago();
        }
    });
}

function configurarBarraInferior() {
    const bottomBtns = document.querySelectorAll('.bottom-nav-btn');
    
    bottomBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            
            bottomBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            switch(accion) {
                case 'ver-inicio':
                    window.location.href = 'index.html';
                    break;
                case 'ver-ahorros':
                    window.location.href = 'ahorro.html';
                    break;
                case 'ver-limites':
                    window.location.href = 'limites.html';
                    break;
                case 'ver-mis-finanzas':
                    window.location.href = 'finanzas-personales.html?persona=yo';
                    break;
                case 'ver-dias-especiales':
                    window.location.href = 'dias-especiales.html';
                    break;
            }
        });
    });
}

function configurarSelectorFecha() {
    const selector = document.getElementById('deuda-fecha-selector');
    const fechaCustom = document.getElementById('deuda-fecha-custom');
    
    if (!selector) return;
    
    selector.addEventListener('change', function() {
        if (this.value === 'custom') {
            fechaCustom.style.display = 'block';
            if (!fechaCustom.value) {
                // CORREGIDO: Usar obtenerFechaLocal()
                fechaCustom.value = obtenerFechaLocal();
            }
        } else {
            fechaCustom.style.display = 'none';
        }
        actualizarDeudasPorFecha();
    });
    
    fechaCustom.addEventListener('change', function() {
        actualizarDeudasPorFecha();
    });
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
    
    // Limpiar formulario
    document.getElementById('descripcion-ahorro').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    opcionSeleccionada = null;
    habilitarBotonAgregar();
    
    const nombrePersona = personaSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    mostrarNotificacion(`✅ ${nombrePersona} activó: S/${monto.toFixed(2)} para cada uno`, 'success');
    
    try {
        await saveAhorroToFirebase(nuevoAhorro);
    } catch (error) {
        console.error("Error guardando:", error);
    }
    
    saveToLocalStorage();
}

async function guardarPago() {
    const monto = parseFloat(document.getElementById('pago-individual-monto').value);
    const descripcion = document.getElementById('pago-individual-descripcion').value.trim();
    const fecha = document.getElementById('pago-individual-fecha').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    // Validar que no pague más de lo que debe en la fecha seleccionada
    const fechaSelector = document.getElementById('deuda-fecha-selector').value;
    const fechaCustom = document.getElementById('deuda-fecha-custom').value;
    
    let fechaFiltro = null;
    if (fechaSelector === 'today') {
        fechaFiltro = obtenerFechaLocal();
    } else if (fechaSelector === 'yesterday') {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const fechaAyer = new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000));
        fechaFiltro = fechaAyer.toISOString().split('T')[0];
    } else if (fechaSelector === 'custom' && fechaCustom) {
        fechaFiltro = fechaCustom;
    }
    
    const deudaActual = calcularDeudaPersonaPorFecha(personaPagoSeleccionada, fechaFiltro);
    
    if (monto > deudaActual) {
        mostrarNotificacion(`No puedes pagar más de lo que debes (S/${deudaActual.toFixed(2)})`, 'error');
        return;
    }
    
    const nombrePersona = personaPagoSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    const nuevoPago = {
        id: 'temp_' + Date.now(),
        fecha: fecha,
        monto: monto,
        descripcion: descripcion || `Pago de ${nombrePersona}`,
        persona: personaPagoSeleccionada,
        timestamp: new Date()
    };
    
    pagosAhorro.unshift(nuevoPago);
    actualizarUIAhorro();
    
    cerrarFormularioPago();
    document.getElementById('modal-confirmar-pago-ahorro').classList.remove('active');
    
    mostrarNotificacion(`✅ ${nombrePersona} pagó S/${monto.toFixed(2)}`, 'success');
    
    try {
        await savePagoAhorroToFirebase(nuevoPago);
    } catch (error) {
        console.error("Error guardando pago:", error);
    }
    
    saveToLocalStorage();
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
    
    saveToLocalStorage();
}

async function eliminarPagoAhorro(id) {
    if (!confirm('¿Eliminar este registro de pago?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const pagoEliminado = pagosAhorro.find(p => p.id === id);
    pagosAhorro = pagosAhorro.filter(p => p.id !== id);
    actualizarUIAhorro();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deletePagoAhorroFromFirebase(id);
            mostrarNotificacion('✅ Pago eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Pago eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        if (pagoEliminado) {
            pagosAhorro.push(pagoEliminado);
            actualizarUIAhorro();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveToLocalStorage();
}

// ====================
// FUNCIONES DE CÁLCULO
// ====================

function obtenerFechaFiltro() {
    const selector = document.getElementById('deuda-fecha-selector').value;
    const fechaCustom = document.getElementById('deuda-fecha-custom').value;
    
    if (selector === 'today') return obtenerFechaLocal();
    if (selector === 'yesterday') {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        const fechaAyer = new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000));
        return fechaAyer.toISOString().split('T')[0];
    }
    if (selector === 'custom' && fechaCustom) return fechaCustom;
    return null; // null significa "todo el historial"
}

function calcularDeudas() {
    const fechaFiltro = obtenerFechaFiltro();
    
    // Filtrar ahorros por fecha si es necesario
    let ahorrosFiltrados = [...ahorros];
    if (fechaFiltro) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.fecha === fechaFiltro);
    }
    
    // Filtrar pagos por fecha si es necesario
    let pagosFiltrados = [...pagosAhorro];
    if (fechaFiltro) {
        pagosFiltrados = pagosFiltrados.filter(p => p.fecha === fechaFiltro);
    }
    
    // Total generado (cada ahorro genera deuda para AMBOS)
    const totalGenerado = ahorrosFiltrados.reduce((sum, a) => sum + (a.monto * 2), 0);
    
    // Cada uno debe la suma de todos los montos de ahorro
    const debeCadaUno = ahorrosFiltrados.reduce((sum, a) => sum + a.monto, 0);
    
    // Pagos por persona
    const pagadoYo = pagosFiltrados.filter(p => p.persona === 'persona1')
        .reduce((sum, p) => sum + p.monto, 0);
    const pagadoElla = pagosFiltrados.filter(p => p.persona === 'persona2')
        .reduce((sum, p) => sum + p.monto, 0);
    
    // Deudas actuales
    const deudaYo = Math.max(0, debeCadaUno - pagadoYo);
    const deudaElla = Math.max(0, debeCadaUno - pagadoElla);
    
    return {
        totalGenerado,
        debeCadaUno,
        pagadoYo,
        pagadoElla,
        deudaYo,
        deudaElla,
        totalPagado: pagadoYo + pagadoElla,
        totalPendiente: deudaYo + deudaElla
    };
}

function calcularDeudaPersonaPorFecha(persona, fecha) {
    // Si fecha es null, calcular todo el historial
    let ahorrosFiltrados = fecha ? ahorros.filter(a => a.fecha === fecha) : ahorros;
    let pagosFiltrados = fecha ? pagosAhorro.filter(p => p.fecha === fecha && p.persona === persona) 
                               : pagosAhorro.filter(p => p.persona === persona);
    
    const debe = ahorrosFiltrados.reduce((sum, a) => sum + a.monto, 0);
    const pagado = pagosFiltrados.reduce((sum, p) => sum + p.monto, 0);
    
    return Math.max(0, debe - pagado);
}

function actualizarDeudasPorFecha() {
    const calculos = calcularDeudas();
    const fechaFiltro = obtenerFechaFiltro();
    
    // Actualizar UI
    document.getElementById('deuda-total-yo').textContent = `S/${calculos.debeCadaUno.toFixed(2)}`;
    document.getElementById('deuda-total-ella').textContent = `S/${calculos.debeCadaUno.toFixed(2)}`;
    
    document.getElementById('pagado-yo').textContent = `S/${calculos.pagadoYo.toFixed(2)}`;
    document.getElementById('pagado-ella').textContent = `S/${calculos.pagadoElla.toFixed(2)}`;
    
    document.getElementById('pendiente-yo').textContent = `S/${calculos.deudaYo.toFixed(2)}`;
    document.getElementById('pendiente-ella').textContent = `S/${calculos.deudaElla.toFixed(2)}`;
    
    // Barras de progreso (porcentaje pagado)
    const porcentajeYo = calculos.debeCadaUno > 0 ? (calculos.pagadoYo / calculos.debeCadaUno) * 100 : 0;
    const porcentajeElla = calculos.debeCadaUno > 0 ? (calculos.pagadoElla / calculos.debeCadaUno) * 100 : 0;
    
    document.getElementById('deuda-bar-yo').style.width = `${porcentajeYo}%`;
    document.getElementById('deuda-bar-ella').style.width = `${porcentajeElla}%`;
    
    document.getElementById('deuda-porcentaje-yo').textContent = `${porcentajeYo.toFixed(1)}%`;
    document.getElementById('deuda-porcentaje-ella').textContent = `${porcentajeElla.toFixed(1)}%`;
    
    // Totales generales
    document.getElementById('total-generado').textContent = `S/${calculos.totalGenerado.toFixed(2)}`;
    document.getElementById('total-pagado-general').textContent = `S/${calculos.totalPagado.toFixed(2)}`;
    document.getElementById('total-pendiente-general').textContent = `S/${calculos.totalPendiente.toFixed(2)}`;
}

// ====================
// FUNCIONES DE UI
// ====================

function actualizarUIAhorro() {
    actualizarNombresEnUI();
    actualizarDeudasPorFecha();
    aplicarFiltros();
    mostrarPagos();
}

function actualizarNombresEnUI() {
    document.getElementById('name-persona1').textContent = configAhorro.nombres.persona1;
    document.getElementById('name-persona2').textContent = configAhorro.nombres.persona2;
    
    document.getElementById('deuda-nombre-yo').textContent = configAhorro.nombres.persona1;
    document.getElementById('deuda-nombre-ella').textContent = configAhorro.nombres.persona2;
    
    // Actualizar filtros
    const filtroPersona1 = document.getElementById('filtro-persona1-ahorro');
    const filtroPersona2 = document.getElementById('filtro-persona2-ahorro');
    if (filtroPersona1) filtroPersona1.textContent = configAhorro.nombres.persona1;
    if (filtroPersona2) filtroPersona2.textContent = configAhorro.nombres.persona2;
}

function habilitarBotonAgregar() {
    const boton = document.getElementById('add-ahorro-btn');
    boton.disabled = !opcionSeleccionada;
}

function abrirFormularioPago(persona) {
    personaPagoSeleccionada = persona;
    const nombre = persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    // Calcular deuda pendiente según la fecha seleccionada
    const fechaFiltro = obtenerFechaFiltro();
    const deudaActual = calcularDeudaPersonaPorFecha(persona, fechaFiltro);
    
    document.getElementById('pago-persona-nombre').textContent = nombre;
    document.getElementById('pago-pendiente-actual').textContent = `S/${deudaActual.toFixed(2)}`;
    document.getElementById('pago-individual-monto').value = '';
    document.getElementById('pago-individual-descripcion').value = '';
    // CORREGIDO: Usar obtenerFechaLocal()
    document.getElementById('pago-individual-fecha').value = obtenerFechaLocal();
    
    document.getElementById('pago-individual-section').style.display = 'block';
}

function cerrarFormularioPago() {
    document.getElementById('pago-individual-section').style.display = 'none';
    personaPagoSeleccionada = null;
}

function mostrarModalConfirmacionPago() {
    const monto = document.getElementById('pago-individual-monto').value;
    const persona = personaPagoSeleccionada;
    const nombre = persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    if (!monto || parseFloat(monto) <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    document.getElementById('modal-pago-detalle-ahorro').textContent = `${nombre} va a pagar S/${parseFloat(monto).toFixed(2)}`;
    document.getElementById('modal-pago-monto-ahorro').textContent = `S/${parseFloat(monto).toFixed(2)}`;
    
    document.getElementById('modal-confirmar-pago-ahorro').classList.add('active');
}

function mostrarPagos() {
    const container = document.getElementById('pagos-container');
    const emptyState = document.getElementById('empty-state-pagos');
    
    if (!container) return;
    
    if (pagosAhorro.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    let html = '';
    pagosAhorro.slice(0, 20).forEach(pago => {
        const nombrePersona = pago.persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
        
        const fecha = new Date(pago.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        html += `
            <div class="pago-item">
                <div class="pago-header">
                    <div class="pago-icon">
                        <i class="fas fa-hand-holding-usd"></i>
                    </div>
                    <div class="pago-info">
                        <div class="pago-descripcion">${pago.descripcion}</div>
                        <div class="pago-detalle">
                            <span class="pago-persona">${nombrePersona}</span>
                            <span class="pago-fecha">${fecha}</span>
                        </div>
                    </div>
                    <div class="pago-monto">S/${pago.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarPagoAhorro('${pago.id}')" title="Eliminar pago">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ====================
// FUNCIONES DE FILTROS
// ====================

function configurarFiltros() {
    const busquedaInput = document.getElementById('busqueda-ahorro');
    const filtroOpcion = document.getElementById('filtro-opcion-ahorro');
    const filtroPersona = document.getElementById('filtro-persona-ahorro');
    const filtroFecha = document.getElementById('filtro-fecha-ahorro');
    const rangoFechas = document.getElementById('rango-fechas-ahorro');
    const fechaDesde = document.getElementById('fecha-desde-ahorro');
    const fechaHasta = document.getElementById('fecha-hasta-ahorro');
    const btnAplicar = document.getElementById('aplicar-fecha-ahorro');
    const btnLimpiar = document.getElementById('limpiar-filtros-ahorro');
    const btnLimpiarTodo = document.getElementById('limpiar-todo-historial-ahorro');
    
    if (!busquedaInput) return;
    
    busquedaInput.addEventListener('input', aplicarFiltros);
    filtroOpcion.addEventListener('change', aplicarFiltros);
    filtroPersona.addEventListener('change', aplicarFiltros);
    
    filtroFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            rangoFechas.style.display = 'block';
        } else {
            rangoFechas.style.display = 'none';
            aplicarFiltros();
        }
    });
    
    btnAplicar.addEventListener('click', aplicarFiltros);
    
    btnLimpiar.addEventListener('click', function() {
        busquedaInput.value = '';
        filtroOpcion.value = '';
        filtroPersona.value = '';
        filtroFecha.value = 'all';
        rangoFechas.style.display = 'none';
        fechaDesde.value = '';
        fechaHasta.value = '';
        aplicarFiltros();
        mostrarNotificacion('Filtros limpiados', 'info');
    });
    
    btnLimpiarTodo.addEventListener('click', mostrarModalLimpiarTodo);
    
    // Eventos del modal limpiar todo
    document.getElementById('cancelar-limpiar-todo-ahorro').addEventListener('click', () => {
        document.getElementById('modal-limpiar-todo-ahorro').classList.remove('active');
    });
    
    document.getElementById('confirmar-limpiar-todo-ahorro').addEventListener('click', limpiarTodoHistorial);
}

function aplicarFiltros() {
    const busqueda = document.getElementById('busqueda-ahorro')?.value.toLowerCase() || '';
    const opcion = document.getElementById('filtro-opcion-ahorro')?.value || '';
    const persona = document.getElementById('filtro-persona-ahorro')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha-ahorro')?.value || 'all';
    const fechaDesde = document.getElementById('fecha-desde-ahorro')?.value || '';
    const fechaHasta = document.getElementById('fecha-hasta-ahorro')?.value || '';
    
    let ahorrosFiltrados = [...ahorros];
    
    if (busqueda) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => 
            a.descripcion.toLowerCase().includes(busqueda)
        );
    }
    
    if (opcion) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.opcion === opcion);
    }
    
    if (persona) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.persona === persona);
    }
    
    if (filtroFecha !== 'all') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        switch(filtroFecha) {
            case 'today':
                const hoyStr = obtenerFechaLocal();
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
    
    ahorrosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    document.getElementById('filtro-mostrando-ahorro').textContent = ahorrosFiltrados.length;
    document.getElementById('filtro-total-ahorro').textContent = ahorros.length;
    
    const totalMonto = ahorrosFiltrados.reduce((sum, a) => sum + a.monto, 0);
    document.getElementById('filtro-total-monto-ahorro').textContent = `S/${totalMonto.toFixed(2)}`;
    
    document.getElementById('total-filtrado-ahorro').textContent = `S/${totalMonto.toFixed(2)}`;
    document.getElementById('total-general-ahorro').textContent = `S/${ahorros.reduce((sum, a) => sum + a.monto, 0).toFixed(2)}`;
    
    mostrarAhorrosFiltrados(ahorrosFiltrados);
}

function mostrarAhorrosFiltrados(ahorrosFiltrados) {
    const container = document.getElementById('ahorros-container');
    const emptyState = document.getElementById('empty-state-ahorro');
    const totales = document.getElementById('totales-ahorro');
    
    if (!container) return;
    
    if (ahorrosFiltrados.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    let html = '';
    
    ahorrosFiltrados.forEach(ahorro => {
        const fecha = new Date(ahorro.fecha + 'T00:00:00').toLocaleDateString('es-ES', {
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
                    <div class="ahorro-monto">S/${ahorro.monto.toFixed(2)} (cada uno)</div>
                    <button class="delete-btn" onclick="eliminarAhorro('${ahorro.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${ahorro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona">Activó: ${nombrePersona}</span>
                        <span class="ahorro-opcion ${claseBadge}">${nombreOpcion}</span>
                    </div>
                    <div class="gasto-fecha">${fecha}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarModalLimpiarTodo() {
    const totalRegistros = document.getElementById('total-registros-eliminar-ahorro');
    const totalMonto = document.getElementById('monto-total-eliminar-ahorro');
    
    if (totalRegistros) totalRegistros.textContent = ahorros.length;
    
    const sumaTotal = ahorros.reduce((sum, a) => sum + (a.monto * 2), 0);
    if (totalMonto) totalMonto.textContent = `S/${sumaTotal.toFixed(2)}`;
    
    document.getElementById('modal-limpiar-todo-ahorro').classList.add('active');
}

async function limpiarTodoHistorial() {
    mostrarNotificacion('Eliminando todo el historial...', 'info');
    
    // Eliminar ahorros
    const idsAhorros = ahorros.filter(a => !a.id.toString().startsWith('temp_')).map(a => a.id);
    for (const id of idsAhorros) {
        try {
            await deleteAhorroFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando ahorro:", id);
        }
    }
    
    // Eliminar pagos
    const idsPagos = pagosAhorro.filter(p => !p.id.toString().startsWith('temp_')).map(p => p.id);
    for (const id of idsPagos) {
        try {
            await deletePagoAhorroFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando pago:", id);
        }
    }
    
    ahorros = [];
    pagosAhorro = [];
    actualizarUIAhorro();
    saveToLocalStorage();
    
    document.getElementById('modal-limpiar-todo-ahorro').classList.remove('active');
    mostrarNotificacion('Todo el historial eliminado', 'success');
}

// ====================
// FUNCIONES DE CONFIGURACIÓN
// ====================

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configAhorro.nombres.persona1 = nombre1;
    configAhorro.nombres.persona2 = nombre2;
    
    actualizarNombresEnUI();
    document.getElementById('names-modal').classList.remove('active');
    
    try {
        await firebase.firestore().collection('config').doc('nuestra_pareja').set({
            nombres: configAhorro.nombres
        }, { merge: true });
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveToLocalStorage();
}

async function guardarMontos() {
    const monto1 = parseFloat(document.getElementById('monto-opcion1-input').value);
    const monto2 = parseFloat(document.getElementById('monto-opcion2-input').value);
    const monto3 = parseFloat(document.getElementById('monto-opcion3-input').value);
    
    if (monto1 > 0 && monto2 > 0 && monto3 > 0) {
        configAhorro.montosOpciones.opcion1 = monto1;
        configAhorro.montosOpciones.opcion2 = monto2;
        configAhorro.montosOpciones.opcion3 = monto3;
        
        document.getElementById('monto-opcion1').textContent = monto1.toFixed(2);
        document.getElementById('monto-opcion2').textContent = monto2.toFixed(2);
        document.getElementById('monto-opcion3').textContent = monto3.toFixed(2);
        
        document.getElementById('montos-modal').classList.remove('active');
        
        try {
            await firebase.firestore().collection('config').doc('nuestra_pareja').set({
                ahorroConfig: {
                    montosOpciones: configAhorro.montosOpciones
                }
            }, { merge: true });
            mostrarNotificacion('Montos actualizados', 'success');
        } catch (error) {
            console.error("Error guardando montos:", error);
            mostrarNotificacion('Montos actualizados (local)', 'warning');
        }
        
        saveToLocalStorage();
    }
}

function exportarDatos() {
    const data = {
        ahorros: ahorros,
        pagos: pagosAhorro,
        config: configAhorro,
        fecha: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `ahorros_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Datos exportados', 'success');
}

// ====================
// FUNCIONES DE GRÁFICOS
// ====================

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

// ====================
// FUNCIONES UTILITARIAS
// ====================

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
    if (icono) {
        icono.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
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
    
    setTimeout(() => notificacion.classList.remove('show'), 2500);
}

// Hacer funciones globales para los onclick
window.eliminarAhorro = eliminarAhorro;
window.eliminarPagoAhorro = eliminarPagoAhorro;

console.log("✅ app-ahorro.js cargado correctamente");