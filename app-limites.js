// File: app-limites.js
// ====================
// VARIABLES GLOBALES
// ====================

let registrosLimites = [];      // Registros de límites (con persona='ambos')
let pagosLimites = [];          // Pagos de ahorro forzado
let configLimites = {
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let limiteSeleccionado = null;
let chartLimitesInstance = null;
let unsubscribeLimites = null;
let unsubscribePagosLimites = null;
let unsubscribeConfigLimites = null;
let ignoreNextSnapshot = false;
let personaPagoSeleccionada = null;

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebaseLimites() {
    try {
        console.log("🚫 Inicializando Firebase para límites...");
        
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

function setupRealtimeListenersLimites() {
    if (unsubscribeLimites) unsubscribeLimites();
    if (unsubscribePagosLimites) unsubscribePagosLimites();
    if (unsubscribeConfigLimites) unsubscribeConfigLimites();
    
    const db = firebase.firestore();
    
    // Listener para registros de límites
    unsubscribeLimites = db.collection('limites')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            if (ignoreNextSnapshot) {
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("📊 Cambios detectados en límites:", snapshot.docChanges().length);
            
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
                        const temporalIndex = registrosLimites.findIndex(r => 
                            r.id.toString().startsWith('temp_') && 
                            r.fecha === limiteData.fecha && 
                            Math.abs(r.gastoReal - limiteData.gastoReal) < 0.01
                        );
                        
                        if (temporalIndex !== -1) {
                            console.log("🔁 Reemplazando nuestro registro temporal");
                            registrosLimites[temporalIndex] = {
                                ...limiteData,
                                sincronizando: false,
                                id: limiteData.id
                            };
                        } 
                        else if (!registrosLimites.some(r => r.id === limiteData.id)) {
                            console.log("➕ Nuevo registro de otro dispositivo");
                            registrosLimites.push({
                                ...limiteData,
                                sincronizando: false
                            });
                            mostrarNotificacion(`📌 Nuevo registro de límite`, 'info');
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
            
            registrosLimites.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            actualizarUILimites();
            saveLimitesToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener:", error);
        });
    
    // Listener para pagos de límites
    unsubscribePagosLimites = db.collection('pagos_limites')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            if (ignoreNextSnapshot) {
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("💸 Cambios en pagos de límites:", snapshot.docChanges().length);
            
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
                        if (!pagosLimites.some(p => p.id === pagoData.id)) {
                            pagosLimites.push(pagoData);
                            mostrarNotificacion(`💸 Nuevo pago registrado`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = pagosLimites.findIndex(p => p.id === pagoData.id);
                        if (indexMod !== -1) pagosLimites[indexMod] = pagoData;
                        break;
                    case 'removed':
                        pagosLimites = pagosLimites.filter(p => p.id !== pagoData.id);
                        mostrarNotificacion(`📌 Un pago fue eliminado`, 'warning');
                        break;
                }
            });
            
            pagosLimites.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            actualizarUILimites();
            saveLimitesToLocalStorage();
        }, (error) => {
            console.error("❌ Error en listener de pagos:", error);
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
            persona: 'ambos',
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        ignoreNextSnapshot = true;
        const docRef = await db.collection('limites').add(limiteData);
        
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

async function savePagoLimiteToFirebase(pago) {
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
        const docRef = await db.collection('pagos_limites').add(pagoData);
        
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

async function deleteLimiteFromFirebase(id) {
    try {
        ignoreNextSnapshot = true;
        await firebase.firestore().collection('limites').doc(id).delete();
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

async function deletePagoLimiteFromFirebase(id) {
    try {
        ignoreNextSnapshot = true;
        await firebase.firestore().collection('pagos_limites').doc(id).delete();
        
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

function saveLimitesToLocalStorage() {
    try {
        localStorage.setItem('limites_registros', JSON.stringify(registrosLimites));
        localStorage.setItem('pagos_limites', JSON.stringify(pagosLimites));
        localStorage.setItem('gastos_config', JSON.stringify(configLimites));
    } catch (error) {
        console.error("Error guardando:", error);
    }
}

function loadLimitesFromLocalStorage() {
    try {
        const savedLimites = localStorage.getItem('limites_registros');
        const savedPagos = localStorage.getItem('pagos_limites');
        const savedConfig = localStorage.getItem('gastos_config');
        
        if (savedLimites) registrosLimites = JSON.parse(savedLimites);
        if (savedPagos) pagosLimites = JSON.parse(savedPagos);
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
    configurarFiltrosLimites();
    configurarSelectorFecha();
    configurarBarraInferior();
    configurarVerMasLimites(); // ✅ Agregar esta línea
    actualizarNombresEnUILimites();
    
    const fechaLocal = obtenerFechaLocal();
    document.getElementById('fecha-limite').value = fechaLocal;
    document.getElementById('pago-individual-fecha').value = fechaLocal;
}

function obtenerFechaLocal() {
    const ahora = new Date();
    return new Date(ahora.getTime() - (ahora.getTimezoneOffset() * 60000))
        .toISOString().split('T')[0];
}

function actualizarNombresEnUILimites() {
    if (configLimites.nombres) {
        document.getElementById('name-persona1-result').textContent = configLimites.nombres.persona1;
        document.getElementById('name-persona2-result').textContent = configLimites.nombres.persona2;
        
        document.getElementById('deuda-nombre-yo').textContent = configLimites.nombres.persona1;
        document.getElementById('deuda-nombre-ella').textContent = configLimites.nombres.persona2;
    }
}

// ====================
// SELECTOR DE FECHA
// ====================

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
// FUNCIONES DE CÁLCULO FIFO
// ====================

function obtenerFechaFiltro() {
    const selector = document.getElementById('deuda-fecha-selector').value;
    const fechaCustom = document.getElementById('deuda-fecha-custom').value;
    
    if (selector === 'today') return obtenerFechaLocal();
    if (selector === 'yesterday') {
        const ayer = new Date();
        ayer.setDate(ayer.getDate() - 1);
        return new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000))
            .toISOString().split('T')[0];
    }
    if (selector === 'custom' && fechaCustom) return fechaCustom;
    return null;
}

// ====================
// FUNCIÓN COMPLETA DE CÁLCULO FIFO CORREGIDA
// ====================

function calcularDeudasFIFO() {
    const fechaFiltro = obtenerFechaFiltro();
    
    // PASO 1: Obtener todas las fechas únicas con registros
    const fechas = [...new Set(registrosLimites.map(r => r.fecha))].sort();
    
    // PASO 2: Estructura para guardar deudas por fecha y persona
    const deudasPorFecha = {};
    const registrosPorFecha = {};
    
    fechas.forEach(fecha => {
        const registrosFecha = registrosLimites.filter(r => r.fecha === fecha);
        registrosPorFecha[fecha] = registrosFecha;
        
        // Calcular el monto TOTAL de ahorro en esta fecha
        const ahorroTotalFecha = registrosFecha.reduce((sum, r) => sum + r.ahorroTotal, 0);
        
        // AMBOS deben el mismo monto (la mitad del ahorroTotal)
        const debeCadaUno = ahorroTotalFecha / 2;
        
        deudasPorFecha[fecha] = {
            persona1: debeCadaUno,
            persona2: debeCadaUno,
            ahorroTotal: ahorroTotalFecha
        };
    });
    
    // PASO 3: Aplicar pagos FIFO
    const deudasRestantes = JSON.parse(JSON.stringify(deudasPorFecha));
    
    // Obtener todas las fechas ordenadas (más antigua primero) para FIFO
    const fechasOrdenadas = [...fechas].sort(); // Ya están ordenadas por .sort()
    
    ['persona1', 'persona2'].forEach(persona => {
        // Separar pagos específicos (con fecha) y globales (sin fecha)
        const pagosEspecificos = pagosLimites
            .filter(p => p.persona === persona && p.fecha !== null);
        
        const pagosGlobales = pagosLimites
            .filter(p => p.persona === persona && p.fecha === null)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Orden FIFO por timestamp
        
        // PRIMERO: Aplicar pagos específicos (van directo a su fecha)
        pagosEspecificos.forEach(pago => {
            if (deudasRestantes[pago.fecha]) {
                const deudaActual = deudasRestantes[pago.fecha][persona];
                const pagoAplicado = Math.min(deudaActual, pago.monto);
                deudasRestantes[pago.fecha][persona] = parseFloat((deudaActual - pagoAplicado).toFixed(2));
            }
        });
        
        // SEGUNDO: Aplicar pagos globales en orden FIFO estricto
        pagosGlobales.forEach(pago => {
            let montoRestante = pago.monto;
            
            // Recorrer fechas de la MÁS ANTIGUA a la MÁS NUEVA
            for (const fecha of fechasOrdenadas) {
                if (montoRestante <= 0.01) break;
                
                const deudaActual = deudasRestantes[fecha][persona];
                if (deudaActual > 0.01) {
                    const pagoAplicado = Math.min(deudaActual, montoRestante);
                    deudasRestantes[fecha][persona] = parseFloat((deudaActual - pagoAplicado).toFixed(2));
                    montoRestante = parseFloat((montoRestante - pagoAplicado).toFixed(2));
                }
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

    // Totales generales
    const totalGenerado = registrosLimites.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalPagado = pagosLimites.reduce((sum, p) => sum + p.monto, 0);
    const totalPendiente = Math.max(0, totalGenerado - totalPagado); // ✅ Nunca negativo
    
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
        totalPendiente: totalPendiente,
        
        deudasRestantes,
        deudasOriginales: deudasPorFecha,
        fechas
    };
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

// ====================
// FUNCIONES DE PAGO
// ====================

function abrirFormularioPago(persona) {
    personaPagoSeleccionada = persona;
    const nombre = persona === 'persona1' ? configLimites.nombres.persona1 : configLimites.nombres.persona2;
    
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
    const nombre = persona === 'persona1' ? configLimites.nombres.persona1 : configLimites.nombres.persona2;
    
    if (!monto || parseFloat(monto) <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    const selectorFecha = document.getElementById('deuda-fecha-selector').value;
    const fechaFiltro = obtenerFechaFiltro();
    const deudaActual = calcularDeudaPersonaPorFecha(persona, fechaFiltro);
    
    if (parseFloat(monto) > deudaActual + 0.01) {
        mostrarNotificacion(`No puedes pagar más de lo que debes (S/${deudaActual.toFixed(2)})`, 'error');
        return;
    }
    
    document.getElementById('modal-pago-detalle-limites').textContent = `${nombre} va a pagar S/${parseFloat(monto).toFixed(2)}`;
    document.getElementById('modal-pago-monto-limites').textContent = `S/${parseFloat(monto).toFixed(2)}`;
    
    document.getElementById('modal-confirmar-pago-limites').classList.add('active');
}

async function guardarPago() {
    const monto = parseFloat(document.getElementById('pago-individual-monto').value);
    const descripcion = document.getElementById('pago-individual-descripcion').value.trim();
    const fecha = document.getElementById('pago-individual-fecha').value;
    const selectorFecha = document.getElementById('deuda-fecha-selector').value;
    
    const persona = personaPagoSeleccionada;
    const nombrePersona = persona === 'persona1' ? configLimites.nombres.persona1 : configLimites.nombres.persona2;
    
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
    
    pagosLimites.unshift(nuevoPago);
    actualizarUILimites();
    
    cerrarFormularioPago();
    document.getElementById('modal-confirmar-pago-limites').classList.remove('active');
    
    mostrarNotificacion(`✅ ${nombrePersona} pagó S/${monto.toFixed(2)}`, 'success');
    
    try {
        await savePagoLimiteToFirebase(nuevoPago);
    } catch (error) {
        console.error("Error guardando pago:", error);
        mostrarNotificacion('⚠️ Pago guardado localmente', 'warning');
    }
    
    saveLimitesToLocalStorage();
}

async function eliminarPagoLimite(id) {
    if (!confirm('¿Eliminar este registro de pago?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const pagoEliminado = pagosLimites.find(p => p.id === id);
    pagosLimites = pagosLimites.filter(p => p.id !== id);
    actualizarUILimites();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deletePagoLimiteFromFirebase(id);
            mostrarNotificacion('✅ Pago eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Pago eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        if (pagoEliminado) {
            pagosLimites.push(pagoEliminado);
            actualizarUILimites();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveLimitesToLocalStorage();
}

function mostrarPagos() {
    const container = document.getElementById('pagos-container');
    const emptyState = document.getElementById('empty-state-pagos');
    
    if (!container) return;
    
    if (pagosLimites.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    // 🔥 ORDENAR POR TIMESTAMP (más reciente arriba)
    const pagosOrdenados = [...pagosLimites].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
    });
    
    let html = '';
    
    pagosOrdenados.slice(0, 20).forEach(pago => {
        const nombrePersona = pago.persona === 'persona1' ? configLimites.nombres.persona1 : configLimites.nombres.persona2;
        const idSeguro = pago.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        // Fecha del gasto (la que el usuario eligió)
        let fechaGastoFormateada = '📅 Global';
        if (pago.fecha) {
            const fechaGasto = new Date(pago.fecha + 'T00:00:00');
            fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }
        
        // Fecha de la acción (timestamp de creación)
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
                    <button class="delete-btn" onclick="eliminarPagoLimite('${idSeguro}')" title="Eliminar pago">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ====================
// FUNCIÓN DE CÁLCULO DE LÍMITE
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
        // Sin límite: todo el gasto es ahorro
        exceso = gastoReal;
        ahorroTotal = gastoReal;
        ahorroPorPersona = gastoReal / 2;
    } else {
        exceso = Math.max(gastoReal - montoLimite, 0);
        
        if (exceso > 0) {
            // REDONDEO AL SIGUIENTE MÚLTIPLO DE 5
            let excesoRedondeado = Math.ceil(exceso / 5) * 5;
            ahorroTotal = excesoRedondeado;
            ahorroPorPersona = ahorroTotal / 2;
            
            // Si tiene decimal .5, redondear hacia arriba
            if (ahorroPorPersona % 1 !== 0) {
                ahorroPorPersona = Math.ceil(ahorroPorPersona);
            }
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
// FUNCIONES DE REGISTROS
// ====================

async function guardarRegistroLimite() {
    if (!window.calculoTemporalLimite) {
        mostrarNotificacion('Primero calcula un resultado', 'error');
        return;
    }
    
    const calculo = window.calculoTemporalLimite;
    
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
        persona: 'ambos',
        timestamp: new Date(),
        sincronizando: true
    };
    
    registrosLimites.unshift(nuevoRegistro);
    actualizarUILimites();
    
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

// ====================
// FUNCIONES DE FILTROS
// ====================

function configurarFiltrosLimites() {
    const busquedaInput = document.getElementById('busqueda-limites');
    const filtroTipo = document.getElementById('filtro-tipo-limite');
    const filtroFecha = document.getElementById('filtro-fecha-limite');
    const rangoFechas = document.getElementById('rango-fechas-limite');
    const fechaDesde = document.getElementById('fecha-desde-limite');
    const fechaHasta = document.getElementById('fecha-hasta-limite');
    const btnAplicarFecha = document.getElementById('aplicar-fecha-limite');
    const btnLimpiar = document.getElementById('limpiar-filtros-limites');
    const btnLimpiarTodo = document.getElementById('limpiar-todo-historial-limites');
    const btnExportar = document.getElementById('export-limites-btn');
    
    if (!busquedaInput) {
        console.warn("No se encontraron los filtros de límites");
        return;
    }
    
    busquedaInput.addEventListener('input', aplicarFiltrosLimites);
    filtroTipo.addEventListener('change', aplicarFiltrosLimites);
    filtroFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            rangoFechas.style.display = 'block';
        } else {
            rangoFechas.style.display = 'none';
            aplicarFiltrosLimites();
        }
    });
    
    btnAplicarFecha.addEventListener('click', aplicarFiltrosLimites);
    
    btnLimpiar.addEventListener('click', function() {
        busquedaInput.value = '';
        filtroTipo.value = '';
        filtroFecha.value = 'all';
        rangoFechas.style.display = 'none';
        fechaDesde.value = '';
        fechaHasta.value = '';
        aplicarFiltrosLimites();
        mostrarNotificacion('Filtros limpiados', 'info');
    });
    
    btnLimpiarTodo.addEventListener('click', mostrarModalLimpiarTodoLimites);
    
    if (btnExportar) {
        btnExportar.addEventListener('click', exportarRegistrosLimites);
    }
    
    const cancelarBtn = document.getElementById('cancelar-limpiar-todo-limites');
    const confirmarBtn = document.getElementById('confirmar-limpiar-todo-limites');
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', function() {
            document.getElementById('modal-limpiar-todo-limites').classList.remove('active');
        });
    }
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', limpiarTodoHistorialLimites);
    }
}

// ====================
// FUNCIÓN APLICAR FILTROS (ACTUALIZADA)
// ====================

function aplicarFiltrosLimites() {
    const busqueda = document.getElementById('busqueda-limites')?.value.toLowerCase() || '';
    const tipo = document.getElementById('filtro-tipo-limite')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha-limite')?.value || 'all';
    const fechaDesde = document.getElementById('fecha-desde-limite')?.value || '';
    const fechaHasta = document.getElementById('fecha-hasta-limite')?.value || '';
    
    let registrosFiltrados = [...registrosLimites];
    
    // Filtrar por búsqueda
    if (busqueda) {
        registrosFiltrados = registrosFiltrados.filter(r => 
            r.descripcion.toLowerCase().includes(busqueda)
        );
    }
    
    // Filtrar por tipo (cumplido/exceso)
    if (tipo === 'cumplido') {
        registrosFiltrados = registrosFiltrados.filter(r => r.dentroDeLimite === true);
    } else if (tipo === 'exceso') {
        registrosFiltrados = registrosFiltrados.filter(r => r.exceso > 0);
    }
    
    // Filtrar por fecha del GASTO (no por timestamp)
    if (filtroFecha !== 'all') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        switch(filtroFecha) {
            case 'today':
                const hoyStr = hoy.toISOString().split('T')[0];
                registrosFiltrados = registrosFiltrados.filter(r => r.fecha === hoyStr);
                break;
            case 'week':
                const inicioSemana = obtenerInicioSemana();
                registrosFiltrados = registrosFiltrados.filter(r => new Date(r.fecha) >= new Date(inicioSemana));
                break;
            case 'month':
                const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                registrosFiltrados = registrosFiltrados.filter(r => new Date(r.fecha) >= inicioMes);
                break;
            case 'custom':
                if (fechaDesde && fechaHasta) {
                    const desde = new Date(fechaDesde);
                    const hasta = new Date(fechaHasta);
                    hasta.setHours(23, 59, 59, 999);
                    registrosFiltrados = registrosFiltrados.filter(r => {
                        const fechaR = new Date(r.fecha);
                        return fechaR >= desde && fechaR <= hasta;
                    });
                }
                break;
        }
    }
    
    // Actualizar contadores
    const mostrandoEl = document.getElementById('filtro-mostrando-limites');
    const totalEl = document.getElementById('filtro-total-limites');
    const totalMontoEl = document.getElementById('filtro-total-monto-limites');
    
    if (mostrandoEl) mostrandoEl.textContent = registrosFiltrados.length;
    if (totalEl) totalEl.textContent = registrosLimites.length;
    
    const totalAhorro = registrosFiltrados.reduce((sum, r) => sum + r.ahorroTotal, 0);
    if (totalMontoEl) totalMontoEl.textContent = `S/${totalAhorro.toFixed(2)}`;
    
    // 🔥 Cargar registros con orden por timestamp
    cargarRegistrosLimitesFiltrados(registrosFiltrados);
    
    // Actualizar totales generales
    const totalAhorroForzado = document.getElementById('total-ahorro-forzado');
    const totalDiasExceso = document.getElementById('total-dias-exceso');
    
    if (totalAhorroForzado) {
        totalAhorroForzado.textContent = `S/${registrosLimites.reduce((sum, r) => sum + r.ahorroTotal, 0).toFixed(2)}`;
    }
    if (totalDiasExceso) {
        totalDiasExceso.textContent = registrosLimites.filter(r => r.exceso > 0).length;
    }
}

// ====================
// FUNCIÓN PARA CARGAR REGISTROS FILTRADOS (CON ORDEN POR TIMESTAMP)
// ====================

function cargarRegistrosLimitesFiltrados(registrosFiltrados) {
    const container = document.getElementById('registros-container');
    const emptyState = document.getElementById('empty-state-limites');
    const totales = document.getElementById('totales-limites');
    
    if (!container) return;
    
    if (registrosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: block;">
                <i class="far fa-search"></i>
                <h4>No se encontraron registros</h4>
                <p>Intenta con otros filtros.</p>
            </div>
        `;
        if (emptyState) emptyState.style.display = 'none';
        if (totales) totales.style.display = 'none';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (totales) totales.style.display = 'block';
    
    // 🔥 ORDENAR POR TIMESTAMP (más reciente primero)
    const registrosOrdenados = [...registrosFiltrados].sort((a, b) => {
        // Si tienen timestamp, usarlo
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        
        // Si ambos tienen timestamp, ordenar por eso
        if (timeA && timeB) return timeB - timeA;
        
        // Si no, usar fecha como fallback
        const fechaA = new Date(a.fecha + 'T00:00:00').getTime();
        const fechaB = new Date(b.fecha + 'T00:00:00').getTime();
        return fechaB - fechaA;
    });
    
    let html = '';
    
    registrosOrdenados.forEach(registro => {
        // Formatear fecha de visualización
        const fechaGasto = new Date(registro.fecha + 'T00:00:00');
        const fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit' 
        });
        
        // 🔥 Obtener información del timestamp (cuándo se registró)
        let fechaRegistroFormateada = '', horaRegistro = '';
        if (registro.timestamp) {
            const fechaRegistro = new Date(registro.timestamp);
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            
            horaRegistro = fechaRegistro.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
            
            if (fechaRegistro.toDateString() === hoy.toDateString()) {
                fechaRegistroFormateada = 'hoy';
            } else if (fechaRegistro.toDateString() === ayer.toDateString()) {
                fechaRegistroFormateada = 'ayer';
            } else {
                fechaRegistroFormateada = fechaRegistro.toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: '2-digit' 
                });
            }
        }
        
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
                    <div class="gasto-fecha">
                        <span class="badge-fecha-gasto">${fechaGastoFormateada}</span>
                        <span class="badge-accion">
                            <i class="fas fa-clock"></i> registrado 
                            ${fechaRegistroFormateada} ${horaRegistro}
                        </span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarModalLimpiarTodoLimites() {
    const totalRegistros = document.getElementById('total-registros-eliminar-limites');
    const totalMonto = document.getElementById('monto-total-eliminar-limites');
    
    if (totalRegistros) totalRegistros.textContent = registrosLimites.length;
    
    const sumaTotal = registrosLimites.reduce((sum, r) => sum + r.ahorroTotal, 0);
    if (totalMonto) totalMonto.textContent = `S/${sumaTotal.toFixed(2)}`;
    
    document.getElementById('modal-limpiar-todo-limites').classList.add('active');
}

async function limpiarTodoHistorialLimites() {
    mostrarNotificacion('Eliminando todo el historial...', 'info');
    
    const idsFirebase = registrosLimites.filter(r => !r.id.toString().startsWith('temp_')).map(r => r.id);
    for (const id of idsFirebase) {
        try {
            await deleteLimiteFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando:", id);
        }
    }
    
    const idsPagos = pagosLimites.filter(p => !p.id.toString().startsWith('temp_')).map(p => p.id);
    for (const id of idsPagos) {
        try {
            await deletePagoLimiteFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando pago:", id);
        }
    }
    
    registrosLimites = [];
    pagosLimites = [];
    actualizarUILimites();
    saveLimitesToLocalStorage();
    
    document.getElementById('modal-limpiar-todo-limites').classList.remove('active');
    mostrarNotificacion('Todo el historial eliminado', 'success');
}

function exportarRegistrosLimites() {
    const data = {
        limites: registrosLimites,
        pagos: pagosLimites,
        config: configLimites
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `limites_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Datos exportados', 'success');
}

// ====================
// FUNCIONES DE CONFIGURACIÓN DE EVENTOS
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
    
    // Botones de pago
    document.querySelectorAll('.btn-pagar-individual').forEach(btn => {
        btn.addEventListener('click', function() {
            const persona = this.dataset.persona;
            abrirFormularioPago(persona);
        });
    });
    
    document.getElementById('cerrar-pago-form').addEventListener('click', cerrarFormularioPago);
    document.getElementById('cancelar-pago-individual').addEventListener('click', cerrarFormularioPago);
    document.getElementById('confirmar-pago-individual').addEventListener('click', mostrarModalConfirmacionPago);
    
    document.getElementById('confirmar-pago-final-limites').addEventListener('click', guardarPago);
    document.getElementById('cancelar-confirmacion-limites').addEventListener('click', () => {
        document.getElementById('modal-confirmar-pago-limites').classList.remove('active');
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

function mostrarInfoLimiteSeleccionado() {
    const opcionInfo = document.getElementById('opcion-seleccionada-info');
    const texto = document.getElementById('opcion-seleccionada-texto');
    const tipo = document.getElementById('opcion-seleccionada-tipo');
    
    if (!opcionInfo) return;
    
    let nombreLimite = '';
    let tipoLimite = '';
    
    switch(limiteSeleccionado) {
        case 30:
            nombreLimite = 'S/30.00';
            tipoLimite = 'Estricto';
            break;
        case 20:
            nombreLimite = 'S/20.00';
            tipoLimite = 'Moderado';
            break;
        case 10:
            nombreLimite = 'S/10.00';
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
    aplicarFiltrosLimites();
    actualizarDeudasPorFecha();
    mostrarPagos();
}

function actualizarResumenLimites() {
    const hoy = obtenerFechaLocal();
    const inicioSemana = obtenerInicioSemana();
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const registrosHoy = registrosLimites.filter(r => r.fecha === hoy);
    const registrosSemana = registrosLimites.filter(r => new Date(r.fecha) >= new Date(inicioSemana));
    const registrosMes = registrosLimites.filter(r => new Date(r.fecha) >= inicioMes);
    
    const totalHoy = registrosHoy.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalSemana = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalMes = registrosMes.reduce((sum, r) => sum + r.ahorroTotal, 0);
    
    document.getElementById('summary-hoy-limite').textContent = `S/${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana-limite').textContent = `S/${totalSemana.toFixed(2)}`;
    document.getElementById('summary-mes-limite').textContent = `S/${totalMes.toFixed(2)}`;
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
    
    setTimeout(() => notificacion.classList.remove('show'), 2500);
}

function mostrarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function ocultarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
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

// Hacer funciones globales para los onclick
window.eliminarRegistroLimite = eliminarRegistroLimite;
window.eliminarPagoLimite = eliminarPagoLimite;

console.log("✅ app-limites.js cargado correctamente con FIFO");

// ====================
// FUNCIÓN PARA VER MÁS REGISTROS
// ====================

function configurarVerMasLimites() {
    const verMasBtn = document.getElementById('ver-mas-limites');
    const registrosContainer = document.getElementById('registros-container');
    
    if (!verMasBtn || !registrosContainer) {
        console.log("No se encontró el botón ver más o el container");
        return;
    }
    
    let expandido = false;
    const alturaNormal = '300px';
    
    // Establecer altura inicial
    registrosContainer.style.maxHeight = alturaNormal;
    registrosContainer.style.overflowY = 'auto';
    
    verMasBtn.addEventListener('click', function() {
        expandido = !expandido;
        
        if (expandido) {
            registrosContainer.style.maxHeight = 'none';
            registrosContainer.style.overflowY = 'visible';
            this.innerHTML = '<i class="fas fa-chevron-up"></i> Ver menos registros';
        } else {
            registrosContainer.style.maxHeight = alturaNormal;
            registrosContainer.style.overflowY = 'auto';
            this.innerHTML = '<i class="fas fa-chevron-down"></i> Ver más registros';
        }
    });
}