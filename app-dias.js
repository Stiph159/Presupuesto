// ====================
// CONFIGURACIÓN INICIAL - DÍAS ESPECIALES
// ====================

// Variables globales
let diasEspeciales = [];
let configDias = {
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let iconoSeleccionado = '❤️';
let unsubscribeDias = null;

// ====================
// FUNCIONES FIREBASE
// ====================

async function initFirebaseDias() {
    try {
        console.log("📅 Inicializando Firebase para días especiales...");
        
        if (typeof firebase === 'undefined') {
            console.error("Firebase no está cargado");
            return false;
        }
        
        // Autenticación anónima
        try {
            await firebase.auth().signInAnonymously();
        } catch (authError) {
            console.warn("No se pudo autenticar:", authError);
        }
        
        // Cargar configuración
        await loadConfigDiasFromFirebase();
        
        // Configurar listeners en tiempo real
        setupRealtimeListenersDias();
        
        mostrarNotificacion("✅ Días especiales sincronizados", "success");
        return true;
    } catch (error) {
        console.error("❌ Error inicializando Firebase:", error);
        mostrarNotificacion("⚠️ Usando datos locales", "warning");
        return false;
    }
}

async function loadConfigDiasFromFirebase() {
    try {
        const db = firebase.firestore();
        const configDoc = await db.collection('config').doc('nuestra_pareja').get();
        
        if (configDoc.exists) {
            const configData = configDoc.data();
            if (configData.nombres) {
                configDias.nombres = configData.nombres;
            }
            console.log("✅ Configuración cargada desde Firebase");
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
    }
}

function setupRealtimeListenersDias() {
    // Detener listener anterior si existe
    if (unsubscribeDias) unsubscribeDias();
    
    const db = firebase.firestore();
    
    // Escuchar cambios en días especiales
    unsubscribeDias = db.collection('dias_especiales')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('fecha', 'asc')
        .onSnapshot((snapshot) => {
            console.log("🔄 Cambios detectados en días especiales:", snapshot.docChanges().length);
            
            // Limpiar array completamente
            diasEspeciales = [];
            
            // Llenar con datos actuales de Firebase
            snapshot.forEach(doc => {
                const diaData = {
                    id: doc.id,
                    ...doc.data()
                };
                
                diasEspeciales.push(diaData);
            });
            
            // Actualizar UI
            actualizarUIDias();
            
            // Guardar backup local
            saveDiasToLocalStorage();
            
            console.log("✅ Días actualizados desde Firebase:", diasEspeciales.length);
            
        }, (error) => {
            console.error("❌ Error en listener de días:", error);
        });
}

async function saveDiaToFirebase(dia) {
    try {
        const db = firebase.firestore();
        const diaData = {
            ...dia,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Eliminar id local si existe
        if (diaData.id && diaData.id.toString().startsWith('local_')) {
            delete diaData.id;
        }
        
        const docRef = await db.collection('dias_especiales').add(diaData);
        console.log("✅ Día guardado en Firebase con ID:", docRef.id);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando en Firebase:", error);
        throw error;
    }
}

async function deleteDiaFromFirebase(id) {
    try {
        await firebase.firestore().collection('dias_especiales').doc(id).delete();
        console.log("✅ Día eliminado de Firebase:", id);
    } catch (error) {
        console.error("❌ Error eliminando de Firebase:", error);
        throw error;
    }
}

async function saveConfigDiasToFirebase() {
    try {
        const db = firebase.firestore();
        const configData = {
            ...configDias
        };
        
        await db.collection('config')
            .doc('nuestra_pareja')
            .set(configData, { merge: true });
        console.log("✅ Configuración guardada en Firebase");
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE (BACKUP)
// ====================

function saveDiasToLocalStorage() {
    try {
        localStorage.setItem('dias_especiales', JSON.stringify(diasEspeciales));
        localStorage.setItem('dias_config', JSON.stringify(configDias));
    } catch (error) {
        console.error("Error guardando en localStorage:", error);
    }
}

function loadDiasFromLocalStorage() {
    try {
        const savedDias = localStorage.getItem('dias_especiales');
        const savedConfig = localStorage.getItem('dias_config');
        
        if (savedDias) {
            diasEspeciales = JSON.parse(savedDias);
        }
        
        if (savedConfig) {
            configDias = JSON.parse(savedConfig);
        }
    } catch (error) {
        console.error("Error cargando de localStorage:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("📅 Iniciando aplicación de días especiales...");
    
    // Primero cargar desde localStorage (más rápido)
    loadDiasFromLocalStorage();
    
    // Inicializar app básica
    inicializarAppDias();
    actualizarUIDias();
    
    // Luego conectar con Firebase
    setTimeout(async () => {
        await initFirebaseDias();
    }, 1000);
});

function inicializarAppDias() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventosDias();
    
    // Configurar fecha por defecto (mañana)
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    document.getElementById('fecha-dia').value = manana.toISOString().split('T')[0];
    
    console.log("✅ App días especiales inicializada");
}

// ====================
// FUNCIONES PRINCIPALES
// ====================

async function agregarDia() {
    const nombre = document.getElementById('nombre-dia').value.trim();
    const fecha = document.getElementById('fecha-dia').value;
    const notificacion = document.getElementById('notificacion-dia').checked;
    
    // Validaciones
    if (!nombre || !fecha) {
        mostrarNotificacion('Por favor completa todos los campos', 'error');
        return;
    }
    
    // Crear objeto de día
    const nuevoDia = {
        id: 'local_' + Date.now(), // ID temporal
        nombre: nombre,
        fecha: fecha,
        notificacion: notificacion,
        icono: iconoSeleccionado,
        timestamp: new Date()
    };
    
    // Limpiar formulario
    document.getElementById('nombre-dia').value = '';
    document.getElementById('nombre-dia').focus();
    
    // Mostrar confirmación
    mostrarNotificacion(`⏳ Guardando "${nombre}"...`, 'info');
    
    // Guardar en Firebase (en segundo plano)
    setTimeout(async () => {
        try {
            const firebaseId = await saveDiaToFirebase(nuevoDia);
            nuevoDia.id = firebaseId;
            mostrarNotificacion(`✅ "${nombre}" agregado`, 'success');
        } catch (error) {
            console.error("Error guardando en Firebase:", error);
            mostrarNotificacion(`✅ "${nombre}" agregado (local)`, 'warning');
        }
        saveDiasToLocalStorage();
    }, 500);
}

async function eliminarDia(id) {
    if (!confirm('¿Estás seguro de eliminar este día especial?')) return;
    
    // Mostrar notificación inmediatamente
    mostrarNotificacion('⏳ Eliminando día...', 'info');
    
    // Intentar eliminar de Firebase
    try {
        if (id && !id.toString().startsWith('local_')) {
            await deleteDiaFromFirebase(id);
        } else {
            // Si es un ID local, eliminar del array local
            const index = diasEspeciales.findIndex(d => d.id === id);
            if (index !== -1) {
                diasEspeciales.splice(index, 1);
                actualizarUIDias();
                saveDiasToLocalStorage();
                mostrarNotificacion('Día eliminado (local)', 'success');
            }
        }
    } catch (error) {
        console.error("Error eliminando día:", error);
        mostrarNotificacion('Error al eliminar el día', 'error');
    }
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configDias.nombres.persona1 = nombre1;
    configDias.nombres.persona2 = nombre2;
    
    // Actualizar UI
    actualizarNombresEnUIDias();
    ocultarModal('names-modal');
    
    // Guardar en Firebase
    try {
        await saveConfigDiasToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres en Firebase:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    // Guardar localmente
    saveDiasToLocalStorage();
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosDias() {
    console.log("🔗 Configurando eventos de días especiales...");
    
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Botón volver
    document.getElementById('back-btn').addEventListener('click', function() {
        window.location.href = 'index.html';
    });
    
    // Selector de iconos
    document.querySelectorAll('.icon-option').forEach(icono => {
        icono.addEventListener('click', function() {
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            iconoSeleccionado = this.dataset.icon;
            console.log("✅ Icono seleccionado:", iconoSeleccionado);
        });
    });
    
    // Botón agregar día
    document.getElementById('add-dia-btn').addEventListener('click', agregarDia);
    
    // Enter en nombre también agrega
    document.getElementById('nombre-dia').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarDia();
    });
    
    // Botón editar nombres
    document.getElementById('edit-names').addEventListener('click', mostrarModalNombres);
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', ocultarModalNombres);
    
    // Búsqueda
    document.getElementById('search-toggle-dias').addEventListener('click', toggleBusquedaDias);
    document.getElementById('search-clear-dias').addEventListener('click', limpiarBusquedaDias);
    document.getElementById('search-input-dias').addEventListener('input', filtrarDias);
    
    // Filtros
    document.getElementById('filter-notificacion').addEventListener('change', filtrarDias);
    document.getElementById('filter-mes').addEventListener('change', filtrarDias);
    document.getElementById('filter-ano').addEventListener('change', filtrarDias);
    document.getElementById('clear-filters-dias').addEventListener('click', limpiarFiltrosDias);
    
    // Cerrar modal con Escape
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
        }
    });
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUIDias() {
    actualizarProximosDias();
    filtrarDias();
}

function actualizarNombresEnUIDias() {
    // Si tienes elementos que muestran nombres, actualízalos aquí
    console.log("Nombres actualizados:", configDias.nombres);
}

function actualizarProximosDias() {
    const hoy = new Date().toISOString().split('T')[0];
    const proximosDias = diasEspeciales
        .filter(dia => dia.fecha >= hoy)
        .slice(0, 3); // Mostrar solo los 3 próximos
    
    const container = document.getElementById('proximos-container');
    const diasRestantes = document.getElementById('dias-restantes');
    
    if (!container) return;
    
    if (proximosDias.length === 0) {
        container.innerHTML = `
            <div class="proximo-item" style="background: var(--card-bg); color: var(--text-color);">
                <div class="proximo-icon"><i class="fas fa-calendar-plus"></i></div>
                <div class="proximo-content">
                    <h4>No hay días próximos</h4>
                    <p>Agrega algún día especial</p>
                </div>
            </div>
        `;
        if (diasRestantes) diasRestantes.textContent = "0 días próximos";
        return;
    }
    
    if (diasRestantes) diasRestantes.textContent = `${proximosDias.length} días próximos`;
    
    let html = '';
    
    proximosDias.forEach(dia => {
        const fechaObj = new Date(dia.fecha);
        const hoyObj = new Date();
        const diasFaltantes = Math.ceil((fechaObj - hoyObj) / (1000 * 60 * 60 * 24));
        
        let mensaje = '';
        if (diasFaltantes === 0) {
            mensaje = '¡Es hoy!';
        } else if (diasFaltantes === 1) {
            mensaje = 'Mañana';
        } else {
            mensaje = `En ${diasFaltantes} días`;
        }
        
        const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        html += `
            <div class="proximo-item">
                <div class="proximo-icon">${dia.icono || '📅'}</div>
                <div class="proximo-content">
                    <h4>${dia.nombre}</h4>
                    <p>${mensaje} • ${fechaFormateada}</p>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function filtrarDias() {
    const searchTerm = document.getElementById('search-input-dias').value.toLowerCase();
    const notificacion = document.getElementById('filter-notificacion').value;
    const mes = document.getElementById('filter-mes').value;
    const ano = document.getElementById('filter-ano').value;
    
    let diasFiltrados = [...diasEspeciales];
    
    // Aplicar filtros
    if (searchTerm) {
        diasFiltrados = diasFiltrados.filter(dia => 
            dia.nombre.toLowerCase().includes(searchTerm)
        );
    }
    
    if (notificacion) {
        if (notificacion === 'on') {
            diasFiltrados = diasFiltrados.filter(dia => dia.notificacion === true);
        } else if (notificacion === 'off') {
            diasFiltrados = diasFiltrados.filter(dia => dia.notificacion === false);
        }
    }
    
    if (mes) {
        diasFiltrados = diasFiltrados.filter(dia => {
            const fecha = new Date(dia.fecha);
            return (fecha.getMonth() + 1).toString() === mes;
        });
    }
    
    if (ano) {
        diasFiltrados = diasFiltrados.filter(dia => {
            const fecha = new Date(dia.fecha);
            return fecha.getFullYear().toString() === ano;
        });
    }
    
    // Ordenar por fecha
    diasFiltrados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    // Mostrar resultados
    mostrarDiasFiltrados(diasFiltrados);
}

function mostrarDiasFiltrados(diasFiltrados) {
    const container = document.getElementById('dias-container');
    const emptyState = document.getElementById('empty-state-dias');
    
    if (!container || !emptyState) return;
    
    if (diasFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="far fa-search"></i>
                <h4>No se encontraron días</h4>
                <p>Intenta con otros filtros o términos de búsqueda.</p>
            </div>
        `;
        emptyState.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    
    const hoy = new Date().toISOString().split('T')[0];
    let html = '';
    
    diasFiltrados.forEach(dia => {
        const fechaObj = new Date(dia.fecha);
        const fechaFormateada = fechaObj.toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const esPasado = dia.fecha < hoy;
        
        html += `
            <div class="dia-item ${esPasado ? 'pasado' : ''}">
                <div class="dia-icon">${dia.icono || '📅'}</div>
                <div class="dia-content">
                    <div class="dia-header">
                        <div class="dia-nombre">${dia.nombre}</div>
                        <div class="dia-fecha">${fechaFormateada}</div>
                    </div>
                    <div class="dia-notificacion ${dia.notificacion ? 'on' : 'off'}">
                        <i class="fas ${dia.notificacion ? 'fa-bell' : 'fa-bell-slash'}"></i>
                        ${dia.notificacion ? 'Notificación activada' : 'Sin notificación'}
                    </div>
                </div>
                <div class="dia-actions">
                    <button class="delete-btn" onclick="eliminarDia('${dia.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
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

function toggleBusquedaDias() {
    const searchBox = document.getElementById('search-box-dias');
    searchBox.style.display = searchBox.style.display === 'none' ? 'block' : 'none';
    
    if (searchBox.style.display === 'block') {
        document.getElementById('search-input-dias').focus();
    }
}

function limpiarBusquedaDias() {
    document.getElementById('search-input-dias').value = '';
    filtrarDias();
}

function limpiarFiltrosDias() {
    document.getElementById('search-input-dias').value = '';
    document.getElementById('filter-notificacion').value = '';
    document.getElementById('filter-mes').value = '';
    document.getElementById('filter-ano').value = '';
    document.getElementById('search-box-dias').style.display = 'none';
    
    filtrarDias();
    mostrarNotificacion('Filtros limpiados', 'info');
}

function mostrarModalNombres() {
    document.getElementById('nombre-persona1').value = configDias.nombres.persona1;
    document.getElementById('nombre-persona2').value = configDias.nombres.persona2;
    document.getElementById('names-modal').classList.add('active');
}

function ocultarModalNombres() {
    document.getElementById('names-modal').classList.remove('active');
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

// Hacer funciones disponibles globalmente
window.eliminarDia = eliminarDia;

console.log("✅ app-dias.js cargado correctamente");