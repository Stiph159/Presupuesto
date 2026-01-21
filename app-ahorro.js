// Agrega al inicio del archivo app-ahorro.js
let unsubscribeAhorros = null;

async function initFirebaseAhorros() {
    try {
        await firebase.auth().signInAnonymously();
        await loadConfigAhorrosFromFirebase();
        setupAhorrosRealtimeListener();
    } catch (error) {
        console.error("Error en Firebase Ahorros:", error);
        loadFromLocalStorageAhorros();
    }
}

function setupAhorrosRealtimeListener() {
    if (unsubscribeAhorros) unsubscribeAhorros();
    
    unsubscribeAhorros = firebase.firestore()
        .collection('ahorros')
        .where('sharedId', '==', 'nuestra_pareja')
        .orderBy('timestamp', 'desc')
        .onSnapshot((snapshot) => {
            // ... procesar cambios como en app.js ...
        });
}
// ====================
// CONFIGURACIÓN INICIAL
// ====================

// Variables globales para ahorro
let ahorros = JSON.parse(localStorage.getItem('nuestros_ahorros')) || [];
let configAhorro = JSON.parse(localStorage.getItem('ahorro_config')) || {
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

// Tips de ahorro
const tipsAhorro = [
    "Cada moneda cuenta. Pequeños ahorros diarios se convierten en grandes sumas con el tiempo.",
    "Antes de comprar algo, pregúntate: ¿Realmente lo necesito o solo lo quiero?",
    "El ahorro no es un sacrificio, es una inversión en tu futuro tranquilo.",
    "Automátiza tus ahorros: lo que no ves, no lo gastas.",
    "Establece metas claras y específicas. Ahorrar sin propósito es más difícil.",
    "Celebra cada hito alcanzado, por pequeño que sea.",
    "Compara precios siempre. Los pequeños ahorros en cada compra se suman.",
    "La constancia es clave. Mejor ahorrar poco todos los días que mucho de vez en cuando.",
    "Lleva un registro de tus ahorros, ver el progreso motiva a continuar.",
    "No subestimes el poder del interés compuesto. Empieza a ahorrar hoy."
];

// ====================
// INICIALIZACIÓN
// ====================

document.addEventListener('DOMContentLoaded', function() {
    inicializarAhorroApp();
    cargarAhorros();
    actualizarUIAhorro();
});

function inicializarAhorroApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventosAhorro();
    
    // Configurar nombres
    document.getElementById('name-persona1').textContent = configAhorro.nombres.persona1;
    document.getElementById('name-persona2').textContent = configAhorro.nombres.persona2;
    
    // Configurar fecha por defecto
    document.getElementById('fecha-ahorro').value = new Date().toISOString().split('T')[0];
    
    // Configurar montos de opciones
    document.getElementById('monto-opcion1').textContent = configAhorro.montosOpciones.opcion1.toFixed(2);
    document.getElementById('monto-opcion2').textContent = configAhorro.montosOpciones.opcion2.toFixed(2);
    document.getElementById('monto-opcion3').textContent = configAhorro.montosOpciones.opcion3.toFixed(2);
    
    // Configurar metas
    document.getElementById('meta-mensual').textContent = `$${configAhorro.metaMensual}`;
    document.getElementById('meta-anual').textContent = `$${configAhorro.metaAnual}`;
    
    // Inicializar gráfico
    inicializarGraficoAhorro();
    
    // Mostrar un tip aleatorio
    mostrarTipAleatorio();
}

function configurarEventosAhorro() {
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Botón volver
    document.getElementById('back-btn').addEventListener('click', function() {
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
    
    // Selección de opciones
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('click', function() {
            // Deseleccionar todas
            document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
            
            // Seleccionar esta
            this.classList.add('selected');
            opcionSeleccionada = this.dataset.opcion;
            
            // Mostrar información de opción seleccionada
            const opcionInfo = document.getElementById('opcion-seleccionada-info');
            const texto = document.getElementById('opcion-seleccionada-texto');
            const monto = document.getElementById('opcion-seleccionada-monto');
            
            let nombreOpcion = '';
            let montoOpcion = 0;
            
            switch(opcionSeleccionada) {
                case '1':
                    nombreOpcion = 'Opción 1 (Pequeño)';
                    montoOpcion = configAhorro.montosOpciones.opcion1;
                    break;
                case '2':
                    nombreOpcion = 'Opción 2 (Medio)';
                    montoOpcion = configAhorro.montosOpciones.opcion2;
                    break;
                case '3':
                    nombreOpcion = 'Opción 3 (Grande)';
                    montoOpcion = configAhorro.montosOpciones.opcion3;
                    break;
            }
            
            texto.textContent = nombreOpcion;
            monto.textContent = `$${montoOpcion.toFixed(2)}`;
            opcionInfo.style.display = 'block';
            
            habilitarBotonAgregar();
        });
    });
    
    // Botón agregar ahorro
    document.getElementById('add-ahorro-btn').addEventListener('click', agregarAhorro);
    
    // Enter en descripción también agrega
    document.getElementById('descripcion-ahorro').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !document.getElementById('add-ahorro-btn').disabled) {
            agregarAhorro();
        }
    });
    
    // Botones de acción
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            ejecutarAccionAhorro(accion);
        });
    });
    
    // Botones de gráficos
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGraficoAhorro(this.dataset.chart);
        });
    });
    
    // Botón editar nombres
    document.getElementById('edit-names').addEventListener('click', mostrarModalNombres);
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', ocultarModalNombres);
    
    // Botón editar metas
    document.getElementById('edit-meta').addEventListener('click', mostrarModalMeta);
    document.getElementById('save-meta').addEventListener('click', guardarMeta);
    document.getElementById('cancel-meta').addEventListener('click', ocultarModalMeta);
    
    // Botón editar montos
    document.getElementById('refresh-tip').addEventListener('click', mostrarTipAleatorio);
    
    // Exportar datos
    document.getElementById('export-ahorro-btn').addEventListener('click', exportarDatosAhorro);
    
    // Búsqueda
    document.getElementById('search-toggle-ahorro').addEventListener('click', toggleBusquedaAhorro);
    document.getElementById('search-clear-ahorro').addEventListener('click', limpiarBusquedaAhorro);
    document.getElementById('search-input-ahorro').addEventListener('input', filtrarAhorros);
    
    // Filtros
    document.getElementById('filter-opcion').addEventListener('change', filtrarAhorros);
    document.getElementById('filter-person-ahorro').addEventListener('change', filtrarAhorros);
    document.getElementById('filter-date-ahorro').addEventListener('change', filtrarAhorros);
    document.getElementById('clear-filters-ahorro').addEventListener('click', limpiarFiltrosAhorro);
    
    // Botón para editar montos (necesitarías agregarlo en el HTML primero)
    document.addEventListener('dblclick', function(e) {
        if (e.target.closest('.opcion-monto')) {
            mostrarModalMontos();
        }
    });
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
            ocultarModalMeta();
            const montosModal = document.getElementById('montos-modal');
            if (montosModal) montosModal.classList.remove('active');
        }
    });
}

function habilitarBotonAgregar() {
    const boton = document.getElementById('add-ahorro-btn');
    boton.disabled = !(opcionSeleccionada && personaSeleccionada);
    
    if (!boton.disabled) {
        boton.style.opacity = '1';
        boton.style.cursor = 'pointer';
    } else {
        boton.style.opacity = '0.7';
        boton.style.cursor = 'not-allowed';
    }
}

// ====================
// GESTIÓN DE AHORROS
// ====================

function agregarAhorro() {
    if (!opcionSeleccionada) {
        mostrarNotificacion('Por favor selecciona una opción de ahorro', 'error');
        return;
    }
    
    const descripcion = document.getElementById('descripcion-ahorro').value.trim();
    const fecha = document.getElementById('fecha-ahorro').value;
    
    // Obtener monto según opción
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
    
    // Crear objeto de ahorro
    const nuevoAhorro = {
        id: Date.now(),
        fecha: fecha,
        monto: monto,
        descripcion: descripcion || nombreOpcion,
        persona: personaSeleccionada,
        opcion: opcionSeleccionada,
        timestamp: new Date().toISOString()
    };
    
    // Agregar al array
    ahorros.push(nuevoAhorro);
    
    // Guardar y actualizar
    guardarDatosAhorro();
    actualizarUIAhorro();
    
    // Limpiar formulario
    document.getElementById('descripcion-ahorro').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    opcionSeleccionada = null;
    habilitarBotonAgregar();
    
    // Mostrar confirmación
    const nombrePersona = personaSeleccionada === 'persona1' ? configAhorro.nombres.persona1 : configAhorro.nombres.persona2;
    mostrarNotificacion(`✅ ${nombrePersona} ahorró $${monto.toFixed(2)}`, 'success');
    
    // Reproducir sonido de éxito (opcional)
    if (typeof Audio !== 'undefined') {
        const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQ=');
        audio.play().catch(() => {});
    }
}

function eliminarAhorro(id) {
    if (confirm('¿Estás seguro de eliminar este ahorro?')) {
        ahorros = ahorros.filter(ahorro => ahorro.id !== id);
        guardarDatosAhorro();
        actualizarUIAhorro();
        mostrarNotificacion('Ahorro eliminado correctamente', 'success');
    }
}

function guardarDatosAhorro() {
    localStorage.setItem('nuestros_ahorros', JSON.stringify(ahorros));
    localStorage.setItem('ahorro_config', JSON.stringify(configAhorro));
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUIAhorro() {
    actualizarResumenAhorro();
    actualizarMetas();
    actualizarEstadisticas();
    actualizarGraficoAhorro('opciones');
    filtrarAhorros();
    actualizarQuickSummaryAhorro();
}

function actualizarResumenAhorro() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const ahorrosHoy = ahorros.filter(a => a.fecha === hoy);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const totalHoy = ahorrosHoy.reduce((sum, a) => sum + a.monto, 0);
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    
    document.getElementById('summary-hoy-ahorro').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-mes-ahorro').textContent = `$${totalMes.toFixed(2)}`;
    
    // Calcular porcentaje de meta mensual
    const porcentajeMeta = (totalMes / configAhorro.metaMensual) * 100;
    document.getElementById('summary-porcentaje-meta').textContent = `${Math.min(porcentajeMeta, 100).toFixed(1)}%`;
    
    // Color según porcentaje
    const porcentajeElement = document.getElementById('summary-porcentaje-meta');
    if (porcentajeMeta >= 100) {
        porcentajeElement.style.color = 'var(--success-color)';
    } else if (porcentajeMeta >= 70) {
        porcentajeElement.style.color = 'var(--warning-color)';
    } else {
        porcentajeElement.style.color = 'var(--accent-color)';
    }
}

function actualizarMetas() {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const inicioAnio = new Date(new Date().getFullYear(), 0, 1);
    
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    const ahorrosAnio = ahorros.filter(a => new Date(a.fecha) >= inicioAnio);
    
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    const totalAnio = ahorrosAnio.reduce((sum, a) => sum + a.monto, 0);
    
    // Actualizar montos
    document.getElementById('ahorrado-mensual').textContent = `$${totalMes.toFixed(2)}`;
    document.getElementById('restante-mensual').textContent = `$${Math.max(configAhorro.metaMensual - totalMes, 0).toFixed(2)}`;
    
    document.getElementById('ahorrado-anual').textContent = `$${totalAnio.toFixed(2)}`;
    document.getElementById('restante-anual').textContent = `$${Math.max(configAhorro.metaAnual - totalAnio, 0).toFixed(2)}`;
    
    // Actualizar barras de progreso
    const porcentajeMensual = Math.min((totalMes / configAhorro.metaMensual) * 100, 100);
    const porcentajeAnual = Math.min((totalAnio / configAhorro.metaAnual) * 100, 100);
    
    document.getElementById('progress-mensual').style.width = `${porcentajeMensual}%`;
    document.getElementById('progress-anual').style.width = `${porcentajeAnual}%`;
    
    // Colores de las barras
    const progressMensual = document.getElementById('progress-mensual');
    const progressAnual = document.getElementById('progress-anual');
    
    if (porcentajeMensual >= 100) {
        progressMensual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
    } else if (porcentajeMensual >= 70) {
        progressMensual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
    } else {
        progressMensual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
    
    if (porcentajeAnual >= 100) {
        progressAnual.style.background = 'linear-gradient(135deg, #38a169 0%, #68d391 100%)';
    } else if (porcentajeAnual >= 70) {
        progressAnual.style.background = 'linear-gradient(135deg, #ed8936 0%, #fbd38d 100%)';
    } else {
        progressAnual.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }
}

function actualizarEstadisticas() {
    // Calcular racha de días consecutivos con ahorros
    let racha = 0;
    const hoy = new Date();
    let fechaVerificar = new Date(hoy);
    
    while (true) {
        const fechaStr = fechaVerificar.toISOString().split('T')[0];
        const ahorrosDia = ahorros.filter(a => a.fecha === fechaStr);
        
        if (ahorrosDia.length > 0) {
            racha++;
            fechaVerificar.setDate(fechaVerificar.getDate() - 1);
        } else {
            break;
        }
    }
    
    document.getElementById('racha-dias').textContent = `${racha} días`;
    
    // Calcular promedio diario (últimos 30 días)
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);
    
    const ahorros30Dias = ahorros.filter(a => new Date(a.fecha) >= hace30Dias);
    const total30Dias = ahorros30Dias.reduce((sum, a) => sum + a.monto, 0);
    const promedioDiario = total30Dias / 30;
    
    document.getElementById('promedio-diario').textContent = `$${promedioDiario.toFixed(2)}`;
    
    // Proyección a 6 meses
    const proyeccion6Meses = promedioDiario * 30 * 6;
    document.getElementById('proyeccion-6meses').textContent = `$${proyeccion6Meses.toFixed(2)}`;
    
    // Diferencia entre personas
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const ahorrosPersona1 = ahorrosMes.filter(a => a.persona === 'persona1')
        .reduce((sum, a) => sum + a.monto, 0);
    const ahorrosPersona2 = ahorrosMes.filter(a => a.persona === 'persona2')
        .reduce((sum, a) => sum + a.monto, 0);
    
    const diferencia = Math.abs(ahorrosPersona1 - ahorrosPersona2);
    document.getElementById('diferencia-ahorro').textContent = `$${diferencia.toFixed(2)}`;
    
    // Color según diferencia
    const diferenciaElement = document.getElementById('diferencia-ahorro');
    if (diferencia === 0) {
        diferenciaElement.style.color = 'var(--success-color)';
    } else if (diferencia > 100) {
        diferenciaElement.style.color = 'var(--accent-color)';
    } else {
        diferenciaElement.style.color = 'var(--warning-color)';
    }
}

function cargarAhorros() {
    const container = document.getElementById('ahorros-container');
    const emptyState = document.getElementById('empty-state-ahorro');
    const totales = document.getElementById('totales-ahorro');
    
    if (ahorros.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
}

// ====================
// FILTRADO Y BÚSQUEDA
// ====================

function filtrarAhorros() {
    const searchTerm = document.getElementById('search-input-ahorro').value.toLowerCase();
    const opcion = document.getElementById('filter-opcion').value;
    const persona = document.getElementById('filter-person-ahorro').value;
    const rangoFecha = document.getElementById('filter-date-ahorro').value;
    
    let ahorrosFiltrados = [...ahorros];
    
    // Aplicar filtros
    if (searchTerm) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => 
            a.descripcion.toLowerCase().includes(searchTerm)
        );
    }
    
    if (opcion) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.opcion === opcion);
    }
    
    if (persona) {
        ahorrosFiltrados = ahorrosFiltrados.filter(a => a.persona === persona);
    }
    
    if (rangoFecha && rangoFecha !== 'all') {
        const hoy = new Date();
        let fechaInicio;
        
        switch(rangoFecha) {
            case 'today':
                fechaInicio = new Date(hoy.setHours(0, 0, 0, 0));
                break;
            case 'week':
                fechaInicio = obtenerInicioSemana();
                break;
            case 'month':
                fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
                break;
        }
        
        if (fechaInicio) {
            ahorrosFiltrados = ahorrosFiltrados.filter(a => 
                new Date(a.fecha) >= fechaInicio
            );
        }
    }
    
    // Ordenar por fecha (más reciente primero)
    ahorrosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    // Actualizar lista
    mostrarAhorrosFiltrados(ahorrosFiltrados);
    
    // Actualizar totales
    const totalFiltrado = ahorrosFiltrados.reduce((sum, a) => sum + a.monto, 0);
    const totalGeneral = ahorros.reduce((sum, a) => sum + a.monto, 0);
    
    document.getElementById('total-filtrado-ahorro').textContent = `$${totalFiltrado.toFixed(2)}`;
    document.getElementById('total-general-ahorro').textContent = `$${totalGeneral.toFixed(2)}`;
    
    // Actualizar título de lista
    const title = document.getElementById('list-title-ahorro');
    let filtroTexto = '';
    
    if (opcion || persona || rangoFecha !== 'all') {
        filtroTexto = ' (Filtrados)';
    }
    
    title.textContent = `Ahorros${filtroTexto}`;
}

function mostrarAhorrosFiltrados(ahorrosFiltrados) {
    const container = document.getElementById('ahorros-container');
    
    if (ahorrosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="far fa-search"></i>
                <h4>No se encontraron ahorros</h4>
                <p>Intenta con otros filtros o términos de búsqueda.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    ahorrosFiltrados.forEach(ahorro => {
        const fechaFormateada = new Date(ahorro.fecha).toLocaleDateString('es-ES', {
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
                    <div class="ahorro-monto">$${ahorro.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarAhorro(${ahorro.id})" title="Eliminar">
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

function limpiarFiltrosAhorro() {
    document.getElementById('search-input-ahorro').value = '';
    document.getElementById('filter-opcion').value = '';
    document.getElementById('filter-person-ahorro').value = '';
    document.getElementById('filter-date-ahorro').value = 'all';
    
    filtrarAhorros();
    mostrarNotificacion('Filtros limpiados', 'info');
}

// ====================
// GRÁFICOS
// ====================

function inicializarGraficoAhorro() {
    const ctx = document.getElementById('ahorro-chart').getContext('2d');
    
    chartAhorroInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#667eea', '#f56565', '#38a169', '#ed8936', '#9f7aea'
                ],
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
                    labels: {
                        color: 'var(--text-color)',
                        padding: 20
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `$${context.parsed.toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });
}

function actualizarGraficoAhorro(tipo) {
    if (!chartAhorroInstance) return;
    
    let labels = [];
    let datos = [];
    let colores = [];
    
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    switch(tipo) {
        case 'opciones':
            const opciones = ['1', '2', '3'];
            labels = ['Opción 1', 'Opción 2', 'Opción 3'];
            colores = ['#667eea', '#f56565', '#38a169'];
            
            opciones.forEach((opc, index) => {
                const total = ahorrosMes
                    .filter(a => a.opcion === opc)
                    .reduce((sum, a) => sum + a.monto, 0);
                datos.push(total);
            });
            break;
            
        case 'personas':
            labels = [configAhorro.nombres.persona1, configAhorro.nombres.persona2];
            colores = ['#4299e1', '#ed64a6'];
            
            const totalPersona1 = ahorrosMes
                .filter(a => a.persona === 'persona1')
                .reduce((sum, a) => sum + a.monto, 0);
            
            const totalPersona2 = ahorrosMes
                .filter(a => a.persona === 'persona2')
                .reduce((sum, a) => sum + a.monto, 0);
            
            datos.push(totalPersona1, totalPersona2);
            break;
            
        case 'tiempo':
            // Últimos 7 días
            const ultimos7Dias = Array.from({length: 7}, (_, i) => {
                const fecha = new Date();
                fecha.setDate(fecha.getDate() - i);
                return fecha.toISOString().split('T')[0];
            }).reverse();
            
            labels = ultimos7Dias.map(fecha => {
                const d = new Date(fecha);
                return d.toLocaleDateString('es-ES', { weekday: 'short' });
            });
            
            colores = Array(7).fill('#667eea').map((color, i) => {
                const alpha = (i + 3) * 0.1 + 0.3;
                return color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
            });
            
            ultimos7Dias.forEach(fecha => {
                const total = ahorros
                    .filter(a => a.fecha === fecha)
                    .reduce((sum, a) => sum + a.monto, 0);
                datos.push(total);
            });
            break;
    }
    
    chartAhorroInstance.data.labels = labels;
    chartAhorroInstance.data.datasets[0].data = datos;
    chartAhorroInstance.data.datasets[0].backgroundColor = colores;
    
    chartAhorroInstance.update();
}

// ====================
// ACCIONES
// ====================

function ejecutarAccionAhorro(accion) {
    switch(accion) {
        case 'ver-mis-ahorros':
            document.getElementById('filter-person-ahorro').value = 'persona1';
            filtrarAhorros();
            break;
            
        case 'ver-sus-ahorros':
            document.getElementById('filter-person-ahorro').value = 'persona2';
            filtrarAhorros();
            break;
            
        case 'ver-mes':
            document.getElementById('filter-date-ahorro').value = 'month';
            filtrarAhorros();
            break;
            
        case 'ver-todos-ahorros':
            limpiarFiltrosAhorro();
            break;
    }
}

// ====================
// MODALES
// ====================

function mostrarModalNombres() {
    document.getElementById('nombre-persona1').value = configAhorro.nombres.persona1;
    document.getElementById('nombre-persona2').value = configAhorro.nombres.persona2;
    document.getElementById('names-modal').classList.add('active');
}

function ocultarModalNombres() {
    document.getElementById('names-modal').classList.remove('active');
}

function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    configAhorro.nombres.persona1 = nombre1;
    configAhorro.nombres.persona2 = nombre2;
    
    guardarDatosAhorro();
    actualizarUIAhorro();
    ocultarModalNombres();
    
    mostrarNotificacion('Nombres actualizados correctamente', 'success');
}

function mostrarModalMeta() {
    document.getElementById('meta-mensual-input').value = configAhorro.metaMensual;
    document.getElementById('meta-anual-input').value = configAhorro.metaAnual;
    document.getElementById('reset-mensual').checked = configAhorro.resetMensual;
    document.getElementById('meta-modal').classList.add('active');
}

function ocultarModalMeta() {
    document.getElementById('meta-modal').classList.remove('active');
}

function guardarMeta() {
    const metaMensual = parseFloat(document.getElementById('meta-mensual-input').value);
    const metaAnual = parseFloat(document.getElementById('meta-anual-input').value);
    const resetMensual = document.getElementById('reset-mensual').checked;
    
    if (metaMensual && metaMensual > 0 && metaAnual && metaAnual > 0) {
        configAhorro.metaMensual = metaMensual;
        configAhorro.metaAnual = metaAnual;
        configAhorro.resetMensual = resetMensual;
        
        guardarDatosAhorro();
        actualizarUIAhorro();
        ocultarModalMeta();
        
        mostrarNotificacion('Metas actualizadas correctamente', 'success');
    }
}

function mostrarModalMontos() {
    // Primero necesitas agregar el modal de montos en el HTML si no existe
    // Esta es una función opcional que puedes implementar
    console.log('Mostrar modal para editar montos');
}

// ====================
// TIPS DE AHORRO
// ====================

function mostrarTipAleatorio() {
    const randomIndex = Math.floor(Math.random() * tipsAhorro.length);
    document.getElementById('tip-text').textContent = `"${tipsAhorro[randomIndex]}"`;
}

// ====================
// EXPORTACIÓN
// ====================

function exportarDatosAhorro() {
    const dataStr = JSON.stringify(ahorros, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `ahorros_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Ahorros exportados correctamente', 'success');
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
    
    mostrarNotificacion(`Modo ${nuevoTema === 'dark' ? 'oscuro' : 'claro'} activado`, 'info');
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

function toggleBusquedaAhorro() {
    const searchBox = document.getElementById('search-box-ahorro');
    searchBox.style.display = searchBox.style.display === 'none' ? 'block' : 'none';
    
    if (searchBox.style.display === 'block') {
        document.getElementById('search-input-ahorro').focus();
    }
}

function limpiarBusquedaAhorro() {
    document.getElementById('search-input-ahorro').value = '';
    filtrarAhorros();
}

function mostrarNotificacion(mensaje, tipo = 'info') {
    const notificacion = document.getElementById('notification');
    
    notificacion.textContent = mensaje;
    notificacion.className = 'notification show';
    
    // Color según tipo
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
    
    // Auto-ocultar
    setTimeout(() => {
        notificacion.classList.remove('show');
    }, 3000);
}

function actualizarQuickSummaryAhorro() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    const ahorrosHoy = ahorros.filter(a => a.fecha === hoy);
    const ahorrosMes = ahorros.filter(a => new Date(a.fecha) >= inicioMes);
    
    const totalHoy = ahorrosHoy.reduce((sum, a) => sum + a.monto, 0);
    const totalMes = ahorrosMes.reduce((sum, a) => sum + a.monto, 0);
    
    document.getElementById('summary-hoy-ahorro').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-mes-ahorro').textContent = `$${totalMes.toFixed(2)}`;
    
    // Calcular porcentaje de meta mensual
    const porcentajeMeta = (totalMes / configAhorro.metaMensual) * 100;
    document.getElementById('summary-porcentaje-meta').textContent = `${Math.min(porcentajeMeta, 100).toFixed(1)}%`;
}