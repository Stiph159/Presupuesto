// File: app-ahorro.js
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
                        // 🔥 BUSCAR si existe un TEMPORAL con los mismos datos
                        const temporalIndex = ahorros.findIndex(a => 
                            a.id.toString().startsWith('temp_') && 
                            Math.abs(a.monto - ahorroData.monto) < 0.01 &&
                            a.fecha === ahorroData.fecha &&
                            a.persona === ahorroData.persona
                        );
                        
                        if (temporalIndex !== -1) {
                            // 🔥 Si existe temporal, ELIMINARLO
                            ahorros.splice(temporalIndex, 1);
                            console.log("🗑️ Temporal eliminado");
                        }
                        
                        // Solo agregar si no existe ya
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
                
                // 🔥 Si no hay timestamp, crear uno basado en la fecha
                if (!pagoData.timestamp) {
                    const fechaParts = pagoData.fecha.split('-');
                    pagoData.timestamp = new Date(
                        parseInt(fechaParts[0]), 
                        parseInt(fechaParts[1]) - 1, 
                        parseInt(fechaParts[2]),
                        12, 0, 0
                    );
                }
                
                switch (cambio.type) {
                    case 'added':
                        // 🔥 BUSCAR si existe un TEMPORAL con los mismos datos
                        const temporalIndex = pagosAhorro.findIndex(p => 
                            p.id.toString().startsWith('temp_') && 
                            Math.abs(p.monto - pagoData.monto) < 0.01 &&
                            p.fecha === pagoData.fecha &&
                            p.persona === pagoData.persona
                        );
                        
                        if (temporalIndex !== -1) {
                            // 🔥 Si existe temporal, ELIMINARLO
                            pagosAhorro.splice(temporalIndex, 1);
                            console.log("🗑️ Pago temporal eliminado");
                        }
                        
                        // Solo agregar si no existe ya
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
        
        const docRef = await db.collection('ahorros').add(ahorroData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
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
        
        const docRef = await db.collection('pagos_ahorro').add(pagoData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando pago:", error);
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
    configurarVerMasAhorro();
    
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
                fechaCustom.value = obtenerFechaLocal();
            }
            fechaCustom.focus();
        } else {
            fechaCustom.style.display = 'none';
        }
        actualizarDeudasPorFecha();
        
        const opcionTexto = this.options[this.selectedIndex].text;
        if (this.value === 'all') {
            mostrarNotificacion('📋 Mostrando TODO el historial - PAGOS EN CASCADA (FIFO)', 'info');
        } else {
            mostrarNotificacion(`📅 Mostrando: ${opcionTexto} - Barras independientes`, 'info');
        }
    });
    
    fechaCustom.addEventListener('change', function() {
        actualizarDeudasPorFecha();
        const fecha = new Date(this.value + 'T00:00:00');
        mostrarNotificacion(`📅 Mostrando: ${fecha.toLocaleDateString()}`, 'info');
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
    
    mostrarNotificacion('⏳ Guardando ahorro...', 'info');
    
    try {
        // 🔥 GUARDAR SOLO UN AHORRO - el monto es para AMBOS
        await saveAhorroToFirebase({
            fecha: fecha,
            monto: monto, // Este monto es lo que CADA UNO debe
            descripcion: descripcion || nombreOpcion,
            persona: 'ambos', // 🔥 Cambiar a 'ambos' para indicar que es para los dos
            opcion: opcionSeleccionada
        });
        
        // Limpiar formulario
        document.getElementById('descripcion-ahorro').value = '';
        document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('opcion-seleccionada-info').style.display = 'none';
        opcionSeleccionada = null;
        habilitarBotonAgregar();
        
        mostrarNotificacion(`✅ Ahorro de S/${monto} para cada uno guardado`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        mostrarNotificacion('❌ Error al guardar el ahorro', 'error');
    }
}

async function guardarPago() {
    const monto = parseFloat(document.getElementById('pago-individual-monto').value);
    const descripcion = document.getElementById('pago-individual-descripcion').value.trim();
    const fecha = document.getElementById('pago-individual-fecha').value;
    const selectorFecha = document.getElementById('deuda-fecha-selector').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    const persona = personaPagoSeleccionada;
    const nombrePersona = persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    
    // Validar que no pague más de lo que debe
    let deudaActual;
    if (selectorFecha === 'all') {
        const calculos = calcularDeudasFIFO();
        deudaActual = persona === 'persona1' ? calculos.deudaYo : calculos.deudaElla;
    } else {
        deudaActual = calcularDeudaPersonaPorFecha(persona, fecha);
    }
    
    if (monto > deudaActual + 0.01) {
        mostrarNotificacion(
            `❌ No puedes pagar más de lo que debes (S/${deudaActual.toFixed(2)})`, 
            'error'
        );
        return;
    }
    
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const ahora = new Date();
    
    const nuevoPago = {
        id: tempId,
        fecha: selectorFecha === 'all' ? null : fecha,
        monto: monto,
        descripcion: descripcion || `Pago de ${nombrePersona}`,
        persona: persona,
        timestamp: ahora,
        esPagoGlobal: selectorFecha === 'all'
    };
    
    if (selectorFecha === 'all') {
        mostrarNotificacion(`💰 Pago GLOBAL de S/${monto.toFixed(2)} - Se distribuirá FIFO desde la fecha más antigua`, 'info');
    }
    
    pagosAhorro.unshift(nuevoPago);
    actualizarUIAhorro();
    
    cerrarFormularioPago();
    document.getElementById('modal-confirmar-pago-ahorro').classList.remove('active');
    
    mostrarNotificacion(`✅ ${nombrePersona} pagó S/${monto.toFixed(2)}`, 'success');
    
    try {
        await savePagoAhorroToFirebase(nuevoPago);
    } catch (error) {
        console.error("Error guardando pago:", error);
        mostrarNotificacion('⚠️ Pago guardado localmente', 'warning');
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
// FUNCIONES DE CÁLCULO (VERSIÓN ÚNICA Y CORREGIDA)
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
    if (selector === 'all') return null;
    if (selector === 'custom' && fechaCustom) return fechaCustom;
    return null;
}

function calcularDeudasFIFO() {
    const fechaFiltro = obtenerFechaFiltro();
    
    // PASO 1: Obtener todas las fechas únicas con ahorros
    const fechas = [...new Set(ahorros.map(a => a.fecha))].sort();
    
    // PASO 2: Estructura para guardar deudas por fecha y persona
    const deudasPorFecha = {};
    const ahorrosPorFecha = {};
    
    fechas.forEach(fecha => {
        const ahorrosFecha = ahorros.filter(a => a.fecha === fecha);
        ahorrosPorFecha[fecha] = ahorrosFecha;
        
        // Calcular el monto TOTAL de ahorros en esta fecha
        // Como usamos 'ambos', cada ahorro ya representa lo que CADA UNO debe
        const montoTotalFecha = ahorrosFecha.reduce((sum, a) => sum + a.monto, 0);
        
        // AMBOS deben el mismo monto
        deudasPorFecha[fecha] = {
            persona1: montoTotalFecha,
            persona2: montoTotalFecha
        };
    });
    
    // PASO 3: Aplicar pagos FIFO (solo pagos globales)
    const deudasRestantes = JSON.parse(JSON.stringify(deudasPorFecha));
    
    ['persona1', 'persona2'].forEach(persona => {
        // Pagos globales (sin fecha específica) - se distribuyen FIFO
        const pagosGlobales = pagosAhorro
            .filter(p => p.persona === persona && p.fecha === null)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        pagosGlobales.forEach(pago => {
            let montoRestante = pago.monto;
            
            for (const fecha of fechas) {
                if (montoRestante <= 0.01) break;
                
                const deudaActual = deudasRestantes[fecha][persona];
                if (deudaActual > 0.01) {
                    const pagoAplicado = Math.min(deudaActual, montoRestante);
                    deudasRestantes[fecha][persona] = parseFloat((deudaActual - pagoAplicado).toFixed(2));
                    montoRestante = parseFloat((montoRestante - pagoAplicado).toFixed(2));
                }
            }
        });
        
        // Pagos específicos (con fecha) - van directo a su fecha
        const pagosEspecificos = pagosAhorro
            .filter(p => p.persona === persona && p.fecha !== null);
            
        pagosEspecificos.forEach(pago => {
            if (deudasRestantes[pago.fecha]) {
                deudasRestantes[pago.fecha][persona] = Math.max(0, 
                    deudasRestantes[pago.fecha][persona] - pago.monto
                );
            }
        });
    });
    
    // PASO 4: Calcular según la vista actual
    let totalVista = 0;
    let pagadoVistaYo = 0;
    let pagadoVistaElla = 0;
    let deudaVistaYo = 0;
    let deudaVistaElla = 0;

    if (fechaFiltro === null) {
        // VISTA "TODO EL HISTORIAL"
        fechas.forEach(fecha => {
            const debeEstaFecha = deudasPorFecha[fecha].persona1;
            totalVista += debeEstaFecha;
            
            pagadoVistaYo += deudasPorFecha[fecha].persona1 - deudasRestantes[fecha].persona1;
            pagadoVistaElla += deudasPorFecha[fecha].persona2 - deudasRestantes[fecha].persona2;
            
            deudaVistaYo += deudasRestantes[fecha].persona1;
            deudaVistaElla += deudasRestantes[fecha].persona2;
        });
    } else {
        // VISTA DE FECHA ESPECÍFICA
        if (deudasPorFecha[fechaFiltro]) {
            totalVista = deudasPorFecha[fechaFiltro].persona1;
            
            const originalYo = deudasPorFecha[fechaFiltro]?.persona1 || 0;
            const originalElla = deudasPorFecha[fechaFiltro]?.persona2 || 0;
            const restanteYo = deudasRestantes[fechaFiltro]?.persona1 || 0;
            const restanteElla = deudasRestantes[fechaFiltro]?.persona2 || 0;
            
            pagadoVistaYo = originalYo - restanteYo;
            pagadoVistaElla = originalElla - restanteElla;
            deudaVistaYo = restanteYo;
            deudaVistaElla = restanteElla;
        }
    }

    const totalGenerado = ahorros.reduce((sum, a) => sum + a.monto, 0) * 2; // ✅ Multiplicar por 2 porque cada ahorro es para 2 personas
    const totalPagado = pagosAhorro.reduce((sum, p) => sum + p.monto, 0);
    const totalPendiente = totalGenerado - totalPagado;
    
    return {
        // Vista actual
        debeCadaUno: totalVista,
        pagadoYo: pagadoVistaYo,
        pagadoElla: pagadoVistaElla,
        deudaYo: deudaVistaYo,
        deudaElla: deudaVistaElla,
        
        // Generales
        totalGenerado: totalGenerado,
        totalPagado: totalPagado,
        totalPendiente: totalGenerado - totalPagado,
        
        deudasRestantes,
        deudasOriginales: deudasPorFecha,
        fechas
    };
}

function calcularDeudaPersonaPorFecha(persona, fecha) {
    if (!fecha) {
        const calculos = calcularDeudasFIFO();
        return persona === 'persona1' ? calculos.deudaYo : calculos.deudaElla;
    }
    
    const calculos = calcularDeudasFIFO();
    if (calculos.deudasRestantes && calculos.deudasRestantes[fecha]) {
        return calculos.deudasRestantes[fecha][persona] || 0;
    }
    return 0;
}

function actualizarDeudasPorFecha() {
    const calculos = calcularDeudasFIFO();
    const selectorFecha = document.getElementById('deuda-fecha-selector');
    
    // Esto es lo que CADA PERSONA debe en la vista actual
    const debeCadaUno = calculos.debeCadaUno;
    
    // Actualizar UI
    document.getElementById('deuda-total-yo').textContent = `S/${debeCadaUno.toFixed(2)}`;
    document.getElementById('deuda-total-ella').textContent = `S/${debeCadaUno.toFixed(2)}`;
    
    document.getElementById('pagado-yo').textContent = `S/${calculos.pagadoYo.toFixed(2)}`;
    document.getElementById('pagado-ella').textContent = `S/${calculos.pagadoElla.toFixed(2)}`;
    
    document.getElementById('pendiente-yo').textContent = `S/${calculos.deudaYo.toFixed(2)}`;
    document.getElementById('pendiente-ella').textContent = `S/${calculos.deudaElla.toFixed(2)}`;
    
    // Barras de progreso
    const porcentajeYo = debeCadaUno > 0 ? (calculos.pagadoYo / debeCadaUno) * 100 : 0;
    const porcentajeElla = debeCadaUno > 0 ? (calculos.pagadoElla / debeCadaUno) * 100 : 0;
    
    document.getElementById('deuda-bar-yo').style.width = `${porcentajeYo}%`;
    document.getElementById('deuda-bar-ella').style.width = `${porcentajeElla}%`;
    document.getElementById('deuda-porcentaje-yo').textContent = `${porcentajeYo.toFixed(1)}%`;
    document.getElementById('deuda-porcentaje-ella').textContent = `${porcentajeElla.toFixed(1)}%`;
    
    // Totales generales
    document.getElementById('total-generado').textContent = `S/${calculos.totalGenerado.toFixed(2)}`;
    document.getElementById('total-pagado-general').textContent = `S/${calculos.totalPagado.toFixed(2)}`;
    document.getElementById('total-pendiente-general').textContent = `S/${calculos.totalPendiente.toFixed(2)}`;
    
    // Guardar cálculos
    window.ultimosCalculosFIFO = calculos;
    
    // Actualizar título
    const tituloDeudas = document.querySelector('.deudas-individuales-section h3');
    if (tituloDeudas) {
        if (selectorFecha.value === 'all') {
            tituloDeudas.innerHTML = '<i class="fas fa-globe"></i> Deudas Globales (FIFO - Pago en Cascada)';
        } else {
            const fechaTexto = selectorFecha.options[selectorFecha.selectedIndex].text;
            tituloDeudas.innerHTML = `<i class="fas fa-calendar-day"></i> Deudas del ${fechaTexto}`;
        }
    }
}

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
    
    const selectorFecha = document.getElementById('deuda-fecha-selector');
    const fechaCustom = document.getElementById('deuda-fecha-custom');
    const fechaFiltro = obtenerFechaFiltro();
    
    const deudaActual = calcularDeudaPersonaPorFecha(persona, fechaFiltro);
    
    let fechaFormulario = obtenerFechaLocal();
    if (selectorFecha.value === 'custom' && fechaCustom.value) {
        fechaFormulario = fechaCustom.value;
    } else if (selectorFecha.value === 'yesterday') {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        fechaFormulario = new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];
    }
    
    document.getElementById('pago-persona-nombre').textContent = nombre;
    document.getElementById('pago-pendiente-actual').textContent = `S/${deudaActual.toFixed(2)}`;
    document.getElementById('pago-individual-fecha').value = fechaFormulario;
    document.getElementById('pago-individual-monto').value = deudaActual.toFixed(2);
    document.getElementById('pago-individual-descripcion').value = '';
    
    if (selectorFecha.value === 'all') {
        mostrarNotificacion('💰 Pago GLOBAL - Se distribuirá desde la fecha más antigua', 'info');
    } else {
        mostrarNotificacion(`📅 Pagando deuda específica de ${fechaFormulario}`, 'info');
    }
    
    setTimeout(() => {
        document.getElementById('pago-individual-monto').focus();
        document.getElementById('pago-individual-monto').select();
    }, 300);
    
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
    
    const pagosOrdenados = [...pagosAhorro].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
    });
    
    let html = '';
    
    pagosOrdenados.slice(0, 20).forEach(pago => {
        const nombrePersona = pago.persona === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
        const idSeguro = pago.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        let fechaGastoFormateada = '📅 Global';
        if (pago.fecha) {
            const fechaGasto = new Date(pago.fecha + 'T00:00:00');
            fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }
        
        let fechaAccionFormateada = '', horaAccionFormateada = '';
        if (pago.timestamp) {
            const fechaAccion = new Date(pago.timestamp);
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            
            horaAccionFormateada = fechaAccion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            if (fechaAccion.toDateString() === hoy.toDateString()) fechaAccionFormateada = 'hoy';
            else if (fechaAccion.toDateString() === ayer.toDateString()) fechaAccionFormateada = 'ayer';
            else fechaAccionFormateada = fechaAccion.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }
        
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
                            <span class="pago-fecha">
                                <span class="badge-fecha-gasto">${fechaGastoFormateada}</span>
                                <span class="badge-accion">
                                    <i class="fas fa-clock"></i> 
                                    registrado ${fechaAccionFormateada} ${horaAccionFormateada}
                                    ${pago.esPagoGlobal ? '<span class="badge-global">🌍 Pago global</span>' : ''}
                                </span>
                            </span>
                        </div>
                    </div>
                    <div class="pago-monto">S/${pago.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarPagoAhorro('${idSeguro}')" title="Eliminar pago">
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
    
    const ahorrosOrdenados = [...ahorrosFiltrados].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.fecha + 'T00:00:00').getTime();
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.fecha + 'T00:00:00').getTime();
        return timeB - timeA;
    });
    
    let html = '';
    
    ahorrosOrdenados.forEach(ahorro => {
        const fechaGasto = new Date(ahorro.fecha + 'T00:00:00');
        const fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        
        let fechaAccionFormateada = '', horaAccionFormateada = '';
        if (ahorro.timestamp) {
            const fechaAccion = new Date(ahorro.timestamp);
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            
            horaAccionFormateada = fechaAccion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            if (fechaAccion.toDateString() === hoy.toDateString()) fechaAccionFormateada = 'hoy';
            else if (fechaAccion.toDateString() === ayer.toDateString()) fechaAccionFormateada = 'ayer';
            else fechaAccionFormateada = fechaAccion.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
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
        
        const idSeguro = ahorro.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        html += `
            <div class="ahorro-item ${ahorro.persona}">
                <div class="gasto-header">
                    <div class="ahorro-monto">S/${ahorro.monto.toFixed(2)} (cada uno)</div>
                    <button class="delete-btn" onclick="eliminarAhorro('${idSeguro}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${ahorro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona"><i class="fas fa-user"></i> Activó: ${nombrePersona}</span>
                        <span class="ahorro-opcion ${claseBadge}">${nombreOpcion}</span>
                    </div>
                    <div class="gasto-fecha">
                        <span class="badge-fecha-gasto">${fechaGastoFormateada}</span>
                        <span class="badge-accion">
                            <i class="fas fa-clock"></i> registrado ${fechaAccionFormateada} ${horaAccionFormateada}
                        </span>
                    </div>
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
    
    // ✅ SIN MULTIPLICAR
    const sumaTotal = ahorros.reduce((sum, a) => sum + a.monto, 0);
    if (totalMonto) totalMonto.textContent = `S/${sumaTotal.toFixed(2)}`;
    
    document.getElementById('modal-limpiar-todo-ahorro').classList.add('active');
}

async function limpiarTodoHistorial() {
    mostrarNotificacion('Eliminando todo el historial...', 'info');
    
    const idsAhorros = ahorros.filter(a => !a.id.toString().startsWith('temp_')).map(a => a.id);
    for (const id of idsAhorros) {
        try {
            await deleteAhorroFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando ahorro:", id);
        }
    }
    
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

window.eliminarAhorro = eliminarAhorro;
window.eliminarPagoAhorro = eliminarPagoAhorro;

console.log("✅ app-ahorro.js cargado correctamente");

// ====================
// FUNCIÓN PARA VER MÁS AHORROS
// ====================

function configurarVerMasAhorro() {
    const verMasBtn = document.getElementById('ver-mas-ahorro');
    const ahorrosContainer = document.getElementById('ahorros-container');
    
    if (!verMasBtn || !ahorrosContainer) return;
    
    let expandido = false;
    const alturaNormal = '300px';
    
    verMasBtn.addEventListener('click', function() {
        expandido = !expandido;
        
        if (expandido) {
            ahorrosContainer.style.maxHeight = 'none';
            ahorrosContainer.style.overflowY = 'visible';
            this.innerHTML = '<i class="fas fa-chevron-up"></i> Ver menos montos';
        } else {
            ahorrosContainer.style.maxHeight = alturaNormal;
            ahorrosContainer.style.overflowY = 'auto';
            this.innerHTML = '<i class="fas fa-chevron-down"></i> Ver más montos';
        }
    });
}