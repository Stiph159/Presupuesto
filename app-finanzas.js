// File: app-finanzas.js
// ====================
// VERSIÓN CORREGIDA - SIN RECARGAS
// ====================

// Variables globales
let personaActual = 'yo'; // 'yo' o 'ella'
let ingresos = [];
let gastosPersonales = [];
let deudas = [];

let configFinanzas = {
    nombres: {
        yo: 'Yo',
        ella: 'Ella'
    }
};

// Referencias a Firebase
let unsubscribeIngresos = null;
let unsubscribeGastosPersonales = null;
let unsubscribeDeudas = null;

// Elementos del DOM
let deudaSeleccionada = null; // Para el modal de pago

// ==================================================
// INICIALIZACIÓN
// ==================================================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("💰 Iniciando finanzas personales...");
    
    // Obtener parámetro de URL para saber qué persona mostrar
    const urlParams = new URLSearchParams(window.location.search);
    const personaParam = urlParams.get('persona');
    
    if (personaParam === 'ella') {
        personaActual = 'ella';
    } else {
        personaActual = 'yo';
    }
    
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Inicializar UI
    inicializarUI();
    
    // Cargar desde localStorage primero
    cargarDeLocalStorage();
    actualizarUI();
    
    // Conectar con Firebase
    setTimeout(() => {
        initFirebaseFinanzas();
    }, 1000);
    
    // Configurar eventos
    configurarEventos();
});

function inicializarUI() {
    // Configurar fechas por defecto
    const hoy = new Date().toISOString().split('T')[0];
    const fechaIngreso = document.getElementById('fecha-ingreso');
    const fechaGasto = document.getElementById('fecha-gasto-personal');
    const fechaPago = document.getElementById('fecha-pago');
    
    if (fechaIngreso) fechaIngreso.value = hoy;
    if (fechaGasto) fechaGasto.value = hoy;
    if (fechaPago) fechaPago.value = hoy;
    
    // Actualizar título según persona
    actualizarTituloPersona();
}

function actualizarTituloPersona() {
    const titulo = document.getElementById('page-title');
    const tabYo = document.querySelector('.person-tab[data-person="yo"]');
    const tabElla = document.querySelector('.person-tab[data-person="ella"]');
    
    if (personaActual === 'yo') {
        if (titulo) titulo.textContent = 'Mis Finanzas';
        if (tabYo) tabYo.classList.add('active');
        if (tabElla) tabElla.classList.remove('active');
    } else {
        if (titulo) titulo.textContent = 'Sus Finanzas';
        if (tabYo) tabYo.classList.remove('active');
        if (tabElla) tabElla.classList.add('active');
    }
}

// ==================================================
// FIREBASE
// ==================================================

async function initFirebaseFinanzas() {
    try {
        console.log("🔥 Conectando finanzas a Firebase...");
        
        // Autenticación anónima
        await firebase.auth().signInAnonymously();
        
        // Configurar listeners
        setupRealtimeListeners();
        
        mostrarNotificacion("✅ Datos sincronizados", "success");
    } catch (error) {
        console.error("Error conectando a Firebase:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
    }
}

// ==================================================
// LISTENERS CORREGIDOS (SIN RECARGAS)
// ==================================================

function setupRealtimeListeners() {
    const db = firebase.firestore();
    
    // Ingresos
    if (unsubscribeIngresos) unsubscribeIngresos();
    unsubscribeIngresos = db.collection('finanzas_ingresos')
        .where('sharedId', '==', 'nuestra_pareja')
        .where('persona', '==', personaActual)
        .orderBy('fecha', 'desc')
        .onSnapshot((snapshot) => {
            console.log("📥 Cambios en ingresos:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const data = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                switch (cambio.type) {
                    case 'added':
                        // Buscar temporal que coincida
                        const temporalIndex = ingresos.findIndex(i => 
                            i.id.toString().startsWith('temp_') && 
                            Math.abs(i.monto - data.monto) < 0.01 &&
                            i.descripcion === data.descripcion && 
                            i.fecha === data.fecha
                        );
                        
                        if (temporalIndex !== -1) {
                            // ✅ Es NUESTRO ingreso
                            console.log("🔄 Reemplazando nuestro ingreso temporal");
                            ingresos[temporalIndex] = {
                                ...data,
                                sincronizando: false,
                                id: data.id
                            };
                        } 
                        else if (!ingresos.some(i => i.id === data.id)) {
                            // ✅ Es ingreso de OTRO dispositivo
                            console.log("➕ Nuevo ingreso de otro dispositivo");
                            ingresos.push({
                                ...data,
                                sincronizando: false
                            });
                            mostrarNotificacion(`💰 Nuevo ingreso de S/${data.monto.toFixed(2)}`, 'info');
                        }
                        break;
                }
            });
            
            actualizarUI();
            guardarEnLocalStorage();
        });
    
    // Gastos personales
    if (unsubscribeGastosPersonales) unsubscribeGastosPersonales();
    unsubscribeGastosPersonales = db.collection('finanzas_gastos')
        .where('sharedId', '==', 'nuestra_pareja')
        .where('persona', '==', personaActual)
        .orderBy('fecha', 'desc')
        .onSnapshot((snapshot) => {
            console.log("📤 Cambios en gastos personales:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const data = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                switch (cambio.type) {
                    case 'added':
                        // Buscar temporal que coincida
                        const temporalIndex = gastosPersonales.findIndex(g => 
                            g.id.toString().startsWith('temp_') && 
                            Math.abs(g.monto - data.monto) < 0.01 &&
                            g.descripcion === data.descripcion && 
                            g.fecha === data.fecha
                        );
                        
                        if (temporalIndex !== -1) {
                            // ✅ Es NUESTRO gasto
                            console.log("🔄 Reemplazando nuestro gasto temporal");
                            gastosPersonales[temporalIndex] = {
                                ...data,
                                sincronizando: false,
                                id: data.id
                            };
                        } 
                        else if (!gastosPersonales.some(g => g.id === data.id)) {
                            // ✅ Es gasto de OTRO dispositivo
                            console.log("➕ Nuevo gasto de otro dispositivo");
                            gastosPersonales.push({
                                ...data,
                                sincronizando: false
                            });
                            mostrarNotificacion(`💸 Nuevo gasto de S/${data.monto.toFixed(2)}`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = gastosPersonales.findIndex(g => g.id === data.id);
                        if (indexMod !== -1) gastosPersonales[indexMod] = data;
                        break;
                    case 'removed':
                        gastosPersonales = gastosPersonales.filter(g => g.id !== data.id);
                        mostrarNotificacion(`📌 Un gasto fue eliminado`, 'warning');
                        break;
                }
            });
            
            actualizarUI();
            guardarEnLocalStorage();
        });
    
    // Deudas
    if (unsubscribeDeudas) unsubscribeDeudas();
    unsubscribeDeudas = db.collection('finanzas_deudas')
        .where('sharedId', '==', 'nuestra_pareja')
        .where('persona', '==', personaActual)
        .orderBy('fechaRegistro', 'desc')
        .onSnapshot((snapshot) => {
            console.log("💳 Cambios en deudas:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const data = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                switch (cambio.type) {
                    case 'added':
                        // Buscar temporal que coincida
                        const temporalIndex = deudas.findIndex(d => 
                            d.id.toString().startsWith('temp_') && 
                            d.descripcion === data.descripcion && 
                            Math.abs(d.montoTotal - data.montoTotal) < 0.01
                        );
                        
                        if (temporalIndex !== -1) {
                            // ✅ Es NUESTRA deuda
                            console.log("🔄 Reemplazando nuestra deuda temporal");
                            deudas[temporalIndex] = {
                                ...data,
                                sincronizando: false,
                                id: data.id
                            };
                        } 
                        else if (!deudas.some(d => d.id === data.id)) {
                            // ✅ Es deuda de OTRO dispositivo
                            console.log("➕ Nueva deuda de otro dispositivo");
                            deudas.push({
                                ...data,
                                sincronizando: false
                            });
                            mostrarNotificacion(`📝 Nueva deuda registrada`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = deudas.findIndex(d => d.id === data.id);
                        if (indexMod !== -1) deudas[indexMod] = data;
                        break;
                    case 'removed':
                        deudas = deudas.filter(d => d.id !== data.id);
                        mostrarNotificacion(`📌 Una deuda fue eliminada`, 'warning');
                        break;
                }
            });
            
            actualizarUI();
            guardarEnLocalStorage();
        });
}

async function guardarIngresoEnFirebase(ingreso) {
    try {
        const db = firebase.firestore();
        const ingresoData = {
            persona: ingreso.persona,
            monto: ingreso.monto,
            descripcion: ingreso.descripcion,
            fecha: ingreso.fecha,
            tipo: ingreso.tipo,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('finanzas_ingresos').add(ingresoData);
        return docRef.id;
    } catch (error) {
        console.error("Error guardando ingreso:", error);
        throw error;
    }
}

async function guardarGastoEnFirebase(gasto) {
    try {
        const db = firebase.firestore();
        const gastoData = {
            persona: gasto.persona,
            monto: gasto.monto,
            descripcion: gasto.descripcion,
            fecha: gasto.fecha,
            categoria: gasto.categoria,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('finanzas_gastos').add(gastoData);
        return docRef.id;
    } catch (error) {
        console.error("Error guardando gasto:", error);
        throw error;
    }
}

async function guardarDeudaEnFirebase(deuda) {
    try {
        const db = firebase.firestore();
        const deudaData = {
            persona: deuda.persona,
            descripcion: deuda.descripcion,
            montoTotal: deuda.montoTotal,
            montoRestante: deuda.montoRestante,
            acreedor: deuda.acreedor,
            fechaVencimiento: deuda.fechaVencimiento,
            estado: deuda.estado,
            pagos: deuda.pagos || [],
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('finanzas_deudas').add(deudaData);
        return docRef.id;
    } catch (error) {
        console.error("Error guardando deuda:", error);
        throw error;
    }
}

async function actualizarDeudaEnFirebase(id, data) {
    try {
        await firebase.firestore()
            .collection('finanzas_deudas')
            .doc(id)
            .update(data);
    } catch (error) {
        console.error("Error actualizando deuda:", error);
        throw error;
    }
}

async function eliminarDeFirebase(coleccion, id) {
    try {
        await firebase.firestore()
            .collection(coleccion)
            .doc(id)
            .delete();
    } catch (error) {
        console.error(`Error eliminando de ${coleccion}:`, error);
        throw error;
    }
}

// ==================================================
// LOCAL STORAGE
// ==================================================

function guardarEnLocalStorage() {
    try {
        localStorage.setItem(`finanzas_${personaActual}_ingresos`, JSON.stringify(ingresos));
        localStorage.setItem(`finanzas_${personaActual}_gastos`, JSON.stringify(gastosPersonales));
        localStorage.setItem(`finanzas_${personaActual}_deudas`, JSON.stringify(deudas));
    } catch (error) {
        console.error("Error guardando en localStorage:", error);
    }
}

function cargarDeLocalStorage() {
    try {
        const ingresosGuardados = localStorage.getItem(`finanzas_${personaActual}_ingresos`);
        const gastosGuardados = localStorage.getItem(`finanzas_${personaActual}_gastos`);
        const deudasGuardadas = localStorage.getItem(`finanzas_${personaActual}_deudas`);
        
        if (ingresosGuardados) ingresos = JSON.parse(ingresosGuardados);
        if (gastosGuardados) gastosPersonales = JSON.parse(gastosGuardados);
        if (deudasGuardadas) deudas = JSON.parse(deudasGuardadas);
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ==================================================
// FUNCIONES PRINCIPALES CORREGIDAS (CON ID TEMPORAL)
// ==================================================

async function agregarIngreso() {
    const monto = parseFloat(document.getElementById('monto-ingreso').value);
    const descripcion = document.getElementById('descripcion-ingreso').value.trim();
    const fecha = document.getElementById('fecha-ingreso').value;
    const tipo = document.getElementById('tipo-ingreso').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    if (!descripcion) {
        mostrarNotificacion('Ingresa una descripción', 'error');
        return;
    }
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoIngreso = {
        id: tempId,
        persona: personaActual,
        monto: monto,
        descripcion: descripcion,
        fecha: fecha,
        tipo: tipo,
        fechaRegistro: new Date().toISOString(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    ingresos.unshift(nuevoIngreso);
    actualizarUI();
    
    // 3. Limpiar formulario
    document.getElementById('monto-ingreso').value = '';
    document.getElementById('descripcion-ingreso').value = '';
    document.getElementById('form-ingreso').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando ingreso...', 'info');
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await guardarIngresoEnFirebase(nuevoIngreso);
        
        const index = ingresos.findIndex(i => i.id === tempId);
        if (index !== -1) {
            ingresos[index].id = firebaseId;
            ingresos[index].sincronizando = false;
        }
        
        mostrarNotificacion(`✅ Ingreso de S/${monto.toFixed(2)} guardado`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = ingresos.findIndex(i => i.id === tempId);
        if (index !== -1) {
            ingresos[index].error = true;
        }
        mostrarNotificacion(`⚠️ Ingreso de S/${monto.toFixed(2)} (sin conexión)`, 'warning');
    }
    
    guardarEnLocalStorage();
}

async function agregarGastoPersonal() {
    const monto = parseFloat(document.getElementById('monto-gasto').value);
    const descripcion = document.getElementById('descripcion-gasto').value.trim();
    const fecha = document.getElementById('fecha-gasto-personal').value;
    const categoria = document.getElementById('categoria-gasto').value;
    
    if (!monto || monto <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    if (!descripcion) {
        mostrarNotificacion('Ingresa una descripción', 'error');
        return;
    }
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoGasto = {
        id: tempId,
        persona: personaActual,
        monto: monto,
        descripcion: descripcion,
        fecha: fecha,
        categoria: categoria,
        fechaRegistro: new Date().toISOString(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    gastosPersonales.unshift(nuevoGasto);
    actualizarUI();
    
    // 3. Limpiar formulario
    document.getElementById('monto-gasto').value = '';
    document.getElementById('descripcion-gasto').value = '';
    document.getElementById('form-gasto').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando gasto...', 'info');
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await guardarGastoEnFirebase(nuevoGasto);
        
        const index = gastosPersonales.findIndex(g => g.id === tempId);
        if (index !== -1) {
            gastosPersonales[index].id = firebaseId;
            gastosPersonales[index].sincronizando = false;
        }
        
        mostrarNotificacion(`✅ Gasto de S/${monto.toFixed(2)} guardado`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = gastosPersonales.findIndex(g => g.id === tempId);
        if (index !== -1) {
            gastosPersonales[index].error = true;
        }
        mostrarNotificacion(`⚠️ Gasto de S/${monto.toFixed(2)} (sin conexión)`, 'warning');
    }
    
    guardarEnLocalStorage();
}

async function agregarDeuda() {
    const descripcion = document.getElementById('descripcion-deuda').value.trim();
    const monto = parseFloat(document.getElementById('monto-deuda').value);
    const acreedor = document.getElementById('acreedor-deuda').value.trim();
    const fechaVencimiento = document.getElementById('fecha-vencimiento').value;
    const estado = document.getElementById('estado-deuda').value;
    
    if (!descripcion || !monto || monto <= 0 || !acreedor) {
        mostrarNotificacion('Completa todos los campos', 'error');
        return;
    }
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevaDeuda = {
        id: tempId,
        persona: personaActual,
        descripcion: descripcion,
        montoTotal: monto,
        montoRestante: estado === 'pagada' ? 0 : monto,
        acreedor: acreedor,
        fechaVencimiento: fechaVencimiento || null,
        estado: estado,
        pagos: [],
        fechaRegistro: new Date().toISOString(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    deudas.unshift(nuevaDeuda);
    actualizarUI();
    
    // 3. Limpiar formulario
    document.getElementById('descripcion-deuda').value = '';
    document.getElementById('monto-deuda').value = '';
    document.getElementById('acreedor-deuda').value = '';
    document.getElementById('fecha-vencimiento').value = '';
    document.getElementById('estado-deuda').value = 'pendiente';
    document.getElementById('form-deuda').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando deuda...', 'info');
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await guardarDeudaEnFirebase(nuevaDeuda);
        
        const index = deudas.findIndex(d => d.id === tempId);
        if (index !== -1) {
            deudas[index].id = firebaseId;
            deudas[index].sincronizando = false;
        }
        
        mostrarNotificacion('✅ Deuda registrada', 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = deudas.findIndex(d => d.id === tempId);
        if (index !== -1) {
            deudas[index].error = true;
        }
        mostrarNotificacion('⚠️ Deuda guardada (local)', 'warning');
    }
    
    guardarEnLocalStorage();
}

function mostrarModalPago(deudaId) {
    const deuda = deudas.find(d => d.id === deudaId);
    if (!deuda) return;
    
    deudaSeleccionada = deuda;
    
    document.getElementById('monto-pago').value = deuda.montoRestante.toFixed(2);
    document.getElementById('fecha-pago').value = new Date().toISOString().split('T')[0];
    document.getElementById('pago-completo').checked = true;
    
    document.getElementById('pago-modal').classList.add('active');
}

async function procesarPago() {
    if (!deudaSeleccionada) return;
    
    const montoPago = parseFloat(document.getElementById('monto-pago').value);
    const fechaPago = document.getElementById('fecha-pago').value;
    const pagoCompleto = document.getElementById('pago-completo').checked;
    
    if (!montoPago || montoPago <= 0) {
        mostrarNotificacion('Ingresa un monto válido', 'error');
        return;
    }
    
    if (montoPago > deudaSeleccionada.montoRestante) {
        mostrarNotificacion('El pago no puede ser mayor a la deuda', 'error');
        return;
    }
    
    // Crear registro de pago
    const nuevoPago = {
        fecha: fechaPago,
        monto: montoPago,
        tipo: pagoCompleto ? 'completo' : 'parcial'
    };
    
    // Actualizar deuda (localmente)
    const indexDeuda = deudas.findIndex(d => d.id === deudaSeleccionada.id);
    if (indexDeuda === -1) return;
    
    const deudaActualizada = { ...deudas[indexDeuda] };
    deudaActualizada.montoRestante -= montoPago;
    deudaActualizada.pagos = deudaActualizada.pagos || [];
    deudaActualizada.pagos.push(nuevoPago);
    
    if (deudaActualizada.montoRestante <= 0) {
        deudaActualizada.estado = 'pagada';
        deudaActualizada.montoRestante = 0;
    }
    
    // Actualizar array local
    deudas[indexDeuda] = deudaActualizada;
    
    // Crear gasto por pago
    const tempIdGasto = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const gastoPorPago = {
        id: tempIdGasto,
        persona: personaActual,
        monto: montoPago,
        descripcion: `Pago de deuda: ${deudaSeleccionada.descripcion}`,
        fecha: fechaPago,
        categoria: 'deudas',
        fechaRegistro: new Date().toISOString(),
        sincronizando: true
    };
    
    // Mostrar gasto inmediatamente
    gastosPersonales.unshift(gastoPorPago);
    
    // Cerrar modal y actualizar UI
    document.getElementById('pago-modal').classList.remove('active');
    actualizarUI();
    
    mostrarNotificacion('⏳ Procesando pago...', 'info');
    
    // Guardar en Firebase
    try {
        // Actualizar deuda
        await actualizarDeudaEnFirebase(deudaSeleccionada.id, {
            montoRestante: deudaActualizada.montoRestante,
            estado: deudaActualizada.estado,
            pagos: deudaActualizada.pagos
        });
        
        // Guardar gasto
        const firebaseIdGasto = await guardarGastoEnFirebase(gastoPorPago);
        
        // Actualizar ID del gasto
        const indexGasto = gastosPersonales.findIndex(g => g.id === tempIdGasto);
        if (indexGasto !== -1) {
            gastosPersonales[indexGasto].id = firebaseIdGasto;
            gastosPersonales[indexGasto].sincronizando = false;
        }
        
        mostrarNotificacion('✅ Pago registrado', 'success');
        
    } catch (error) {
        console.error("Error:", error);
        const indexGasto = gastosPersonales.findIndex(g => g.id === tempIdGasto);
        if (indexGasto !== -1) {
            gastosPersonales[indexGasto].error = true;
        }
        mostrarNotificacion('⚠️ Pago registrado (local)', 'warning');
    }
    
    deudaSeleccionada = null;
    guardarEnLocalStorage();
}

async function eliminarItem(coleccion, id, tipo) {
    if (!confirm(`¿Eliminar este ${tipo}?`)) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    // Guardar copia por si algo sale mal
    let itemEliminado = null;
    let arrayOriginal = [];
    
    if (coleccion === 'finanzas_ingresos') {
        itemEliminado = ingresos.find(i => i.id === id);
        arrayOriginal = [...ingresos];
        ingresos = ingresos.filter(i => i.id !== id);
    } else if (coleccion === 'finanzas_gastos') {
        itemEliminado = gastosPersonales.find(g => g.id === id);
        arrayOriginal = [...gastosPersonales];
        gastosPersonales = gastosPersonales.filter(g => g.id !== id);
    } else if (coleccion === 'finanzas_deudas') {
        itemEliminado = deudas.find(d => d.id === id);
        arrayOriginal = [...deudas];
        deudas = deudas.filter(d => d.id !== id);
    }
    
    actualizarUI();
    
    try {
        if (!id.toString().startsWith('temp_')) {
            await eliminarDeFirebase(coleccion, id);
            mostrarNotificacion('✅ Eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        // Restaurar si falla
        if (coleccion === 'finanzas_ingresos') {
            ingresos = arrayOriginal;
        } else if (coleccion === 'finanzas_gastos') {
            gastosPersonales = arrayOriginal;
        } else if (coleccion === 'finanzas_deudas') {
            deudas = arrayOriginal;
        }
        actualizarUI();
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    guardarEnLocalStorage();
}

// ==================================================
// ACTUALIZAR UI
// ==================================================

function actualizarUI() {
    actualizarResumen();
    mostrarIngresos();
    mostrarGastos();
    mostrarDeudas();
}

function actualizarResumen() {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // Ingresos del mes
    const ingresosMes = ingresos.filter(i => new Date(i.fecha) >= inicioMes);
    const totalIngresos = ingresosMes.reduce((sum, i) => sum + i.monto, 0);
    
    // Gastos del mes
    const gastosMes = gastosPersonales.filter(g => new Date(g.fecha) >= inicioMes);
    const totalGastos = gastosMes.reduce((sum, g) => sum + g.monto, 0);
    
    // Deuda total pendiente
    const deudaTotal = deudas
        .filter(d => d.estado === 'pendiente')
        .reduce((sum, d) => sum + d.montoRestante, 0);
    
    // Disponible
    const disponible = totalIngresos - totalGastos;
    
    // Actualizar DOM
    const elIngresos = document.getElementById('resumen-ingresos');
    const elGastos = document.getElementById('resumen-gastos');
    const elDisponible = document.getElementById('resumen-disponible');
    const elDeuda = document.getElementById('resumen-deuda');
    
    if (elIngresos) elIngresos.textContent = `S/${totalIngresos.toFixed(2)}`;
    if (elGastos) elGastos.textContent = `S/${totalGastos.toFixed(2)}`;
    if (elDisponible) {
        elDisponible.textContent = `S/${disponible.toFixed(2)}`;
        elDisponible.style.color = disponible < 0 ? 'var(--accent-color)' : 'var(--success-color)';
    }
    if (elDeuda) elDeuda.textContent = `S/${deudaTotal.toFixed(2)}`;
}

function mostrarIngresos() {
    const container = document.getElementById('lista-ingresos');
    if (!container) return;
    
    if (ingresos.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-arrow-down"></i>
                <h4>No hay ingresos registrados</h4>
                <p>Agrega tu primer ingreso</p>
            </div>
        `;
        return;
    }
    
    const ultimosIngresos = ingresos.slice(0, 5);
    
    let html = '';
    
    ultimosIngresos.forEach(ingreso => {
        const fecha = new Date(ingreso.fecha).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short'
        });
        
        let tipoTexto = {
            'fijo': '📅 Fijo',
            'variable': '📊 Variable',
            'extra': '✨ Extra'
        }[ingreso.tipo] || '📝';
        
        const sincronizandoIcon = ingreso.sincronizando ? '<i class="fas fa-sync fa-spin" style="margin-left: 8px;"></i>' : '';
        const errorIcon = ingreso.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color); margin-left: 8px;"></i>' : '';
        
        html += `
            <div class="ingreso-item">
                <div class="item-header">
                    <div class="item-monto">S/${ingreso.monto.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarItem('finanzas_ingresos', '${ingreso.id}', 'ingreso')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="item-descripcion">${ingreso.descripcion}</div>
                <div class="item-meta">
                    <span class="item-tipo">${tipoTexto}</span>
                    <span>${fecha}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarGastos() {
    const container = document.getElementById('lista-gastos');
    if (!container) return;
    
    if (gastosPersonales.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-arrow-up"></i>
                <h4>No hay gastos registrados</h4>
                <p>Agrega tu primer gasto personal</p>
            </div>
        `;
        return;
    }
    
    const ultimosGastos = gastosPersonales.slice(0, 5);
    
    let html = '';
    
    ultimosGastos.forEach(gasto => {
        const fecha = new Date(gasto.fecha).toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short'
        });
        
        const categorias = {
            'comida': '🍔 Comida',
            'transporte': '🚗 Transporte',
            'ocio': '🎮 Ocio',
            'salud': '🏥 Salud',
            'educacion': '📚 Educación',
            'deudas': '💳 Deudas',
            'otros': '📦 Otros'
        };
        
        const catTexto = categorias[gasto.categoria] || '📦 Otros';
        
        const sincronizandoIcon = gasto.sincronizando ? '<i class="fas fa-sync fa-spin" style="margin-left: 8px;"></i>' : '';
        const errorIcon = gasto.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color); margin-left: 8px;"></i>' : '';
        
        html += `
            <div class="gasto-item-personal">
                <div class="item-header">
                    <div class="item-monto">S/${gasto.monto.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarItem('finanzas_gastos', '${gasto.id}', 'gasto')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="item-descripcion">${gasto.descripcion}</div>
                <div class="item-meta">
                    <span class="item-categoria">${catTexto}</span>
                    <span>${fecha}</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarDeudas() {
    const pendientes = deudas.filter(d => d.estado === 'pendiente');
    const pagadas = deudas.filter(d => d.estado === 'pagada');
    
    mostrarDeudasPendientes(pendientes);
    mostrarDeudasPagadas(pagadas);
}

function mostrarDeudasPendientes(deudasPendientes) {
    const container = document.getElementById('lista-deudas-pendientes');
    if (!container) return;
    
    if (deudasPendientes.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-check-circle"></i>
                <h4>¡Sin deudas pendientes!</h4>
                <p>Buen trabajo</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    deudasPendientes.forEach(deuda => {
        const fechaVence = deuda.fechaVencimiento ? 
            new Date(deuda.fechaVencimiento).toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short'
            }) : 'Sin fecha';
        
        const porcentajePagado = ((deuda.montoTotal - deuda.montoRestante) / deuda.montoTotal * 100).toFixed(0);
        
        const sincronizandoIcon = deuda.sincronizando ? '<i class="fas fa-sync fa-spin" style="margin-left: 8px;"></i>' : '';
        const errorIcon = deuda.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color); margin-left: 8px;"></i>' : '';
        
        html += `
            <div class="deuda-item pendiente">
                <div class="item-header">
                    <div class="item-monto">S/${deuda.montoRestante.toFixed(2)} <span style="font-size: 0.8rem; color: var(--text-secondary);">de S/${deuda.montoTotal.toFixed(2)}</span> ${sincronizandoIcon} ${errorIcon}</div>
                    <div class="item-actions">
                        <button class="pagar-btn" onclick="mostrarModalPago('${deuda.id}')">
                            <i class="fas fa-hand-holding-usd"></i> Pagar
                        </button>
                        <button class="delete-btn" onclick="eliminarItem('finanzas_deudas', '${deuda.id}', 'deuda')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="item-descripcion">${deuda.descripcion}</div>
                <div class="item-meta">
                    <span class="item-acreedor"><i class="fas fa-user"></i> ${deuda.acreedor}</span>
                    <span><i class="far fa-calendar"></i> Vence: ${fechaVence}</span>
                </div>
                <div style="margin-top: 10px;">
                    <div style="font-size: 0.8rem; margin-bottom: 5px;">Pagado: ${porcentajePagado}%</div>
                    <div class="progress-bar" style="height: 5px;">
                        <div class="progress-fill" style="width: ${porcentajePagado}%; background: var(--gradient-success);"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function mostrarDeudasPagadas(deudasPagadas) {
    const container = document.getElementById('lista-deudas-pagadas');
    if (!container) return;
    
    if (deudasPagadas.length === 0) {
        container.innerHTML = `
            <div class="empty-state-small">
                <i class="fas fa-history"></i>
                <h4>No hay deudas pagadas</h4>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    deudasPagadas.forEach(deuda => {
        const sincronizandoIcon = deuda.sincronizando ? '<i class="fas fa-sync fa-spin" style="margin-left: 8px;"></i>' : '';
        const errorIcon = deuda.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color); margin-left: 8px;"></i>' : '';
        
        html += `
            <div class="deuda-item pagada">
                <div class="item-header">
                    <div class="item-monto">S/${deuda.montoTotal.toFixed(2)} ${sincronizandoIcon} ${errorIcon}</div>
                    <button class="delete-btn" onclick="eliminarItem('finanzas_deudas', '${deuda.id}', 'deuda')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="item-descripcion">${deuda.descripcion}</div>
                <div class="item-meta">
                    <span class="item-acreedor"><i class="fas fa-user"></i> ${deuda.acreedor}</span>
                    <span><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Pagada</span>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ==================================================
// EVENTOS
// ==================================================

function configurarEventos() {
    console.log("🔧 Configurando eventos...");
    
    // Tema
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTema);
    
    // Volver
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            window.location.href = 'index.html';
        });
    }
    
    // Pestañas de persona
    document.querySelectorAll('.person-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const nuevaPersona = this.dataset.person;
            if (nuevaPersona !== personaActual) {
                window.location.href = `finanzas-personales.html?persona=${nuevaPersona}`;
            }
        });
    });
    
    // Mostrar/ocultar formularios
    const showIngreso = document.getElementById('show-ingreso-form');
    if (showIngreso) {
        showIngreso.addEventListener('click', () => {
            document.getElementById('form-ingreso').style.display = 'block';
        });
    }
    
    const showGasto = document.getElementById('show-gasto-form');
    if (showGasto) {
        showGasto.addEventListener('click', () => {
            document.getElementById('form-gasto').style.display = 'block';
        });
    }
    
    const showDeuda = document.getElementById('show-deuda-form');
    if (showDeuda) {
        showDeuda.addEventListener('click', () => {
            document.getElementById('form-deuda').style.display = 'block';
        });
    }
    
    // Guardar
    const guardarIngreso = document.getElementById('guardar-ingreso');
    if (guardarIngreso) guardarIngreso.addEventListener('click', agregarIngreso);
    
    const guardarGasto = document.getElementById('guardar-gasto');
    if (guardarGasto) guardarGasto.addEventListener('click', agregarGastoPersonal);
    
    const guardarDeuda = document.getElementById('guardar-deuda');
    if (guardarDeuda) guardarDeuda.addEventListener('click', agregarDeuda);
    
    // Enter en campos
    const descIngreso = document.getElementById('descripcion-ingreso');
    if (descIngreso) {
        descIngreso.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') agregarIngreso();
        });
    }
    
    const descGasto = document.getElementById('descripcion-gasto');
    if (descGasto) {
        descGasto.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') agregarGastoPersonal();
        });
    }
    
    // Pestañas de deudas
    document.querySelectorAll('.deuda-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabTipo = this.dataset.deudaTab;
            
            document.querySelectorAll('.deuda-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            const pendientes = document.getElementById('lista-deudas-pendientes');
            const pagadas = document.getElementById('lista-deudas-pagadas');
            
            if (pendientes && pagadas) {
                if (tabTipo === 'pendientes') {
                    pendientes.style.display = 'block';
                    pagadas.style.display = 'none';
                } else {
                    pendientes.style.display = 'none';
                    pagadas.style.display = 'block';
                }
            }
        });
    });
    
    // Modal de pago
    const pagoCompleto = document.getElementById('pago-completo');
    if (pagoCompleto) {
        pagoCompleto.addEventListener('change', function() {
            if (this.checked && deudaSeleccionada) {
                document.getElementById('monto-pago').value = deudaSeleccionada.montoRestante.toFixed(2);
            }
        });
    }
    
    const cancelPago = document.getElementById('cancel-pago');
    if (cancelPago) {
        cancelPago.addEventListener('click', () => {
            document.getElementById('pago-modal').classList.remove('active');
            deudaSeleccionada = null;
        });
    }
    
    const confirmarPago = document.getElementById('confirmar-pago');
    if (confirmarPago) confirmarPago.addEventListener('click', procesarPago);
    
    // Editar nombre
    const editNames = document.getElementById('edit-names');
    if (editNames) {
        editNames.addEventListener('click', () => {
            document.getElementById('nombre-personal').value = configFinanzas.nombres[personaActual];
            document.getElementById('names-modal').classList.add('active');
        });
    }
    
    const saveNames = document.getElementById('save-names');
    if (saveNames) saveNames.addEventListener('click', guardarNombre);
    
    const cancelNames = document.getElementById('cancel-names');
    if (cancelNames) {
        cancelNames.addEventListener('click', () => {
            document.getElementById('names-modal').classList.remove('active');
        });
    }
    
    // Cerrar modales con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('pago-modal')?.classList.remove('active');
            document.getElementById('names-modal')?.classList.remove('active');
        }
    });
}

async function guardarNombre() {
    const nuevoNombre = document.getElementById('nombre-personal').value.trim();
    
    if (nuevoNombre) {
        configFinanzas.nombres[personaActual] = nuevoNombre;
        
        if (personaActual === 'yo') {
            const tabYo = document.getElementById('tab-yo');
            if (tabYo) tabYo.textContent = nuevoNombre;
        } else {
            const tabElla = document.getElementById('tab-ella');
            if (tabElla) tabElla.textContent = nuevoNombre;
        }
        
        document.getElementById('names-modal').classList.remove('active');
        mostrarNotificacion('Nombre actualizado', 'success');
        
        // Guardar en localStorage
        localStorage.setItem('finanzas_config', JSON.stringify(configFinanzas));
    }
}

// ==================================================
// UTILIDADES
// ==================================================

function toggleTema() {
    const temaActual = document.documentElement.getAttribute('data-theme');
    const nuevoTema = temaActual === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', nuevoTema);
    localStorage.setItem('tema', nuevoTema);
    actualizarIconoTema(nuevoTema);
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

// Hacer funciones globales
window.eliminarItem = eliminarItem;
window.mostrarModalPago = mostrarModalPago;

console.log("💰 app-finanzas.js cargado correctamente (versión sin recargas)");