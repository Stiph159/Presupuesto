// File: app.js - VERSIÓN CON BALANCE 50/50 Y FILTROS
// ========================================================

// Variables globales
let gastos = [];
let pagos = [];
let config = {
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let personaSeleccionada = 'persona1';
let categoriaSeleccionada = 'otros';
let chartInstance = null;
let unsubscribeGastos = null;
let unsubscribePagos = null;
let unsubscribeConfig = null;
let ignoreNextSnapshot = false;

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebase() {
    try {
        console.log("🔑 Inicializando Firebase...");
        
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

function setupRealtimeListeners() {
    if (unsubscribeGastos) unsubscribeGastos();
    if (unsubscribePagos) unsubscribePagos();
    if (unsubscribeConfig) unsubscribeConfig();
    
    const db = firebase.firestore();
    
    // Listener para gastos
    unsubscribeGastos = db.collection('gastos')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            if (ignoreNextSnapshot) {
                console.log("⏸️ Ignorando snapshot por operación propia");
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("🔔 Cambios en gastos:", snapshot.docChanges().length);
            
            const firebaseIds = new Set();
            snapshot.docs.forEach(doc => firebaseIds.add(doc.id));
            
            gastos = gastos.filter(gasto => {
                if (gasto.id.toString().startsWith('temp_')) return true;
                if (!firebaseIds.has(gasto.id)) {
                    console.log("🗑️ Eliminando gasto remoto:", gasto.id);
                    return false;
                }
                return true;
            });
            
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
                        const temporalIndex = gastos.findIndex(g => 
                            g.id.toString().startsWith('temp_') && 
                            Math.abs(g.monto - docData.monto) < 0.01 &&
                            g.fecha === docData.fecha && 
                            g.descripcion === docData.descripcion &&
                            g.persona === docData.persona
                        );
                        
                        if (temporalIndex !== -1) {
                            console.log("🔄 Reemplazando gasto temporal");
                            gastos[temporalIndex] = {
                                ...docData,
                                sincronizando: false,
                                id: docData.id
                            };
                        } 
                        else if (!gastos.some(g => g.id === docData.id)) {
                            console.log("➕ Nuevo gasto de otro dispositivo");
                            gastos.push({
                                ...docData,
                                sincronizando: false
                            });
                            mostrarNotificacion(`💰 Nuevo gasto de S/${docData.monto.toFixed(2)}`, 'info');
                        }
                        break;
                        
                    case 'modified':
                        const indexMod = gastos.findIndex(g => g.id === docData.id);
                        if (indexMod !== -1) {
                            gastos[indexMod] = {
                                ...docData,
                                sincronizando: false,
                                error: false
                            };
                        }
                        break;
                        
                    case 'removed':
                        gastos = gastos.filter(g => g.id !== docData.id);
                        mostrarNotificacion(`📌 Un gasto fue eliminado`, 'warning');
                        break;
                }
            });
            
            gastos.sort((a, b) => {
                const dateA = a.timestamp || new Date(a.fecha);
                const dateB = b.timestamp || new Date(b.fecha);
                return dateB - dateA;
            });
            
            actualizarUI();
            saveToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener de gastos:", error);
        });
    
    // Listener para pagos
    unsubscribePagos = db.collection('pagos')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            console.log("💸 Cambios en pagos:", snapshot.docChanges().length);
            
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
                        if (!pagos.some(p => p.id === pagoData.id)) {
                            pagos.push(pagoData);
                            mostrarNotificacion(`💸 Nuevo pago registrado`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = pagos.findIndex(p => p.id === pagoData.id);
                        if (indexMod !== -1) pagos[indexMod] = pagoData;
                        break;
                    case 'removed':
                        pagos = pagos.filter(p => p.id !== pagoData.id);
                        mostrarNotificacion(`📌 Un pago fue eliminado`, 'warning');
                        break;
                }
            });
            
            pagos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            actualizarBalance();
            mostrarPagos();
            saveToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener de pagos:", error);
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
        
        ignoreNextSnapshot = true;
        const docRef = await db.collection('gastos').add(gastoData);
        console.log("✅ Gasto guardado con ID:", docRef.id);
        
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

async function deleteGastoFromFirebase(id) {
    try {
        ignoreNextSnapshot = true;
        await firebase.firestore().collection('gastos').doc(id).delete();
        console.log("✅ Gasto eliminado:", id);
        
        setTimeout(() => {
            ignoreNextSnapshot = false;
        }, 2000);
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        ignoreNextSnapshot = false;
        throw error;
    }
}

async function savePagoToFirebase(pago) {
    try {
        const db = firebase.firestore();
        const pagoData = {
            fecha: pago.fecha,
            monto: pago.monto,
            descripcion: pago.descripcion,
            deudor: pago.deudor,
            acreedor: pago.acreedor,
            completado: pago.completado || false,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('pagos').add(pagoData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando pago:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveToLocalStorage() {
    try {
        localStorage.setItem('nuestros_gastos', JSON.stringify(gastos));
        localStorage.setItem('nuestros_pagos', JSON.stringify(pagos));
        localStorage.setItem('gastos_config', JSON.stringify(config));
    } catch (error) {
        console.error("Error guardando en localStorage:", error);
    }
}

function loadFromLocalStorage() {
    try {
        const savedGastos = localStorage.getItem('nuestros_gastos');
        const savedPagos = localStorage.getItem('nuestros_pagos');
        const savedConfig = localStorage.getItem('gastos_config');
        
        if (savedGastos) gastos = JSON.parse(savedGastos);
        if (savedPagos) pagos = JSON.parse(savedPagos);
        if (savedConfig) config = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("🚀 Iniciando aplicación 50/50...");
    
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
    configurarFiltrosNuevos();
    configurarBalanceEventos();
    actualizarNombresEnUI();
    
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fecha-gasto').value = hoy;
    document.getElementById('pago-fecha').value = hoy;
    
    inicializarGrafico();
}

// ====================
// FUNCIONES DE BALANCE 50/50
// ====================



function configurarBalanceEventos() {
    const selectorFecha = document.getElementById('balance-fecha-selector');
    const btnPagar = document.getElementById('btn-pagar-deuda');
    const btnNuevoPago = document.getElementById('btn-nuevo-pago');
    const pagoForm = document.getElementById('pago-form');
    const cancelarPago = document.getElementById('cancelar-pago');
    const guardarPago = document.getElementById('guardar-pago');
    const pagoQuienPaga = document.getElementById('pago-quien-paga');
    const pagoQuienRecibe = document.getElementById('pago-quien-recibe');
    const fechaCustom = document.getElementById('balance-fecha-custom');
    
    if (!selectorFecha) return;
    
    // Mostrar/ocultar selector de fecha personalizado
    selectorFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            fechaCustom.style.display = 'block';
            if (!fechaCustom.value) {
                fechaCustom.value = new Date().toISOString().split('T')[0];
            }
            actualizarBalance();
        } else {
            fechaCustom.style.display = 'none';
            actualizarBalance();
        }
    });
    
    // Actualizar balance cuando cambie la fecha personalizada
    fechaCustom.addEventListener('change', function() {
        actualizarBalance();
    });
    
    // Botón pagar con fecha inteligente
    btnPagar.addEventListener('click', function() {
        const selectorFecha = document.getElementById('balance-fecha-selector');
        const fechaSeleccionada = selectorFecha.value;
        const fechaCustom = document.getElementById('balance-fecha-custom').value;
        const balance = calcularBalance(obtenerFechaBalance());
        
        // Determinar la fecha de pago según lo que el usuario está viendo
        let fechaPago = '';
        const hoy = new Date().toISOString().split('T')[0];
        
        switch(fechaSeleccionada) {
            case 'today':
                fechaPago = hoy;
                break;
            case 'yesterday':
                const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                fechaPago = ayer;
                break;
            case 'custom':
                fechaPago = fechaCustom || hoy;
                break;
            default:
                fechaPago = hoy;
        }
        
        // Establecer la fecha en el formulario de pago
        document.getElementById('pago-fecha').value = fechaPago;
        
        // Determinar quién debe pagar a quién
        if (balance.deudaEllaATu > 0.01) {
            pagoQuienPaga.value = 'persona2';
            pagoQuienRecibe.value = 'persona1';
            document.getElementById('pago-monto').value = balance.deudaEllaATu.toFixed(2);
        } else if (balance.deudaTuAElla > 0.01) {
            pagoQuienPaga.value = 'persona1';
            pagoQuienRecibe.value = 'persona2';
            document.getElementById('pago-monto').value = balance.deudaTuAElla.toFixed(2);
        }
        
        // Mostrar el formulario
        const fechaMostrar = new Date(fechaPago).toLocaleDateString('es-ES');
        mostrarNotificacion(`Pagando deuda del ${fechaMostrar}`, 'info');
        pagoForm.style.display = 'block';
    });
    
    // Botón nuevo pago manual
    btnNuevoPago.addEventListener('click', function() {
        document.getElementById('pago-fecha').value = new Date().toISOString().split('T')[0];
        pagoForm.style.display = 'block';
    });
    
    // Cancelar pago
    cancelarPago.addEventListener('click', function() {
        pagoForm.style.display = 'none';
        limpiarFormularioPago();
    });
    
    // Guardar pago
    guardarPago.addEventListener('click', function() {
        mostrarModalConfirmacionPago();
    });
    
    // Confirmar pago (modal)
    document.getElementById('confirmar-pago-final').addEventListener('click', function() {
        guardarPagoEnFirebase();
    });
    
    document.getElementById('cancelar-confirmacion').addEventListener('click', function() {
        document.getElementById('modal-confirmar-pago').classList.remove('active');
    });
    
    // Cambiar opciones de quién recibe cuando cambia quién paga
    pagoQuienPaga.addEventListener('change', function() {
        const quienPaga = this.value;
        const quienRecibe = document.getElementById('pago-quien-recibe');
        
        if (quienPaga === 'persona1') {
            quienRecibe.value = 'persona2';
        } else {
            quienRecibe.value = 'persona1';
        }
    });
}

function obtenerFechaBalance() {
    const selector = document.getElementById('balance-fecha-selector').value;
    const fechaCustom = document.getElementById('balance-fecha-custom').value;
    const hoy = new Date();
    
    switch(selector) {
        case 'today':
            return { 
                tipo: 'today', 
                fecha: hoy.toISOString().split('T')[0],
                descripcion: 'Hoy'
            };
        case 'yesterday':
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            return { 
                tipo: 'yesterday', 
                fecha: ayer.toISOString().split('T')[0],
                descripcion: 'Ayer'
            };
        case 'custom':
            if (fechaCustom) {
                const fecha = new Date(fechaCustom + 'T00:00:00');
                return { 
                    tipo: 'custom', 
                    fecha: fechaCustom,
                    descripcion: fecha.toLocaleDateString('es-ES', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long'
                    })
                };
            } else {
                return { 
                    tipo: 'today', 
                    fecha: hoy.toISOString().split('T')[0],
                    descripcion: 'Hoy'
                };
            }
        default:
            return { 
                tipo: 'today', 
                fecha: hoy.toISOString().split('T')[0],
                descripcion: 'Hoy'
            };
    }
}

function calcularBalance(rango) {
    let gastosFiltrados = [];
    
    // CORREGIDO: Manejar correctamente los diferentes tipos de rango
    if (rango.tipo === 'today' || rango.tipo === 'yesterday' || rango.tipo === 'custom') {
        // Para fechas específicas, filtrar por fecha exacta
        gastosFiltrados = gastos.filter(g => g.fecha === rango.fecha);
    } else {
        // Para rangos (week, month), filtrar por rango de fechas
        gastosFiltrados = gastos.filter(g => {
            const fechaG = new Date(g.fecha);
            return fechaG >= rango.fechaInicio && fechaG <= rango.fechaFin;
        });
    }
    
    // Filtrar pagos de la misma manera
    const pagosFiltrados = pagos.filter(p => {
        if (rango.tipo === 'today' || rango.tipo === 'yesterday' || rango.tipo === 'custom') {
            return p.fecha === rango.fecha;
        } else {
            const fechaP = new Date(p.fecha);
            return fechaP >= rango.fechaInicio && fechaP <= rango.fechaFin;
        }
    });
    
    const totalTu = gastosFiltrados.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const totalElla = gastosFiltrados.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    let deudaTuAElla = 0;
    let deudaEllaATu = 0;
    
    pagosFiltrados.forEach(p => {
        if (p.deudor === 'persona1' && p.acreedor === 'persona2') {
            deudaTuAElla -= p.monto;
        } else if (p.deudor === 'persona2' && p.acreedor === 'persona1') {
            deudaEllaATu -= p.monto;
        }
    });
    
    const diferenciaGastos = totalTu - totalElla;
    
    if (diferenciaGastos > 0) {
        deudaEllaATu += diferenciaGastos / 2;
    } else if (diferenciaGastos < 0) {
        deudaTuAElla += Math.abs(diferenciaGastos) / 2;
    }
    
    deudaTuAElla = Math.max(0, deudaTuAElla);
    deudaEllaATu = Math.max(0, deudaEllaATu);
    
    const totalGastos = totalTu + totalElla;
    const meta = totalGastos / 2;
    
    return {
        totalTu,
        totalElla,
        meta,
        deudaTuAElla,
        deudaEllaATu,
        diferencia: Math.abs(deudaTuAElla - deudaEllaATu)
    };
}

function actualizarBalance() {
    const rango = obtenerFechaBalance();
    const balance = calcularBalance(rango);
    const nombreTu = config.nombres.persona1;
    const nombreElla = config.nombres.persona2;
    
    // Actualizar título con la fecha
    const tituloBalance = document.querySelector('.balance-header h3');
    if (tituloBalance) {
        tituloBalance.innerHTML = `<i class="fas fa-scale-balanced"></i> Balance: ${rango.descripcion}`;
    }
    
    // Verificar que los elementos existen
    const balanceNombreTu = document.getElementById('balance-nombre-tu');
    const balanceNombreElla = document.getElementById('balance-nombre-ella');
    const balanceMontoTu = document.getElementById('balance-monto-tu');
    const balanceMontoElla = document.getElementById('balance-monto-ella');
    const balanceMetaMonto = document.getElementById('balance-meta-monto');
    const statTuPeriodo = document.getElementById('stat-tu-periodo');
    const statEllaPeriodo = document.getElementById('stat-ella-periodo');
    const statDiferenciaPeriodo = document.getElementById('stat-diferencia-periodo');
    const balanceBarTu = document.getElementById('balance-bar-tu');
    const balanceBarElla = document.getElementById('balance-bar-ella');
    const resultadoDiv = document.getElementById('balance-resultado');
    const deudaTexto = document.getElementById('balance-diferencia-texto');
    const deudaMonto = document.getElementById('balance-deuda-monto');
    const btnPagar = document.getElementById('btn-pagar-deuda');
    
    if (!balanceNombreTu) return;
    
    // Actualizar nombres
    balanceNombreTu.textContent = nombreTu;
    balanceNombreElla.textContent = nombreElla;
    
    // Calcular balances con pagos incluidos
    const balanceTu = balance.totalTu - balance.deudaTuAElla + balance.deudaEllaATu;
    const balanceElla = balance.totalElla - balance.deudaEllaATu + balance.deudaTuAElla;
    
    // Actualizar montos
    balanceMontoTu.textContent = `S/${balanceTu.toFixed(2)}`;
    balanceMontoElla.textContent = `S/${balanceElla.toFixed(2)}`;
    balanceMetaMonto.textContent = `S/${balance.meta.toFixed(2)}`;
    
    // Actualizar estadísticas
    statTuPeriodo.textContent = `S/${balance.totalTu.toFixed(2)}`;
    statEllaPeriodo.textContent = `S/${balance.totalElla.toFixed(2)}`;
    statDiferenciaPeriodo.textContent = `S/${Math.abs(balance.totalTu - balance.totalElla).toFixed(2)}`;
    
    // Calcular porcentajes para la barra
    const total = balanceTu + balanceElla;
    const porcentajeTu = total > 0 ? (balanceTu / total) * 100 : 50;
    const porcentajeElla = total > 0 ? (balanceElla / total) * 100 : 50;
    
    balanceBarTu.style.width = `${porcentajeTu}%`;
    balanceBarElla.style.width = `${porcentajeElla}%`;
    
    // Mostrar correctamente quién debe a quién
    if (balance.deudaEllaATu > 0.01) {
        deudaTexto.textContent = `${nombreElla} debe a ${nombreTu}:`;
        deudaMonto.textContent = `S/${balance.deudaEllaATu.toFixed(2)}`;
        btnPagar.style.display = 'block';
        resultadoDiv.style.background = 'var(--accent-color)';
        resultadoDiv.style.color = 'white';
    } else if (balance.deudaTuAElla > 0.01) {
        deudaTexto.textContent = `${nombreTu} debe a ${nombreElla}:`;
        deudaMonto.textContent = `S/${balance.deudaTuAElla.toFixed(2)}`;
        btnPagar.style.display = 'block';
        resultadoDiv.style.background = 'var(--warning-color)';
        resultadoDiv.style.color = 'white';
    } else {
        deudaTexto.textContent = '¡Están iguales!';
        deudaMonto.textContent = 'S/0';
        btnPagar.style.display = 'none';
        resultadoDiv.style.background = 'var(--success-color)';
        resultadoDiv.style.color = 'white';
    }
    
    // Mostrar botón nuevo pago
    const btnNuevoPago = document.getElementById('btn-nuevo-pago');
    if (btnNuevoPago) btnNuevoPago.style.display = 'block';
}

function mostrarModalConfirmacionPago() {
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const quienPaga = document.getElementById('pago-quien-paga').value;
    const quienRecibe = document.getElementById('pago-quien-recibe').value;
    const descripcion = document.getElementById('pago-descripcion').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    const nombrePaga = quienPaga === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    const nombreRecibe = quienRecibe === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    
    const detalle = `${nombrePaga} → ${nombreRecibe} ${descripcion ? '· ' + descripcion : ''}`;
    document.getElementById('modal-pago-detalle').textContent = detalle;
    document.getElementById('modal-pago-monto').textContent = `S/${monto.toFixed(2)}`;
    
    document.getElementById('modal-confirmar-pago').classList.add('active');
}

async function guardarPagoEnFirebase() {
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const quienPaga = document.getElementById('pago-quien-paga').value;
    const quienRecibe = document.getElementById('pago-quien-recibe').value;
    const descripcion = document.getElementById('pago-descripcion').value;
    const fecha = document.getElementById('pago-fecha').value; // <-- Fecha seleccionada
    
    // Al guardar un pago, usamos la fecha seleccionada
    const nuevoPago = {
        id: 'temp_' + Date.now(),
        fecha: fecha, // La fecha que el usuario selecciona en el formulario
        fechaPago: new Date().toISOString().split('T')[0], // Fecha en que se realizó el pago
        monto: monto,
        descripcion: descripcion || 'Pago 50/50',
        deudor: quienPaga,
        acreedor: quienRecibe,
        completado: true,
        timestamp: new Date()
    };
    
    pagos.unshift(nuevoPago);
    actualizarBalance();
    mostrarPagos();
    
    limpiarFormularioPago();
    document.getElementById('pago-form').style.display = 'none';
    document.getElementById('modal-confirmar-pago').classList.remove('active');
    
    mostrarNotificacion('✅ Pago registrado', 'success');
    
    try {
        await savePagoToFirebase(nuevoPago);
    } catch (error) {
        console.error("Error guardando pago:", error);
    }
    
    saveToLocalStorage();
}

function limpiarFormularioPago() {
    document.getElementById('pago-monto').value = '';
    document.getElementById('pago-descripcion').value = '';
    document.getElementById('pago-quien-paga').value = 'persona1';
    document.getElementById('pago-quien-recibe').value = 'persona2';
}

function mostrarPagos() {
    const container = document.getElementById('pagos-list');
    const emptyPagos = document.getElementById('empty-pagos');
    
    if (!container) return;
    
    if (pagos.length === 0) {
        container.innerHTML = '';
        emptyPagos.style.display = 'block';
        return;
    }
    
    emptyPagos.style.display = 'none';
    
    let html = '';
    pagos.slice(0, 20).forEach(pago => {
        const nombrePaga = pago.deudor === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const nombreRecibe = pago.acreedor === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const idSeguro = pago.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
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
                            <span class="pago-personas">${nombrePaga} → ${nombreRecibe}</span>
                            <span class="pago-fecha">${fecha}</span>
                        </div>
                    </div>
                    <div class="pago-monto">S/${pago.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarPago('${idSeguro}')" title="Eliminar pago" style="margin-left: 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function eliminarPago(id) {
    if (!confirm('¿Eliminar este registro de pago?')) return;
    
    mostrarNotificacion('⌛ Eliminando pago...', 'info');
    
    const pagoEliminado = pagos.find(p => p.id === id);
    pagos = pagos.filter(p => p.id !== id);
    actualizarBalance();
    mostrarPagos();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await firebase.firestore().collection('pagos').doc(id).delete();
            mostrarNotificacion('✅ Pago eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Pago eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando pago:", error);
        if (pagoEliminado) {
            pagos.push(pagoEliminado);
            actualizarBalance();
            mostrarPagos();
        }
        mostrarNotificacion('Error al eliminar pago', 'error');
    }
    
    saveToLocalStorage();
}

// Hacerla global
window.eliminarPago = eliminarPago;

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
    
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoGasto = {
        id: tempId,
        fecha: fecha,
        monto: monto,
        descripcion: descripcion,
        persona: personaSeleccionada,
        categoria: categoriaSeleccionada,
        timestamp: new Date(),
        sincronizando: true
    };
    
    gastos.unshift(nuevoGasto);
    actualizarUI();
    
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('monto').focus();
    
    const nombrePersona = personaSeleccionada === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    
    try {
        const firebaseId = await saveGastoToFirebase(nuevoGasto);
        
        const index = gastos.findIndex(g => g.id === tempId);
        if (index !== -1) {
            gastos[index].id = firebaseId;
            gastos[index].sincronizando = false;
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
    
    mostrarNotificacion('⌛ Eliminando...', 'info');
    
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
        if (gastoEliminado) {
            gastos.push(gastoEliminado);
            actualizarUI();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveToLocalStorage();
}

// ====================
// FUNCIONES DE CONFIGURACIÓN
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
        await firebase.firestore().collection('config').doc('nuestra_pareja').set(config);
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveToLocalStorage();
}

// ====================
// FUNCIONES DE FILTROS
// ====================

function configurarFiltrosNuevos() {
    const busquedaInput = document.getElementById('busqueda-tiempo-real');
    const filtroCategoria = document.getElementById('filtro-categoria');
    const filtroPersona = document.getElementById('filtro-persona');
    const filtroFecha = document.getElementById('filtro-fecha');
    const rangoFechas = document.getElementById('rango-fechas-personalizado');
    const fechaDesde = document.getElementById('fecha-desde');
    const fechaHasta = document.getElementById('fecha-hasta');
    const btnAplicarFecha = document.getElementById('aplicar-fecha');
    const btnLimpiar = document.getElementById('limpiar-filtros');
    const btnLimpiarTodo = document.getElementById('limpiar-todo-historial');
    
    if (!busquedaInput) return;
    
    busquedaInput.addEventListener('input', aplicarFiltrosNuevos);
    filtroCategoria.addEventListener('change', aplicarFiltrosNuevos);
    filtroPersona.addEventListener('change', aplicarFiltrosNuevos);
    
    filtroFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            rangoFechas.style.display = 'block';
        } else {
            rangoFechas.style.display = 'none';
            aplicarFiltrosNuevos();
        }
    });
    
    btnAplicarFecha.addEventListener('click', aplicarFiltrosNuevos);
    
    btnLimpiar.addEventListener('click', function() {
        busquedaInput.value = '';
        filtroCategoria.value = '';
        filtroPersona.value = '';
        filtroFecha.value = 'all';
        rangoFechas.style.display = 'none';
        fechaDesde.value = '';
        fechaHasta.value = '';
        aplicarFiltrosNuevos();
        mostrarNotificacion('Filtros limpiados', 'info');
    });
    
    btnLimpiarTodo.addEventListener('click', mostrarModalLimpiarTodo);
    
    const cancelarBtn = document.getElementById('cancelar-limpiar-todo');
    const confirmarBtn = document.getElementById('confirmar-limpiar-todo');
    
    if (cancelarBtn) {
        cancelarBtn.addEventListener('click', function() {
            document.getElementById('modal-limpiar-todo').classList.remove('active');
        });
    }
    
    if (confirmarBtn) {
        confirmarBtn.addEventListener('click', limpiarTodoHistorial);
    }
}

function aplicarFiltrosNuevos() {
    const busqueda = document.getElementById('busqueda-tiempo-real')?.value.toLowerCase() || '';
    const categoria = document.getElementById('filtro-categoria')?.value || '';
    const persona = document.getElementById('filtro-persona')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha')?.value || 'all';
    const fechaDesde = document.getElementById('fecha-desde')?.value || '';
    const fechaHasta = document.getElementById('fecha-hasta')?.value || '';
    
    let gastosFiltrados = [...gastos];
    
    if (busqueda) {
        gastosFiltrados = gastosFiltrados.filter(g => 
            g.descripcion.toLowerCase().includes(busqueda)
        );
    }
    
    if (categoria) gastosFiltrados = gastosFiltrados.filter(g => g.categoria === categoria);
    if (persona) gastosFiltrados = gastosFiltrados.filter(g => g.persona === persona);
    
    if (filtroFecha !== 'all') {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        
        switch(filtroFecha) {
            case 'today':
                const hoyStr = hoy.toISOString().split('T')[0];
                gastosFiltrados = gastosFiltrados.filter(g => g.fecha === hoyStr);
                break;
            case 'week':
                const inicioSemana = obtenerInicioSemana();
                gastosFiltrados = gastosFiltrados.filter(g => new Date(g.fecha) >= new Date(inicioSemana));
                break;
            case 'month':
                const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                gastosFiltrados = gastosFiltrados.filter(g => new Date(g.fecha) >= inicioMes);
                break;
            case 'custom':
                if (fechaDesde && fechaHasta) {
                    const desde = new Date(fechaDesde);
                    const hasta = new Date(fechaHasta);
                    hasta.setHours(23, 59, 59, 999);
                    gastosFiltrados = gastosFiltrados.filter(g => {
                        const fechaG = new Date(g.fecha);
                        return fechaG >= desde && fechaG <= hasta;
                    });
                }
                break;
        }
    }
    
    gastosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    document.getElementById('filtro-mostrando').textContent = gastosFiltrados.length;
    document.getElementById('filtro-total').textContent = gastos.length;
    
    const totalMonto = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
    document.getElementById('filtro-total-monto').textContent = `S/${totalMonto.toFixed(2)}`;
    
    mostrarGastosFiltrados(gastosFiltrados);
    
    const totalFiltrado = document.getElementById('total-filtrado');
    const totalGeneral = document.getElementById('total-general');
    if (totalFiltrado) totalFiltrado.textContent = `S/${totalMonto.toFixed(2)}`;
    if (totalGeneral) totalGeneral.textContent = `S/${gastos.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
}

function mostrarModalLimpiarTodo() {
    const totalRegistros = document.getElementById('total-registros-eliminar');
    const totalMonto = document.getElementById('monto-total-eliminar');
    
    if (totalRegistros) totalRegistros.textContent = gastos.length;
    
    const sumaTotal = gastos.reduce((sum, g) => sum + g.monto, 0);
    if (totalMonto) totalMonto.textContent = `S/${sumaTotal.toFixed(2)}`;
    
    document.getElementById('modal-limpiar-todo').classList.add('active');
}

async function limpiarTodoHistorial() {
    mostrarNotificacion('Eliminando todo el historial...', 'info');
    
    const idsFirebase = gastos.filter(g => !g.id.toString().startsWith('temp_')).map(g => g.id);
    for (const id of idsFirebase) {
        try {
            await deleteGastoFromFirebase(id);
        } catch (error) {
            console.error("Error eliminando:", id);
        }
    }
    
    gastos = [];
    actualizarUI();
    saveToLocalStorage();
    
    document.getElementById('modal-limpiar-todo').classList.remove('active');
    mostrarNotificacion('Todo el historial eliminado', 'success');
}

// ====================
// FUNCIONES DE UI
// ====================

function actualizarUI() {
    actualizarResumen();
    actualizarGrafico('categorias');
    aplicarFiltrosNuevos();
    actualizarBalance();
    mostrarPagos();
    actualizarNombresEnUI();
}

function actualizarNombresEnUI() {
    const el1 = document.getElementById('name-persona1');
    const el2 = document.getElementById('name-persona2');
    if (el1) el1.textContent = config.nombres.persona1;
    if (el2) el2.textContent = config.nombres.persona2;
    
    const filtroPersona1 = document.getElementById('filtro-persona1');
    const filtroPersona2 = document.getElementById('filtro-persona2');
    if (filtroPersona1) filtroPersona1.textContent = config.nombres.persona1;
    if (filtroPersona2) filtroPersona2.textContent = config.nombres.persona2;
    
    const pagoOpcionTu = document.getElementById('pago-opcion-tu');
    const pagoOpcionElla = document.getElementById('pago-opcion-ella');
    const pagoRecibeTu = document.getElementById('pago-recibe-tu');
    const pagoRecibeElla = document.getElementById('pago-recibe-ella');
    
    if (pagoOpcionTu) pagoOpcionTu.textContent = config.nombres.persona1;
    if (pagoOpcionElla) pagoOpcionElla.textContent = config.nombres.persona2;
    if (pagoRecibeTu) pagoRecibeTu.textContent = config.nombres.persona1;
    if (pagoRecibeElla) pagoRecibeElla.textContent = config.nombres.persona2;
}

function actualizarResumen() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    // Verificar si los elementos existen antes de usarlos
    const summaryHoy = document.getElementById('summary-hoy');
    const summarySemana = document.getElementById('summary-semana');
    const summaryDiferencia = document.getElementById('summary-diferencia');
    
    if (summaryHoy) summaryHoy.textContent = `S/${totalHoy.toFixed(2)}`;
    if (summarySemana) summarySemana.textContent = `S/${totalSemana.toFixed(2)}`;
    
    if (summaryDiferencia) {
        const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
        const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
        const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
        summaryDiferencia.textContent = `S/${diferencia.toFixed(2)}`;
    }
}

function mostrarGastosFiltrados(gastosFiltrados) {
    const container = document.getElementById('gastos-container');
    const emptyState = document.getElementById('empty-state');
    const totales = document.getElementById('totales');
    
    if (gastosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="display: block;">
                <i class="far fa-search"></i>
                <h4>No se encontraron gastos</h4>
                <p>Intenta con otros filtros.</p>
            </div>
        `;
        if (emptyState) emptyState.style.display = 'none';
        if (totales) totales.style.display = 'none';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (totales) totales.style.display = 'block';
    
    const iconosCategorias = {
        comida: '🍔',
        transporte: '🚗',
        entretenimiento: '🎬',
        compras: '🛒',
        otros: '📦'
    };
    
    let html = '';
    
    gastosFiltrados.forEach(gasto => {
        let fechaFormateada;
        const fechaGasto = new Date(gasto.fecha + 'T00:00:00');
        const ahora = new Date();
        const esHoy = fechaGasto.toDateString() === ahora.toDateString();
        
        if (esHoy && gasto.timestamp) {
            const hora = new Date(gasto.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            fechaFormateada = `Hoy ${hora}`;
        } else if (gasto.timestamp) {
            const fecha = fechaGasto.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const hora = new Date(gasto.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            fechaFormateada = `${fecha} ${hora}`;
        } else {
            fechaFormateada = fechaGasto.toLocaleDateString('es-ES', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
        }
        
        const nombrePersona = gasto.persona === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const iconoCategoria = iconosCategorias[gasto.categoria] || '📦';
        const idSeguro = gasto.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        const sincronizandoIcon = gasto.sincronizando ? '<i class="fas fa-sync fa-spin"></i>' : '';
        const errorIcon = gasto.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i>' : '';
        
        html += `
            <div class="gasto-item ${gasto.persona}" data-id="${gasto.id}">
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
                        <span class="gasto-categoria">${iconoCategoria} ${gasto.categoria}</span>
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
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
    
    if (tipo === 'categorias') {
        const categorias = ['comida', 'transporte', 'entretenimiento', 'compras', 'otros'];
        labels = ['Comida', 'Transporte', 'Entretenimiento', 'Compras', 'Otros'];
        categorias.forEach(cat => {
            const total = gastosSemana.filter(g => g.categoria === cat).reduce((sum, g) => sum + g.monto, 0);
            datos.push(total);
        });
    } else if (tipo === 'personas') {
        labels = [config.nombres.persona1, config.nombres.persona2];
        const totalPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
        const totalPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
        datos.push(totalPersona1, totalPersona2);
    } else if (tipo === 'semana') {
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
    }
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = datos;
    chartInstance.update();
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
            if (accion === 'ver-ahorros') window.location.href = 'ahorro.html';
            if (accion === 'ver-limites') window.location.href = 'limites.html';
            if (accion === 'ver-mis-finanzas') window.location.href = 'finanzas-personales.html?persona=yo';
            if (accion === 'ver-dias-especiales') window.location.href = 'dias-especiales.html';
        });
    });
    
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGrafico(this.dataset.chart);
        });
    });
    
    document.getElementById('edit-names').addEventListener('click', () => {
        document.getElementById('nombre-persona1').value = config.nombres.persona1;
        document.getElementById('nombre-persona2').value = config.nombres.persona2;
        document.getElementById('names-modal').classList.add('active');
    });
    
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', () => {
        document.getElementById('names-modal').classList.remove('active');
    });
    
    document.getElementById('export-btn').addEventListener('click', () => {
        const dataStr = JSON.stringify(gastos, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `gastos_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        mostrarNotificacion('Datos exportados', 'success');
    });
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.getElementById('names-modal').classList.remove('active');
            document.getElementById('modal-confirmar-pago').classList.remove('active');
            document.getElementById('modal-limpiar-todo').classList.remove('active');
            document.getElementById('pago-form').style.display = 'none';
        }
    });
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

function mostrarModalNombres() {
    document.getElementById('nombre-persona1').value = config.nombres.persona1;
    document.getElementById('nombre-persona2').value = config.nombres.persona2;
    document.getElementById('names-modal').classList.add('active');
}

function ocultarModalNombres() {
    document.getElementById('names-modal').classList.remove('active');
}

// Hacer funciones globales
window.eliminarGasto = eliminarGasto;

console.log("✅ app.js cargado correctamente (versión 50/50)");