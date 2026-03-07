// File: app.js
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
// FUNCIÓN PARA OBTENER FECHA LOCAL CORRECTA
// ====================

function obtenerFechaLocal() {
    const ahora = new Date();
    const fechaLocal = new Date(ahora.getTime() - (ahora.getTimezoneOffset() * 60000));
    return fechaLocal.toISOString().split('T')[0];
}

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
                console.log("⏭️ Ignorando snapshot por operación propia");
                ignoreNextSnapshot = false;
                return;
            }
            
            console.log("📊 Cambios en gastos:", snapshot.docChanges().length);
            
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
                                sincronizando: false
                            };
                        } 
                        else if (!gastos.some(g => g.id === docData.id)) {
                            console.log("➕ Nuevo gasto");
                            gastos.push({
                                ...docData,
                                sincronizando: false
                            });
                        }
                        break;
                        
                    case 'modified':
                        const indexMod = gastos.findIndex(g => g.id === docData.id);
                        if (indexMod !== -1) gastos[indexMod] = docData;
                        break;
                        
                    case 'removed':
                        gastos = gastos.filter(g => g.id !== docData.id);
                        break;
                }
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
                        const temporalIndex = pagos.findIndex(p => 
                            p.id.toString().startsWith('temp_') && 
                            Math.abs(p.monto - pagoData.monto) < 0.01 &&
                            p.fecha === pagoData.fecha &&
                            p.deudor === pagoData.deudor &&
                            p.acreedor === pagoData.acreedor
                        );
                        
                        if (temporalIndex !== -1) {
                            console.log("🗑️ Pago temporal eliminado");
                            pagos.splice(temporalIndex, 1);
                        }
                        
                        if (!pagos.some(p => p.id === pagoData.id)) {
                            pagos.push(pagoData);
                        }
                        break;
                        
                    case 'modified':
                        const indexMod = pagos.findIndex(p => p.id === pagoData.id);
                        if (indexMod !== -1) pagos[indexMod] = pagoData;
                        break;
                        
                    case 'removed':
                        pagos = pagos.filter(p => p.id !== pagoData.id);
                        break;
                }
            });
            
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
    configurarFiltrosNuevos();
    configurarBalanceEventos();
    configurarBarraInferior();
    configurarVerMas();
    actualizarNombresEnUI();
    
    const fechaLocal = obtenerFechaLocal();
    document.getElementById('fecha-gasto').value = fechaLocal;
    document.getElementById('pago-fecha').value = fechaLocal;
    
    inicializarGrafico();
}

// ====================
// FUNCIONES DE BARRA INFERIOR Y VER MÁS
// ====================

function configurarBarraInferior() {
    const bottomBtns = document.querySelectorAll('.bottom-nav-btn');
    
    bottomBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            
            bottomBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            switch(accion) {
                case 'ver-inicio':
                    window.scrollTo({ top: 0, behavior: 'smooth' });
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

function configurarVerMas() {
    const verMasBtn = document.getElementById('ver-mas-historial');
    const gastosContainer = document.getElementById('gastos-container');
    
    if (!verMasBtn || !gastosContainer) return;
    
    let expandido = false;
    const alturaNormal = '350px';
    
    verMasBtn.addEventListener('click', function() {
        expandido = !expandido;
        
        if (expandido) {
            gastosContainer.style.maxHeight = 'none';
            gastosContainer.style.overflowY = 'visible';
            this.innerHTML = '<i class="fas fa-chevron-up"></i> Ver menos gastos';
        } else {
            gastosContainer.style.maxHeight = alturaNormal;
            gastosContainer.style.overflowY = 'auto';
            this.innerHTML = '<i class="fas fa-chevron-down"></i> Ver más gastos';
        }
    });
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
    
    selectorFecha.addEventListener('change', function() {
        if (this.value === 'custom') {
            fechaCustom.style.display = 'block';
            if (!fechaCustom.value) fechaCustom.value = obtenerFechaLocal();
            actualizarBalance();
        } else {
            fechaCustom.style.display = 'none';
            actualizarBalance();
        }
    });
    
    fechaCustom.addEventListener('change', actualizarBalance);
    
    btnPagar.addEventListener('click', function() {
        const selectorFecha = document.getElementById('balance-fecha-selector').value;
        const fechaCustom = document.getElementById('balance-fecha-custom').value;
        const balance = calcularBalance(obtenerFechaBalance());
        
        let fechaPago = obtenerFechaLocal();
        if (selectorFecha === 'yesterday') {
            const ayer = new Date();
            ayer.setDate(ayer.getDate() - 1);
            fechaPago = new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        } else if (selectorFecha === 'custom' && fechaCustom) {
            fechaPago = fechaCustom;
        }
        
        document.getElementById('pago-fecha').value = fechaPago;
        
        if (balance.deudaEllaATu > 0.01) {
            pagoQuienPaga.value = 'persona2';
            pagoQuienRecibe.value = 'persona1';
            document.getElementById('pago-monto').value = balance.deudaEllaATu.toFixed(2);
        } else if (balance.deudaTuAElla > 0.01) {
            pagoQuienPaga.value = 'persona1';
            pagoQuienRecibe.value = 'persona2';
            document.getElementById('pago-monto').value = balance.deudaTuAElla.toFixed(2);
        }
        
        pagoForm.style.display = 'block';
    });
    
    btnNuevoPago.addEventListener('click', function() {
        document.getElementById('pago-fecha').value = obtenerFechaLocal();
        pagoForm.style.display = 'block';
    });
    
    cancelarPago.addEventListener('click', function() {
        pagoForm.style.display = 'none';
        limpiarFormularioPago();
    });
    
    guardarPago.addEventListener('click', mostrarModalConfirmacionPago);
    
    document.getElementById('confirmar-pago-final').addEventListener('click', guardarPagoEnFirebase);
    document.getElementById('cancelar-confirmacion').addEventListener('click', () => {
        document.getElementById('modal-confirmar-pago').classList.remove('active');
    });
    
    pagoQuienPaga.addEventListener('change', function() {
        const quienRecibe = document.getElementById('pago-quien-recibe');
        quienRecibe.value = this.value === 'persona1' ? 'persona2' : 'persona1';
    });
}

function obtenerFechaBalance() {
    const selector = document.getElementById('balance-fecha-selector').value;
    const fechaCustom = document.getElementById('balance-fecha-custom').value;
    
    switch(selector) {
        case 'today':
            return { 
                tipo: 'today', 
                fecha: obtenerFechaLocal(),
                descripcion: 'Hoy'
            };
            
        case 'yesterday':
            const ayer = new Date();
            ayer.setDate(ayer.getDate() - 1);
            const fechaAyer = new Date(ayer.getTime() - (ayer.getTimezoneOffset() * 60000));
            return { 
                tipo: 'yesterday', 
                fecha: fechaAyer.toISOString().split('T')[0],
                descripcion: 'Ayer'
            };
            
        case 'all':  // ✅ NUEVA OPCIÓN
            return { 
                tipo: 'all', 
                fecha: null,  // null significa "todo el historial"
                descripcion: 'Todo el historial'
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
                    fecha: obtenerFechaLocal(),
                    descripcion: 'Hoy'
                };
            }
            
        default:
            return { 
                tipo: 'today', 
                fecha: obtenerFechaLocal(),
                descripcion: 'Hoy'
            };
    }
}

function calcularBalance(rango) {
    // Filtrar gastos por fecha
    const gastosFiltrados = rango.fecha ? gastos.filter(g => g.fecha === rango.fecha) : gastos;
    
    // Filtrar pagos por fecha
    const pagosFiltrados = rango.fecha ? pagos.filter(p => p.fecha === rango.fecha) : pagos;
    
    // Total gastado por cada uno
    const totalTu = gastosFiltrados.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const totalElla = gastosFiltrados.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    // Inicializar pagos
    let pagadoTuAElla = 0;  // Cuánto ha pagado YO a ELLA
    let pagadoEllaATu = 0;  // Cuánto ha pagado ELLA a YO
    
    // Calcular pagos
    pagosFiltrados.forEach(p => {
        if (p.deudor === 'persona1' && p.acreedor === 'persona2') {
            pagadoTuAElla += p.monto;  // Yo pagué a Ella
        } else if (p.deudor === 'persona2' && p.acreedor === 'persona1') {
            pagadoEllaATu += p.monto;  // Ella pagó a Mí
        }
    });
    
    // Calcular la diferencia de gastos
    const diferenciaGastos = totalTu - totalElla;
    
    // Determinar quién debe a quién
    let deudaTuAElla = 0;
    let deudaEllaATu = 0;
    
    if (diferenciaGastos > 0) {
        // Tú gastaste más, Ella te debe la mitad de la diferencia
        deudaEllaATu = diferenciaGastos / 2;
    } else if (diferenciaGastos < 0) {
        // Ella gastó más, Tú le debes la mitad de la diferencia
        deudaTuAElla = Math.abs(diferenciaGastos) / 2;
    }
    
    // Restar lo que ya se pagó
    deudaTuAElla = Math.max(0, deudaTuAElla - pagadoTuAElla);
    deudaEllaATu = Math.max(0, deudaEllaATu - pagadoEllaATu);
    
    const totalGastos = totalTu + totalElla;
    const meta = totalGastos / 2;
    
    return {
        totalTu,
        totalElla,
        meta,
        deudaTuAElla,
        deudaEllaATu,
        pagadoTuAElla,
        pagadoEllaATu,
        diferencia: Math.abs(totalTu - totalElla)
    };
}

function actualizarBalance() {
    const rango = obtenerFechaBalance();
    const balance = calcularBalance(rango);
    const nombreTu = config.nombres.persona1;
    const nombreElla = config.nombres.persona2;
    
    const elements = {
        balanceNombreTu: document.getElementById('balance-nombre-tu'),
        balanceNombreElla: document.getElementById('balance-nombre-ella'),
        balanceMontoTu: document.getElementById('balance-monto-tu'),
        balanceMontoElla: document.getElementById('balance-monto-ella'),
        balanceMetaMonto: document.getElementById('balance-meta-monto'),
        statTuPeriodo: document.getElementById('stat-tu-periodo'),
        statEllaPeriodo: document.getElementById('stat-ella-periodo'),
        statDiferenciaPeriodo: document.getElementById('stat-diferencia-periodo'),
        balanceBarTu: document.getElementById('balance-bar-tu'),
        balanceBarElla: document.getElementById('balance-bar-ella'),
        deudaTexto: document.getElementById('balance-diferencia-texto'),
        deudaMonto: document.getElementById('balance-deuda-monto'),
        btnPagar: document.getElementById('btn-pagar-deuda'),
        resultadoDiv: document.getElementById('balance-resultado')
    };
    
    if (!elements.balanceNombreTu) return;
    
    elements.balanceNombreTu.textContent = nombreTu;
    elements.balanceNombreElla.textContent = nombreElla;
    
    // Mostrar totales de gastos (sin pagos)
    elements.statTuPeriodo.textContent = `S/${balance.totalTu.toFixed(2)}`;
    elements.statEllaPeriodo.textContent = `S/${balance.totalElla.toFixed(2)}`;
    elements.statDiferenciaPeriodo.textContent = `S/${Math.abs(balance.totalTu - balance.totalElla).toFixed(2)}`;
    
    // ✅ CORREGIDO: Gasto efectivo después de pagos
    // El que paga: su gasto efectivo AUMENTA
    // El que recibe: su gasto efectivo DISMINUYE
    const gastoEfectivoTu = balance.totalTu + balance.pagadoTuAElla - balance.pagadoEllaATu;
    const gastoEfectivoElla = balance.totalElla + balance.pagadoEllaATu - balance.pagadoTuAElla;
    
    elements.balanceMontoTu.textContent = `S/${gastoEfectivoTu.toFixed(2)}`;
    elements.balanceMontoElla.textContent = `S/${gastoEfectivoElla.toFixed(2)}`;
    elements.balanceMetaMonto.textContent = `S/${balance.meta.toFixed(2)}`;
    
    // Calcular porcentajes para la barra
    const totalEfectivo = gastoEfectivoTu + gastoEfectivoElla;
    const porcentajeTu = totalEfectivo > 0 ? (gastoEfectivoTu / totalEfectivo) * 100 : 50;
    const porcentajeElla = totalEfectivo > 0 ? (gastoEfectivoElla / totalEfectivo) * 100 : 50;
    
    elements.balanceBarTu.style.width = `${porcentajeTu}%`;
    elements.balanceBarElla.style.width = `${porcentajeElla}%`;
    
    // Mostrar quién debe a quién
    if (balance.deudaEllaATu > 0.01) {
        elements.deudaTexto.textContent = `${nombreElla} debe a ${nombreTu}:`;
        elements.deudaMonto.textContent = `S/${balance.deudaEllaATu.toFixed(2)}`;
        elements.btnPagar.style.display = 'block';
        if (elements.resultadoDiv) elements.resultadoDiv.style.background = 'var(--accent-color)';
    } else if (balance.deudaTuAElla > 0.01) {
        elements.deudaTexto.textContent = `${nombreTu} debe a ${nombreElla}:`;
        elements.deudaMonto.textContent = `S/${balance.deudaTuAElla.toFixed(2)}`;
        elements.btnPagar.style.display = 'block';
        if (elements.resultadoDiv) elements.resultadoDiv.style.background = 'var(--warning-color)';
    } else {
        elements.deudaTexto.textContent = '¡Están iguales!';
        elements.deudaMonto.textContent = 'S/0';
        elements.btnPagar.style.display = 'none';
        if (elements.resultadoDiv) elements.resultadoDiv.style.background = 'var(--success-color)';
    }
    
    const tituloBalance = document.querySelector('.balance-header h3');
    if (tituloBalance) {
        tituloBalance.innerHTML = `<i class="fas fa-scale-balanced"></i> Balance: ${rango.descripcion}`;
    }
}

function mostrarModalConfirmacionPago() {
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const quienPaga = document.getElementById('pago-quien-paga').value;
    const quienRecibe = document.getElementById('pago-quien-recibe').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    const nombrePaga = quienPaga === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    const nombreRecibe = quienRecibe === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    const descripcion = document.getElementById('pago-descripcion').value;
    
    document.getElementById('modal-pago-detalle').textContent = `${nombrePaga} → ${nombreRecibe} ${descripcion ? '· ' + descripcion : ''}`;
    document.getElementById('modal-pago-monto').textContent = `S/${monto.toFixed(2)}`;
    document.getElementById('modal-confirmar-pago').classList.add('active');
}

async function guardarPagoEnFirebase() {
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const quienPaga = document.getElementById('pago-quien-paga').value;
    const quienRecibe = document.getElementById('pago-quien-recibe').value;
    const descripcion = document.getElementById('pago-descripcion').value;
    const fecha = document.getElementById('pago-fecha').value;
    
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoPago = {
        id: tempId,
        fecha: fecha,
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
    
    mostrarNotificacion('⏳ Guardando pago...', 'info');
    
    try {
        await savePagoToFirebase(nuevoPago);
        mostrarNotificacion('✅ Pago registrado', 'success');
    } catch (error) {
        console.error("Error guardando pago:", error);
        const index = pagos.findIndex(p => p.id === tempId);
        if (index !== -1) pagos[index].error = true;
        mostrarNotificacion('⚠️ Pago guardado localmente', 'warning');
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
    
    // ORDENAR POR TIMESTAMP (más reciente arriba)
    const pagosOrdenados = [...pagos].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
    });
    
    let html = '';
    
    pagosOrdenados.slice(0, 20).forEach(pago => {
        const nombrePaga = pago.deudor === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const nombreRecibe = pago.acreedor === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const idSeguro = pago.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        const fechaGasto = new Date(pago.fecha + 'T00:00:00');
        const fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        
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
                    <div class="pago-icon"><i class="fas fa-hand-holding-usd"></i></div>
                    <div class="pago-info">
                        <div class="pago-descripcion">${pago.descripcion}</div>
                        <div class="pago-detalle">
                            <span class="pago-personas">${nombrePaga} → ${nombreRecibe}</span>
                            <span class="pago-fecha">
                                <span class="badge-fecha-gasto">${fechaGastoFormateada}</span>
                                <span class="badge-accion"><i class="fas fa-clock"></i> registrado ${fechaAccionFormateada} ${horaAccionFormateada}</span>
                            </span>
                        </div>
                    </div>
                    <div class="pago-monto">S/${pago.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarPago('${idSeguro}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function eliminarPago(id) {
    if (!confirm('¿Eliminar este pago?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const pagoEliminado = pagos.find(p => p.id === id);
    pagos = pagos.filter(p => p.id !== id);
    actualizarBalance();
    mostrarPagos();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await firebase.firestore().collection('pagos').doc(id).delete();
            mostrarNotificacion('✅ Pago eliminado', 'success');
        }
    } catch (error) {
        console.error("Error:", error);
        if (pagoEliminado) pagos.push(pagoEliminado);
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveToLocalStorage();
}

window.eliminarPago = eliminarPago;

// ====================
// FUNCIONES DE GASTOS
// ====================

async function agregarGasto() {
    const monto = parseFloat(document.getElementById('monto').value);
    const descripcion = document.getElementById('descripcion').value.trim() || 'Gasto sin descripción';
    const fecha = document.getElementById('fecha-gasto').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        document.getElementById('monto').focus();
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
        console.error("Error:", error);
        const index = gastos.findIndex(g => g.id === tempId);
        if (index !== -1) gastos[index].error = true;
        mostrarNotificacion(`⚠️ ${nombrePersona} gastó S/${monto.toFixed(2)} (sin conexión)`, 'warning');
    }
    
    saveToLocalStorage();
}

async function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const gastoEliminado = gastos.find(g => g.id === id);
    gastos = gastos.filter(g => g.id !== id);
    actualizarUI();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deleteGastoFromFirebase(id);
            mostrarNotificacion('✅ Gasto eliminado', 'success');
        }
    } catch (error) {
        console.error("Error:", error);
        if (gastoEliminado) gastos.push(gastoEliminado);
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveToLocalStorage();
}

// ====================
// FUNCIONES DE CONFIGURACIÓN
// ====================

async function guardarNombres() {
    config.nombres.persona1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    config.nombres.persona2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    actualizarNombresEnUI();
    actualizarUI();
    document.getElementById('names-modal').classList.remove('active');
    
    try {
        await firebase.firestore().collection('config').doc('nuestra_pareja').set(config);
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error:", error);
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
        rangoFechas.style.display = this.value === 'custom' ? 'block' : 'none';
        aplicarFiltrosNuevos();
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
    
    document.getElementById('cancelar-limpiar-todo')?.addEventListener('click', () => {
        document.getElementById('modal-limpiar-todo').classList.remove('active');
    });
    
    document.getElementById('confirmar-limpiar-todo')?.addEventListener('click', limpiarTodoHistorial);
}

function aplicarFiltrosNuevos() {
    const busqueda = document.getElementById('busqueda-tiempo-real')?.value.toLowerCase() || '';
    const categoria = document.getElementById('filtro-categoria')?.value || '';
    const persona = document.getElementById('filtro-persona')?.value || '';
    const filtroFecha = document.getElementById('filtro-fecha')?.value || 'all';
    const fechaDesde = document.getElementById('fecha-desde')?.value || '';
    const fechaHasta = document.getElementById('fecha-hasta')?.value || '';
    
    let gastosFiltrados = [...gastos];
    
    if (busqueda) gastosFiltrados = gastosFiltrados.filter(g => g.descripcion.toLowerCase().includes(busqueda));
    if (categoria) gastosFiltrados = gastosFiltrados.filter(g => g.categoria === categoria);
    if (persona) gastosFiltrados = gastosFiltrados.filter(g => g.persona === persona);
    
    if (filtroFecha !== 'all') {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        
        switch(filtroFecha) {
            case 'today':
                const hoyStr = obtenerFechaLocal();
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
    
    document.getElementById('filtro-mostrando').textContent = gastosFiltrados.length;
    document.getElementById('filtro-total').textContent = gastos.length;
    
    const totalMonto = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
    document.getElementById('filtro-total-monto').textContent = `S/${totalMonto.toFixed(2)}`;
    
    mostrarGastosFiltrados(gastosFiltrados);
    
    document.getElementById('total-filtrado').textContent = `S/${totalMonto.toFixed(2)}`;
    document.getElementById('total-general').textContent = `S/${gastos.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
}

function mostrarModalLimpiarTodo() {
    document.getElementById('total-registros-eliminar').textContent = gastos.length;
    const sumaTotal = gastos.reduce((sum, g) => sum + g.monto, 0);
    document.getElementById('monto-total-eliminar').textContent = `S/${sumaTotal.toFixed(2)}`;
    document.getElementById('modal-limpiar-todo').classList.add('active');
}

async function limpiarTodoHistorial() {
    mostrarNotificacion('Eliminando todo...', 'info');
    
    const idsFirebase = gastos.filter(g => !g.id.toString().startsWith('temp_')).map(g => g.id);
    for (const id of idsFirebase) {
        try { await deleteGastoFromFirebase(id); } 
        catch (error) { console.error("Error eliminando:", id); }
    }
    
    gastos = [];
    actualizarUI();
    saveToLocalStorage();
    document.getElementById('modal-limpiar-todo').classList.remove('active');
    mostrarNotificacion('Todo eliminado', 'success');
}

// ====================
// FUNCIONES DE UI
// ====================

function actualizarUI() {
    actualizarResumen();
    aplicarFiltrosNuevos();
    actualizarBalance();
    mostrarPagos();
    actualizarNombresEnUI();
}

function actualizarNombresEnUI() {
    document.getElementById('name-persona1').textContent = config.nombres.persona1;
    document.getElementById('name-persona2').textContent = config.nombres.persona2;
    document.getElementById('filtro-persona1').textContent = config.nombres.persona1;
    document.getElementById('filtro-persona2').textContent = config.nombres.persona2;
    document.getElementById('pago-opcion-tu').textContent = config.nombres.persona1;
    document.getElementById('pago-opcion-ella').textContent = config.nombres.persona2;
    document.getElementById('pago-recibe-tu').textContent = config.nombres.persona1;
    document.getElementById('pago-recibe-ella').textContent = config.nombres.persona2;
}

function actualizarResumen() {
    // Verificar si los elementos existen antes de usarlos
    const summaryHoy = document.getElementById('summary-hoy');
    const summarySemana = document.getElementById('summary-semana');
    const summaryDiferencia = document.getElementById('summary-diferencia');
    
    // Si no existen los elementos del resumen, salir sin hacer nada
    if (!summaryHoy || !summarySemana || !summaryDiferencia) {
        return; // ✅ Salir silenciosamente, no afecta el resto
    }
    
    const hoy = obtenerFechaLocal();
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= new Date(inicioSemana));
    
    summaryHoy.textContent = `S/${gastosHoy.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
    summarySemana.textContent = `S/${gastosSemana.reduce((sum, g) => sum + g.monto, 0).toFixed(2)}`;
    
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    summaryDiferencia.textContent = `S/${Math.abs(gastosPersona1 - gastosPersona2).toFixed(2)}`;
}

function mostrarGastosFiltrados(gastosFiltrados) {
    const container = document.getElementById('gastos-container');
    const emptyState = document.getElementById('empty-state');
    const totales = document.getElementById('totales');
    
    if (!container) return;
    
    if (gastosFiltrados.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="far fa-smile-beam"></i><h4>No hay gastos</h4><p>Agrega tu primer gasto</p></div>`;
        if (emptyState) emptyState.style.display = 'none';
        if (totales) totales.style.display = 'none';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (totales) totales.style.display = 'block';
    
    const iconosCategorias = {
        comida: '<i class="fas fa-utensils"></i>',
        transporte: '<i class="fas fa-bus"></i>',
        entretenimiento: '<i class="fas fa-film"></i>',
        compras: '<i class="fas fa-shopping-bag"></i>',
        otros: '<i class="fas fa-ellipsis-h"></i>'
    };
    
    // ORDENAR POR TIMESTAMP (más reciente arriba)
    const gastosOrdenados = [...gastosFiltrados].sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.fecha + 'T00:00:00').getTime();
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.fecha + 'T00:00:00').getTime();
        return timeB - timeA;
    });
    
    let html = '';
    
    gastosOrdenados.forEach(gasto => {
        const fechaGasto = new Date(gasto.fecha + 'T00:00:00');
        const fechaGastoFormateada = fechaGasto.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        
        let fechaAccionFormateada = '', horaAccionFormateada = '';
        if (gasto.timestamp) {
            const fechaAccion = new Date(gasto.timestamp);
            const hoy = new Date();
            const ayer = new Date(hoy);
            ayer.setDate(ayer.getDate() - 1);
            
            horaAccionFormateada = fechaAccion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            if (fechaAccion.toDateString() === hoy.toDateString()) fechaAccionFormateada = 'hoy';
            else if (fechaAccion.toDateString() === ayer.toDateString()) fechaAccionFormateada = 'ayer';
            else fechaAccionFormateada = fechaAccion.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
        }
        
        const nombrePersona = gasto.persona === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const iconoCategoria = iconosCategorias[gasto.categoria] || '<i class="fas fa-tag"></i>';
        const idSeguro = gasto.id.toString().replace(/[^a-zA-Z0-9_]/g, '_');
        
        html += `
            <div class="gasto-item ${gasto.persona}">
                <div class="gasto-header">
                    <div class="gasto-monto">S/${gasto.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarGasto('${idSeguro}')"><i class="fas fa-trash"></i></button>
                </div>
                <div class="gasto-descripcion">${gasto.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona"><i class="fas fa-user"></i> ${nombrePersona}</span>
                        <span class="gasto-categoria">${iconoCategoria} ${gasto.categoria}</span>
                    </div>
                    <div class="gasto-fecha">
                        <span class="badge-fecha-gasto">${fechaGastoFormateada}</span>
                        <span class="badge-accion"><i class="fas fa-clock"></i> registrado ${fechaAccionFormateada} ${horaAccionFormateada}</span>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function inicializarGrafico() {
    const ctx = document.getElementById('gastos-chart');
    if (!ctx) {
        console.log("📊 Gráfico no disponible (elemento no encontrado)");
        return; // ✅ Salir silenciosamente si no existe el canvas
    }
    
    chartInstance = new Chart(ctx.getContext('2d'), {
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
                    labels: { color: 'var(--text-color)' } 
                } 
            } 
        }
    });
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
    document.getElementById('descripcion').addEventListener('keypress', e => { if (e.key === 'Enter') agregarGasto(); });
    
    document.getElementById('edit-names').addEventListener('click', () => {
        document.getElementById('nombre-persona1').value = config.nombres.persona1;
        document.getElementById('nombre-persona2').value = config.nombres.persona2;
        document.getElementById('names-modal').classList.add('active');
    });
    
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', () => document.getElementById('names-modal').classList.remove('active'));
    
    document.getElementById('export-btn').addEventListener('click', () => {
        const dataStr = JSON.stringify(gastos, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `gastos_${obtenerFechaLocal()}.json`);
        link.click();
        mostrarNotificacion('Datos exportados', 'success');
    });
    
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.getElementById('names-modal').classList.remove('active');
            document.getElementById('modal-confirmar-pago').classList.remove('active');
            document.getElementById('modal-limpiar-todo').classList.remove('active');
            document.getElementById('pago-form').style.display = 'none';
        }
    });
}

function toggleTema() {
    const nuevoTema = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('tema', nuevoTema);
    actualizarIconoTema(nuevoTema);
    mostrarNotificacion(`Modo ${nuevoTema}`, 'info');
}

function actualizarIconoTema(tema) {
    const icono = document.querySelector('#theme-btn i');
    icono.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
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
    
    const colores = { success: 'var(--success-color)', error: 'var(--accent-color)', warning: 'var(--warning-color)' };
    notificacion.style.background = colores[tipo] || 'var(--primary-color)';
    
    setTimeout(() => notificacion.classList.remove('show'), 1500);
}

window.eliminarGasto = eliminarGasto;

console.log("✅ app.js cargado correctamente");