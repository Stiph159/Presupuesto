// File: app-dias.js
// ====================
// VERSIÓN CORREGIDA - SIN RECARGAS
// ====================

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
        
        try {
            await firebase.auth().signInAnonymously();
        } catch (authError) {
            console.warn("No se pudo autenticar:", authError);
        }
        
        await loadConfigDiasFromFirebase();
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
        }
    } catch (error) {
        console.error("❌ Error cargando configuración:", error);
    }
}

// ====================
// LISTENER CORREGIDO (SIN RECARGAS)
// ====================

function setupRealtimeListenersDias() {
    if (unsubscribeDias) unsubscribeDias();
    
    const db = firebase.firestore();
    
    unsubscribeDias = db.collection('dias_especiales')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('fecha', 'asc')
        .onSnapshot((snapshot) => {
            console.log("📅 Cambios detectados en días especiales:", snapshot.docChanges().length);
            
            snapshot.docChanges().forEach(cambio => {
                const diaData = {
                    id: cambio.doc.id,
                    ...cambio.doc.data()
                };
                
                switch (cambio.type) {
                    case 'added':
                        const existe = diasEspeciales.some(d => d.id === diaData.id);
                        if (!existe && !diaData.id.toString().startsWith('temp_')) {
                            console.log("➕ Nuevo día remoto:", diaData.nombre);
                            diasEspeciales.push(diaData);
                            mostrarNotificacion(`📅 Nuevo día: ${diaData.nombre}`, 'info');
                        }
                        break;
                    case 'modified':
                        const indexMod = diasEspeciales.findIndex(d => d.id === diaData.id);
                        if (indexMod !== -1) diasEspeciales[indexMod] = diaData;
                        break;
                    case 'removed':
                        diasEspeciales = diasEspeciales.filter(d => d.id !== diaData.id);
                        mostrarNotificacion(`📌 Un día especial fue eliminado`, 'warning');
                        break;
                }
            });
            
            actualizarUIDias();
            saveDiasToLocalStorage();
            
        }, (error) => {
            console.error("❌ Error en listener:", error);
        });
}

async function saveDiaToFirebase(dia) {
    try {
        const db = firebase.firestore();
        const diaData = {
            nombre: dia.nombre,
            fecha: dia.fecha,
            notificacion: dia.notificacion,
            icono: dia.icono,
            sharedId: 'nuestra_pareja',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('dias_especiales').add(diaData);
        return docRef.id;
    } catch (error) {
        console.error("❌ Error guardando:", error);
        throw error;
    }
}

async function deleteDiaFromFirebase(id) {
    try {
        await firebase.firestore().collection('dias_especiales').doc(id).delete();
    } catch (error) {
        console.error("❌ Error eliminando:", error);
        throw error;
    }
}

async function saveConfigDiasToFirebase() {
    try {
        const db = firebase.firestore();
        await db.collection('config')
            .doc('nuestra_pareja')
            .set({ nombres: configDias.nombres }, { merge: true });
    } catch (error) {
        console.error("❌ Error guardando configuración:", error);
        throw error;
    }
}

// ====================
// LOCALSTORAGE
// ====================

function saveDiasToLocalStorage() {
    try {
        localStorage.setItem('dias_especiales', JSON.stringify(diasEspeciales));
        localStorage.setItem('dias_config', JSON.stringify(configDias));
    } catch (error) {
        console.error("Error guardando:", error);
    }
}

function loadDiasFromLocalStorage() {
    try {
        const savedDias = localStorage.getItem('dias_especiales');
        const savedConfig = localStorage.getItem('dias_config');
        
        if (savedDias) diasEspeciales = JSON.parse(savedDias);
        if (savedConfig) configDias = JSON.parse(savedConfig);
    } catch (error) {
        console.error("Error cargando:", error);
    }
}

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', async function() {
    console.log("📅 Iniciando app de días especiales...");
    
    loadDiasFromLocalStorage();
    inicializarAppDias();
    actualizarUIDias();
    
    setTimeout(async () => {
        await initFirebaseDias();
    }, 1000);
});

function inicializarAppDias() {
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    configurarEventosDias();
    
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    document.getElementById('fecha-dia').value = manana.toISOString().split('T')[0];
}

// ====================
// FUNCIÓN AGREGAR DÍA CORREGIDA (CON ID TEMPORAL)
// ====================

async function agregarDia() {
    const nombre = document.getElementById('nombre-dia').value.trim();
    const fecha = document.getElementById('fecha-dia').value;
    const notificacion = document.getElementById('notificacion-dia').checked;
    
    if (!nombre || !fecha) {
        mostrarNotificacion('Completa todos los campos', 'error');
        return;
    }
    
    // 1. Crear ID TEMPORAL
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const nuevoDia = {
        id: tempId,
        nombre: nombre,
        fecha: fecha,
        notificacion: notificacion,
        icono: iconoSeleccionado,
        timestamp: new Date(),
        sincronizando: true
    };
    
    // 2. MOSTRAR INMEDIATAMENTE
    diasEspeciales.push(nuevoDia);
    actualizarUIDias();
    
    // 3. Limpiar formulario
    document.getElementById('nombre-dia').value = '';
    document.getElementById('nombre-dia').focus();
    
    mostrarNotificacion(`⏳ Guardando "${nombre}"...`, 'info');
    
    // 4. Guardar en Firebase
    try {
        const firebaseId = await saveDiaToFirebase(nuevoDia);
        
        const index = diasEspeciales.findIndex(d => d.id === tempId);
        if (index !== -1) {
            diasEspeciales[index].id = firebaseId;
            diasEspeciales[index].sincronizando = false;
        }
        
        mostrarNotificacion(`✅ "${nombre}" agregado`, 'success');
        
    } catch (error) {
        console.error("Error guardando:", error);
        const index = diasEspeciales.findIndex(d => d.id === tempId);
        if (index !== -1) {
            diasEspeciales[index].error = true;
        }
        mostrarNotificacion(`⚠️ "${nombre}" agregado (local)`, 'warning');
    }
    
    saveDiasToLocalStorage();
}

async function eliminarDia(id) {
    if (!confirm('¿Eliminar este día especial?')) return;
    
    mostrarNotificacion('⏳ Eliminando...', 'info');
    
    const diaEliminado = diasEspeciales.find(d => d.id === id);
    diasEspeciales = diasEspeciales.filter(d => d.id !== id);
    actualizarUIDias();
    
    try {
        if (id && !id.toString().startsWith('temp_')) {
            await deleteDiaFromFirebase(id);
            mostrarNotificacion('✅ Día eliminado', 'success');
        } else {
            mostrarNotificacion('✅ Día eliminado (local)', 'success');
        }
    } catch (error) {
        console.error("Error eliminando:", error);
        if (diaEliminado) {
            diasEspeciales.push(diaEliminado);
            actualizarUIDias();
        }
        mostrarNotificacion('Error al eliminar', 'error');
    }
    
    saveDiasToLocalStorage();
}

async function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configDias.nombres.persona1 = nombre1;
    configDias.nombres.persona2 = nombre2;
    
    actualizarNombresEnUIDias();
    ocultarModal('names-modal');
    
    try {
        await saveConfigDiasToFirebase();
        mostrarNotificacion('Nombres actualizados', 'success');
    } catch (error) {
        console.error("Error guardando nombres:", error);
        mostrarNotificacion('Nombres actualizados (local)', 'warning');
    }
    
    saveDiasToLocalStorage();
}

// ====================
// CONFIGURACIÓN DE EVENTOS
// ====================

function configurarEventosDias() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTema);
    
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
        backBtn.addEventListener('click', () => window.location.href = 'index.html');
    }
    
    document.querySelectorAll('.icon-option').forEach(icono => {
        icono.addEventListener('click', function() {
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            iconoSeleccionado = this.dataset.icon;
        });
    });
    
    const addBtn = document.getElementById('add-dia-btn');
    if (addBtn) addBtn.addEventListener('click', agregarDia);
    
    const nombreInput = document.getElementById('nombre-dia');
    if (nombreInput) {
        nombreInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') agregarDia();
        });
    }
    
    const editNamesBtn = document.getElementById('edit-names');
    if (editNamesBtn) {
        editNamesBtn.addEventListener('click', mostrarModalNombres);
    }
    
    const saveNamesBtn = document.getElementById('save-names');
    if (saveNamesBtn) saveNamesBtn.addEventListener('click', guardarNombres);
    
    const cancelNamesBtn = document.getElementById('cancel-names');
    if (cancelNamesBtn) {
        cancelNamesBtn.addEventListener('click', () => ocultarModal('names-modal'));
    }
    
    const searchToggle = document.getElementById('search-toggle-dias');
    if (searchToggle) searchToggle.addEventListener('click', toggleBusquedaDias);
    
    const searchClear = document.getElementById('search-clear-dias');
    if (searchClear) searchClear.addEventListener('click', limpiarBusquedaDias);
    
    const searchInput = document.getElementById('search-input-dias');
    if (searchInput) searchInput.addEventListener('input', filtrarDias);
    
    const filterNotif = document.getElementById('filter-notificacion');
    if (filterNotif) filterNotif.addEventListener('change', filtrarDias);
    
    const filterMes = document.getElementById('filter-mes');
    if (filterMes) filterMes.addEventListener('change', filtrarDias);
    
    const filterAno = document.getElementById('filter-ano');
    if (filterAno) filterAno.addEventListener('change', filtrarDias);
    
    const clearFilters = document.getElementById('clear-filters-dias');
    if (clearFilters) clearFilters.addEventListener('click', limpiarFiltrosDias);
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') ocultarModal('names-modal');
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
    // No hay elementos específicos para nombres en esta página
}

function actualizarProximosDias() {
    const hoy = new Date().toISOString().split('T')[0];
    const proximosDias = diasEspeciales
        .filter(dia => dia.fecha >= hoy)
        .slice(0, 3);
    
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
        if (diasFaltantes === 0) mensaje = '¡Es hoy!';
        else if (diasFaltantes === 1) mensaje = 'Mañana';
        else mensaje = `En ${diasFaltantes} días`;
        
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
    
    diasFiltrados.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    mostrarDiasFiltrados(diasFiltrados);
}

function mostrarDiasFiltrados(diasFiltrados) {
    const container = document.getElementById('dias-container');
    const emptyState = document.getElementById('empty-state-dias');
    
    if (!container) return;
    
    if (diasFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="far fa-search"></i>
                <h4>No se encontraron días</h4>
                <p>Intenta con otros filtros.</p>
            </div>
        `;
        emptyState.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    
    const hoy = new Date().toISOString().split('T')[0];
    let html = '';
    
    diasFiltrados.forEach(dia => {
        const fechaHora = new Date(dia.fecha).toLocaleDateString('es-ES', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) + ' - ' + new Date(dia.fechaCreacion || dia.fecha).toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const esPasado = dia.fecha < hoy;
        
        const sincronizandoClass = dia.sincronizando ? 'sincronizando' : '';
        const sincronizandoIcon = dia.sincronizando ? '<i class="fas fa-sync fa-spin"></i>' : '';
        const errorIcon = dia.error ? '<i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i>' : '';
        
        html += `
            <div class="dia-item ${esPasado ? 'pasado' : ''} ${sincronizandoClass}">
                <div class="dia-icon">${dia.icono || '📅'}</div>
                <div class="dia-content">
                    <div class="dia-header">
                        <div class="dia-nombre">${dia.nombre} ${sincronizandoIcon} ${errorIcon}</div>
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
    if (!icono) return;
    icono.className = tema === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
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

function ocultarModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
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

window.eliminarDia = eliminarDia;

console.log("✅ app-dias.js cargado correctamente (versión sin recargas)");