// app-finanzas.js - Lógica para finanzas personales
// ==================================================

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
    document.getElementById('fecha-ingreso').value = hoy;
    document.getElementById('fecha-gasto-personal').value = hoy;
    document.getElementById('fecha-pago').value = hoy;
    
    // Actualizar título según persona
    actualizarTituloPersona();
}

function actualizarTituloPersona() {
    const titulo = document.getElementById('page-title');
    const tabYo = document.getElementById('tab-yo');
    const tabElla = document.getElementById('tab-ella');
    
    if (personaActual === 'yo') {
        titulo.textContent = 'Mis Finanzas';
        document.querySelector('.person-tab[data-person="yo"]').classList.add('active');
        document.querySelector('.person-tab[data-person="ella"]').classList.remove('active');
    } else {
        titulo.textContent = 'Sus Finanzas';
        document.querySelector('.person-tab[data-person="yo"]').classList.remove('active');
        document.querySelector('.person-tab[data-person="ella"]').classList.add('active');
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

function setupRealtimeListeners() {
    const db = firebase.firestore();
    
    // Ingresos
    if (unsubscribeIngresos) unsubscribeIngresos();
    unsubscribeIngresos = db.collection('finanzas_ingresos')
        .where('sharedId', '==', 'nuestra_pareja')
        .where('persona', '==', personaActual)
        .orderBy('fecha', 'desc')
        .onSnapshot((snapshot) => {
            console.log("📥 Cambios en ingresos");
            
            // Limpiar array
            ingresos = [];
            
            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                ingresos.push(data);
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
            console.log("📤 Cambios en gastos personales");
            
            gastosPersonales = [];
            
            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                gastosPersonales.push(data);
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
            console.log("💳 Cambios en deudas");
            
            deudas = [];
            
            snapshot.forEach(doc => {
                const data = { id: doc.id, ...doc.data() };
                deudas.push(data);
            });
            
            actualizarUI();
            guardarEnLocalStorage();
        });
}

async function guardarIngresoEnFirebase(ingreso) {
    try {
        const db = firebase.firestore();
        const ingresoData = {
            ...ingreso,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (ingresoData.id && ingresoData.id.toString().startsWith('local_')) {
            delete ingresoData.id;
        }
        
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
            ...gasto,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (gastoData.id && gastoData.id.toString().startsWith('local_')) {
            delete gastoData.id;
        }
        
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
            ...deuda,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (deudaData.id && deudaData.id.toString().startsWith('local_')) {
            delete deudaData.id;
        }
        
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
// FUNCIONES PRINCIPALES
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
    
    const nuevoIngreso = {
        id: 'local_' + Date.now(),
        persona: personaActual,
        monto: monto,
        descripcion: descripcion,
        fecha: fecha,
        tipo: tipo,
        fechaRegistro: new Date().toISOString()
    };
    
    // Limpiar formulario
    document.getElementById('monto-ingreso').value = '';
    document.getElementById('descripcion-ingreso').value = '';
    document.getElementById('form-ingreso').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando ingreso...', 'info');
    
    setTimeout(async () => {
        try {
            await guardarIngresoEnFirebase(nuevoIngreso);
            mostrarNotificacion(`✅ Ingreso de S/${monto.toFixed(2)} guardado`, 'success');
        } catch (error) {
            console.error("Error:", error);
            mostrarNotificacion('✅ Ingreso guardado (local)', 'warning');
        }
    }, 500);
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
    
    const nuevoGasto = {
        id: 'local_' + Date.now(),
        persona: personaActual,
        monto: monto,
        descripcion: descripcion,
        fecha: fecha,
        categoria: categoria,
        fechaRegistro: new Date().toISOString()
    };
    
    // Limpiar formulario
    document.getElementById('monto-gasto').value = '';
    document.getElementById('descripcion-gasto').value = '';
    document.getElementById('form-gasto').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando gasto...', 'info');
    
    setTimeout(async () => {
        try {
            await guardarGastoEnFirebase(nuevoGasto);
            mostrarNotificacion(`✅ Gasto de S/${monto.toFixed(2)} guardado`, 'success');
        } catch (error) {
            console.error("Error:", error);
            mostrarNotificacion('✅ Gasto guardado (local)', 'warning');
        }
    }, 500);
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
    
    const nuevaDeuda = {
        id: 'local_' + Date.now(),
        persona: personaActual,
        descripcion: descripcion,
        montoTotal: monto,
        montoRestante: estado === 'pagada' ? 0 : monto,
        acreedor: acreedor,
        fechaVencimiento: fechaVencimiento || null,
        estado: estado, // 'pendiente' o 'pagada'
        pagos: [], // Historial de pagos
        fechaRegistro: new Date().toISOString()
    };
    
    // Limpiar formulario
    document.getElementById('descripcion-deuda').value = '';
    document.getElementById('monto-deuda').value = '';
    document.getElementById('acreedor-deuda').value = '';
    document.getElementById('fecha-vencimiento').value = '';
    document.getElementById('estado-deuda').value = 'pendiente';
    document.getElementById('form-deuda').style.display = 'none';
    
    mostrarNotificacion('⏳ Guardando deuda...', 'info');
    
    setTimeout(async () => {
        try {
            await guardarDeudaEnFirebase(nuevaDeuda);
            mostrarNotificacion('✅ Deuda registrada', 'success');
        } catch (error) {
            console.error("Error:", error);
            mostrarNotificacion('✅ Deuda guardada (local)', 'warning');
        }
    }, 500);
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
    
    // Actualizar deuda
    const deudaActualizada = { ...deudaSeleccionada };
    deudaActualizada.montoRestante -= montoPago;
    deudaActualizada.pagos = deudaActualizada.pagos || [];
    deudaActualizada.pagos.push(nuevoPago);
    
    if (deudaActualizada.montoRestante <= 0) {
        deudaActualizada.estado = 'pagada';
        deudaActualizada.montoRestante = 0;
    }
    
    // Cerrar modal
    document.getElementById('pago-modal').classList.remove('active');
    
    mostrarNotificacion('⏳ Procesando pago...', 'info');
    
    // También crear un gasto automático por el pago
    const gastoPorPago = {
        id: 'local_' + Date.now() + '_pago',
        persona: personaActual,
        monto: montoPago,
        descripcion: `Pago de deuda: ${deudaSeleccionada.descripcion}`,
        fecha: fechaPago,
        categoria: 'deudas',
        fechaRegistro: new Date().toISOString()
    };
    
    setTimeout(async () => {
        try {
            // Actualizar deuda
            await actualizarDeudaEnFirebase(deudaSeleccionada.id, {
                montoRestante: deudaActualizada.montoRestante,
                estado: deudaActualizada.estado,
                pagos: deudaActualizada.pagos
            });
            
            // Guardar gasto
            await guardarGastoEnFirebase(gastoPorPago);
            
            mostrarNotificacion('✅ Pago registrado', 'success');
        } catch (error) {
            console.error("Error:", error);
            mostrarNotificacion('✅ Pago registrado (local)', 'warning');
        }
    }, 500);
}

async function eliminarItem(coleccion, id, tipo) {
    if (!confirm(`¿Eliminar este ${tipo}?`)) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    try {
        if (!id.toString().startsWith('local_')) {
            await eliminarDeFirebase(coleccion, id);
        } else {
            // Actualizar array local correspondiente
            if (coleccion === 'finanzas_ingresos') {
                ingresos = ingresos.filter(i => i.id !== id);
            } else if (coleccion === 'finanzas_gastos') {
                gastosPersonales = gastosPersonales.filter(g => g.id !== id);
            } else if (coleccion === 'finanzas_deudas') {
                deudas = deudas.filter(d => d.id !== id);
            }
            actualizarUI();
            guardarEnLocalStorage();
            mostrarNotificacion('✅ Eliminado', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        mostrarNotificacion('Error al eliminar', 'error');
    }
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
    
    // Gastos del mes (incluyendo pagos de deudas)
    const gastosMes = gastosPersonales.filter(g => new Date(g.fecha) >= inicioMes);
    const totalGastos = gastosMes.reduce((sum, g) => sum + g.monto, 0);
    
    // Deuda total pendiente
    const deudaTotal = deudas
        .filter(d => d.estado === 'pendiente')
        .reduce((sum, d) => sum + d.montoRestante, 0);
    
    // Disponible
    const disponible = totalIngresos - totalGastos;
    
    // Actualizar DOM
    document.getElementById('resumen-ingresos').textContent = `S/${totalIngresos.toFixed(2)}`;
    document.getElementById('resumen-gastos').textContent = `S/${totalGastos.toFixed(2)}`;
    document.getElementById('resumen-disponible').textContent = `S/${disponible.toFixed(2)}`;
    document.getElementById('resumen-deuda').textContent = `S/${deudaTotal.toFixed(2)}`;
    
    // Colorear disponible
    const disponibleElement = document.getElementById('resumen-disponible');
    if (disponible < 0) {
        disponibleElement.style.color = 'var(--accent-color)';
    } else {
        disponibleElement.style.color = 'var(--success-color)';
    }
}

function mostrarIngresos() {
    const container = document.getElementById('lista-ingresos');
    
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
    
    // Mostrar últimos 5 ingresos
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
        
        html += `
            <div class="ingreso-item">
                <div class="item-header">
                    <div class="item-monto">S/${ingreso.monto.toFixed(2)}</div>
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
    
    // Mostrar últimos 5 gastos
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
        
        html += `
            <div class="gasto-item-personal">
                <div class="item-header">
                    <div class="item-monto">S/${gasto.monto.toFixed(2)}</div>
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
        
        html += `
            <div class="deuda-item pendiente">
                <div class="item-header">
                    <div class="item-monto">S/${deuda.montoRestante.toFixed(2)} <span style="font-size: 0.8rem; color: var(--text-secondary);">de S/${deuda.montoTotal.toFixed(2)}</span></div>
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
        html += `
            <div class="deuda-item pagada">
                <div class="item-header">
                    <div class="item-monto">S/${deuda.montoTotal.toFixed(2)}</div>
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
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Volver
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
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
    document.getElementById('show-ingreso-form').addEventListener('click', () => {
        document.getElementById('form-ingreso').style.display = 'block';
    });
    
    document.getElementById('show-gasto-form').addEventListener('click', () => {
        document.getElementById('form-gasto').style.display = 'block';
    });
    
    document.getElementById('show-deuda-form').addEventListener('click', () => {
        document.getElementById('form-deuda').style.display = 'block';
    });
    
    // Guardar
    document.getElementById('guardar-ingreso').addEventListener('click', agregarIngreso);
    document.getElementById('guardar-gasto').addEventListener('click', agregarGastoPersonal);
    document.getElementById('guardar-deuda').addEventListener('click', agregarDeuda);
    
    // Enter en campos
    document.getElementById('descripcion-ingreso').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') agregarIngreso();
    });
    
    document.getElementById('descripcion-gasto').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') agregarGastoPersonal();
    });
    
    // Pestañas de deudas
    document.querySelectorAll('.deuda-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabTipo = this.dataset.deudaTab;
            
            document.querySelectorAll('.deuda-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            if (tabTipo === 'pendientes') {
                document.getElementById('lista-deudas-pendientes').style.display = 'block';
                document.getElementById('lista-deudas-pagadas').style.display = 'none';
            } else {
                document.getElementById('lista-deudas-pendientes').style.display = 'none';
                document.getElementById('lista-deudas-pagadas').style.display = 'block';
            }
        });
    });
    
    // Modal de pago
    document.getElementById('pago-completo').addEventListener('change', function() {
        if (this.checked && deudaSeleccionada) {
            document.getElementById('monto-pago').value = deudaSeleccionada.montoRestante.toFixed(2);
        }
    });
    
    document.getElementById('cancel-pago').addEventListener('click', () => {
        document.getElementById('pago-modal').classList.remove('active');
        deudaSeleccionada = null;
    });
    
    document.getElementById('confirmar-pago').addEventListener('click', procesarPago);
    
    // Editar nombre
    document.getElementById('edit-names').addEventListener('click', () => {
        document.getElementById('nombre-personal').value = configFinanzas.nombres[personaActual];
        document.getElementById('names-modal').classList.add('active');
    });
    
    document.getElementById('save-names').addEventListener('click', guardarNombre);
    document.getElementById('cancel-names').addEventListener('click', () => {
        document.getElementById('names-modal').classList.remove('active');
    });
    
    // Cerrar modales con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('pago-modal').classList.remove('active');
            document.getElementById('names-modal').classList.remove('active');
        }
    });
}

async function guardarNombre() {
    const nuevoNombre = document.getElementById('nombre-personal').value.trim();
    
    if (nuevoNombre) {
        configFinanzas.nombres[personaActual] = nuevoNombre;
        
        if (personaActual === 'yo') {
            document.getElementById('tab-yo').textContent = nuevoNombre;
        } else {
            document.getElementById('tab-ella').textContent = nuevoNombre;
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
    if (tema === 'dark') {
        icono.className = 'fas fa-sun';
    } else {
        icono.className = 'fas fa-moon';
    }
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

// Hacer funciones globales
window.eliminarItem = eliminarItem;
window.mostrarModalPago = mostrarModalPago;

console.log("💰 app-finanzas.js cargado correctamente");