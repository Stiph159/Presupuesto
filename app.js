// ====================
// CONFIGURACIÓN INICIAL
// ====================

// Variables globales
let gastos = JSON.parse(localStorage.getItem('nuestros_gastos')) || [];
let config = JSON.parse(localStorage.getItem('gastos_config')) || {
    presupuesto: 1500,
    resetSemanal: true,
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let personaSeleccionada = 'persona1';
let categoriaSeleccionada = 'otros';
let chartInstance = null;

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    inicializarApp();
    cargarGastos();
    actualizarUI();
});

// ====================
// FUNCIONES PRINCIPALES
// ====================

function inicializarApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventos();
    
    // Configurar nombres
    document.getElementById('name-persona1').textContent = config.nombres.persona1;
    document.getElementById('name-persona2').textContent = config.nombres.persona2;
    
    // Configurar fecha por defecto
    document.getElementById('fecha-gasto').value = new Date().toISOString().split('T')[0];
    
    // Inicializar gráfico
    inicializarGrafico();
}

function configurarEventos() {
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Selector de persona
    document.querySelectorAll('.person-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.person-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            personaSeleccionada = this.dataset.person;
        });
    });
    
    // Categorías rápidas
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            categoriaSeleccionada = this.dataset.category;
            
            // Sugerir descripción basada en categoría
            const sugerencias = {
                comida: 'Supermercado, restaurante, delivery...',
                transporte: 'Uber, gasolina, metro, bus...',
                entretenimiento: 'Cine, concierto, parque...',
                compras: 'Ropa, electrónica, regalos...',
                otros: 'Otros gastos...'
            };
            
            document.getElementById('descripcion').placeholder = sugerencias[categoriaSeleccionada];
        });
    });
    
    // Botón agregar gasto
    document.getElementById('add-btn').addEventListener('click', agregarGasto);
    
    // Enter en descripción también agrega
    document.getElementById('descripcion').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') agregarGasto();
    });
    
    // Botones de acción
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const accion = this.dataset.action;
            ejecutarAccion(accion);
        });
    });
    
    // Botones de gráficos
    document.querySelectorAll('.chart-option').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.chart-option').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            actualizarGrafico(this.dataset.chart);
        });
    });
    
    // Botón editar nombres
    document.getElementById('edit-names').addEventListener('click', mostrarModalNombres);
    document.getElementById('save-names').addEventListener('click', guardarNombres);
    document.getElementById('cancel-names').addEventListener('click', ocultarModalNombres);
    
    // Botón editar presupuesto
    document.getElementById('edit-budget').addEventListener('click', mostrarModalPresupuesto);
    document.getElementById('save-budget').addEventListener('click', guardarPresupuesto);
    document.getElementById('cancel-budget').addEventListener('click', ocultarModalPresupuesto);
    
    // Exportar datos
    document.getElementById('export-btn').addEventListener('click', exportarDatos);
    
    // Búsqueda
    document.getElementById('search-toggle').addEventListener('click', toggleBusqueda);
    document.getElementById('search-clear').addEventListener('click', limpiarBusqueda);
    document.getElementById('search-input').addEventListener('input', filtrarGastos);
    
    // Filtros
    document.getElementById('filter-category').addEventListener('change', filtrarGastos);
    document.getElementById('filter-person').addEventListener('change', filtrarGastos);
    document.getElementById('filter-date').addEventListener('change', filtrarGastos);
    document.getElementById('clear-filters').addEventListener('click', limpiarFiltros);
    
    // Cerrar modales con ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            ocultarModalNombres();
            ocultarModalPresupuesto();
        }
    });
}

// ====================
// GESTIÓN DE GASTOS
// ====================

function agregarGasto() {
    const monto = parseFloat(document.getElementById('monto').value);
    const descripcion = document.getElementById('descripcion').value.trim();
    const fecha = document.getElementById('fecha-gasto').value;
    
    // Validaciones
    if (!monto || monto <= 0) {
        mostrarNotificacion('Por favor ingresa un monto válido', 'error');
        document.getElementById('monto').focus();
        return;
    }
    
    if (!descripcion) {
        mostrarNotificacion('Por favor ingresa una descripción', 'error');
        document.getElementById('descripcion').focus();
        return;
    }
    
    // Crear objeto de gasto
    const nuevoGasto = {
        id: Date.now(),
        fecha: fecha,
        monto: monto,
        descripcion: descripcion,
        persona: personaSeleccionada,
        categoria: categoriaSeleccionada,
        timestamp: new Date().toISOString()
    };
    
    // Agregar al array
    gastos.push(nuevoGasto);
    
    // Guardar y actualizar
    guardarDatos();
    actualizarUI();
    
    // Limpiar formulario
    document.getElementById('monto').value = '';
    document.getElementById('descripcion').value = '';
    document.getElementById('descripcion').placeholder = '¿En qué gastamos?';
    document.getElementById('monto').focus();
    
    // Mostrar confirmación
    const nombrePersona = personaSeleccionada === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
    mostrarNotificacion(`✅ ${nombrePersona} gastó $${monto.toFixed(2)} en ${descripcion}`, 'success');
}

function eliminarGasto(id) {
    if (confirm('¿Estás seguro de eliminar este gasto?')) {
        gastos = gastos.filter(gasto => gasto.id !== id);
        guardarDatos();
        actualizarUI();
        mostrarNotificacion('Gasto eliminado correctamente', 'success');
    }
}

function guardarDatos() {
    localStorage.setItem('nuestros_gastos', JSON.stringify(gastos));
    localStorage.setItem('gastos_config', JSON.stringify(config));
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUI() {
    actualizarResumen();
    actualizarPresupuesto();
    actualizarGrafico('categorias');
    filtrarGastos();
    actualizarQuickSummary();
}

function actualizarResumen() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('summary-hoy').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `$${totalSemana.toFixed(2)}`;
    
    // Calcular diferencia
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
    
    document.getElementById('summary-diferencia').textContent = `$${diferencia.toFixed(2)}`;
    
    // Actualizar colores según diferencia
    const diferenciaElement = document.getElementById('summary-diferencia');
    if (diferencia === 0) {
        diferenciaElement.style.color = 'var(--success-color)';
    } else if (diferencia > 500) {
        diferenciaElement.style.color = 'var(--accent-color)';
    } else {
        diferenciaElement.style.color = 'var(--warning-color)';
    }
}

function actualizarPresupuesto() {
    const inicioSemana = obtenerInicioSemana();
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    const presupuesto = config.presupuesto;
    const porcentaje = Math.min((totalSemana / presupuesto) * 100, 100);
    
    // Actualizar elementos
    document.getElementById('budget-amount').textContent = presupuesto.toFixed(2);
    document.getElementById('budget-remaining').textContent = Math.max(presupuesto - totalSemana, 0).toFixed(2);
    document.getElementById('budget-progress').style.width = `${porcentaje}%`;
    
    // Actualizar colores de la barra
    const progressBar = document.getElementById('budget-progress');
    if (porcentaje < 70) {
        progressBar.style.background = 'var(--gradient-success)';
    } else if (porcentaje < 90) {
        progressBar.style.background = 'var(--gradient-warning)';
    } else {
        progressBar.style.background = 'var(--gradient-primary)';
    }
    
    // Actualizar gastos por persona
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1').reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2').reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('budget-persona1').textContent = `$${gastosPersona1.toFixed(2)}`;
    document.getElementById('budget-persona2').textContent = `$${gastosPersona2.toFixed(2)}`;
}

function cargarGastos() {
    const container = document.getElementById('gastos-container');
    const emptyState = document.getElementById('empty-state');
    const totales = document.getElementById('totales');
    
    if (gastos.length === 0) {
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

function filtrarGastos() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoria = document.getElementById('filter-category').value;
    const persona = document.getElementById('filter-person').value;
    const rangoFecha = document.getElementById('filter-date').value;
    
    let gastosFiltrados = [...gastos];
    
    // Aplicar filtros
    if (searchTerm) {
        gastosFiltrados = gastosFiltrados.filter(g => 
            g.descripcion.toLowerCase().includes(searchTerm)
        );
    }
    
    if (categoria) {
        gastosFiltrados = gastosFiltrados.filter(g => g.categoria === categoria);
    }
    
    if (persona) {
        gastosFiltrados = gastosFiltrados.filter(g => g.persona === persona);
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
            gastosFiltrados = gastosFiltrados.filter(g => 
                new Date(g.fecha) >= fechaInicio
            );
        }
    }
    
    // Ordenar por fecha (más reciente primero)
    gastosFiltrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    // Actualizar lista
    mostrarGastosFiltrados(gastosFiltrados);
    
    // Actualizar totales
    const totalFiltrado = gastosFiltrados.reduce((sum, g) => sum + g.monto, 0);
    const totalGeneral = gastos.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('total-filtrado').textContent = `$${totalFiltrado.toFixed(2)}`;
    document.getElementById('total-general').textContent = `$${totalGeneral.toFixed(2)}`;
}

function mostrarGastosFiltrados(gastosFiltrados) {
    const container = document.getElementById('gastos-container');
    
    if (gastosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="far fa-search"></i>
                <h4>No se encontraron gastos</h4>
                <p>Intenta con otros filtros o términos de búsqueda.</p>
            </div>
        `;
        return;
    }
    
    const iconosCategorias = {
        comida: '🍕',
        transporte: '🚗',
        entretenimiento: '🎬',
        compras: '🛍️',
        otros: '📝'
    };
    
    const nombresCategorias = {
        comida: 'Comida',
        transporte: 'Transporte',
        entretenimiento: 'Entretenimiento',
        compras: 'Compras',
        otros: 'Otros'
    };
    
    let html = '';
    
    gastosFiltrados.forEach(gasto => {
        const fechaFormateada = new Date(gasto.fecha).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        const nombrePersona = gasto.persona === 'persona1' ? config.nombres.persona1 : config.nombres.persona2;
        const iconoCategoria = iconosCategorias[gasto.categoria] || '📝';
        const nombreCategoria = nombresCategorias[gasto.categoria];
        
        html += `
            <div class="gasto-item ${gasto.persona}">
                <div class="gasto-header">
                    <div class="gasto-monto">$${gasto.monto.toFixed(2)}</div>
                    <button class="delete-btn" onclick="eliminarGasto(${gasto.id})" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="gasto-descripcion">${gasto.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span class="gasto-persona">${nombrePersona}</span>
                        <span class="gasto-categoria">${iconoCategoria} ${nombreCategoria}</span>
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function limpiarFiltros() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-person').value = '';
    document.getElementById('filter-date').value = 'all';
    
    filtrarGastos();
    mostrarNotificacion('Filtros limpiados', 'info');
}

// ====================
// GRÁFICOS
// ====================

function inicializarGrafico() {
    const ctx = document.getElementById('gastos-chart').getContext('2d');
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#667eea', '#764ba2', '#f56565', '#ed8936', '#38a169'
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

function actualizarGrafico(tipo) {
    if (!chartInstance) return;
    
    let labels = [];
    let datos = [];
    let colores = [];
    
    const inicioSemana = obtenerInicioSemana();
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    switch(tipo) {
        case 'categorias':
            const categorias = ['comida', 'transporte', 'entretenimiento', 'compras', 'otros'];
            labels = ['Comida', 'Transporte', 'Entretenimiento', 'Compras', 'Otros'];
            colores = ['#667eea', '#764ba2', '#f56565', '#ed8936', '#38a169'];
            
            categorias.forEach((cat, index) => {
                const total = gastosSemana
                    .filter(g => g.categoria === cat)
                    .reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
            
        case 'personas':
            labels = [config.nombres.persona1, config.nombres.persona2];
            colores = ['#4299e1', '#ed64a6'];
            
            const totalPersona1 = gastosSemana
                .filter(g => g.persona === 'persona1')
                .reduce((sum, g) => sum + g.monto, 0);
            
            const totalPersona2 = gastosSemana
                .filter(g => g.persona === 'persona2')
                .reduce((sum, g) => sum + g.monto, 0);
            
            datos.push(totalPersona1, totalPersona2);
            break;
            
        case 'semana':
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
                const total = gastos
                    .filter(g => g.fecha === fecha)
                    .reduce((sum, g) => sum + g.monto, 0);
                datos.push(total);
            });
            break;
    }
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = datos;
    chartInstance.data.datasets[0].backgroundColor = colores;
    
    chartInstance.update();
}

// ====================
// ACCIONES
// ====================

function ejecutarAccion(accion) {
    switch(accion) {
        case 'ver-mis-gastos':
            document.getElementById('filter-person').value = 'persona1';
            filtrarGastos();
            break;
        
        case 'ver-limites':
            window.location.href = 'limites.html';
            break;
            
        case 'ver-sus-gastos':
            document.getElementById('filter-person').value = 'persona2';
            filtrarGastos();
            break;
            
        case 'ver-semana':
            document.getElementById('filter-date').value = 'week';
            filtrarGastos();
            break;
            
        case 'ver-todos':
            limpiarFiltros();
            break;
            
        case 'ver-ahorros':
            window.location.href = 'ahorro.html';
            break;
    }
}

// ====================
// MODALES
// ====================

function mostrarModalNombres() {
    document.getElementById('nombre-persona1').value = config.nombres.persona1;
    document.getElementById('nombre-persona2').value = config.nombres.persona2;
    document.getElementById('names-modal').classList.add('active');
}

function ocultarModalNombres() {
    document.getElementById('names-modal').classList.remove('active');
}

function guardarNombres() {
    const nombre1 = document.getElementById('nombre-persona1').value.trim() || 'Yo';
    const nombre2 = document.getElementById('nombre-persona2').value.trim() || 'Ella';
    
    config.nombres.persona1 = nombre1;
    config.nombres.persona2 = nombre2;
    
    guardarDatos();
    actualizarUI();
    ocultarModalNombres();
    
    mostrarNotificacion('Nombres actualizados correctamente', 'success');
}

function mostrarModalPresupuesto() {
    document.getElementById('presupuesto-semanal').value = config.presupuesto;
    document.getElementById('reset-semanal').checked = config.resetSemanal;
    document.getElementById('budget-modal').classList.add('active');
}

function ocultarModalPresupuesto() {
    document.getElementById('budget-modal').classList.remove('active');
}

function guardarPresupuesto() {
    const presupuesto = parseFloat(document.getElementById('presupuesto-semanal').value);
    const resetSemanal = document.getElementById('reset-semanal').checked;
    
    if (presupuesto && presupuesto > 0) {
        config.presupuesto = presupuesto;
        config.resetSemanal = resetSemanal;
        
        guardarDatos();
        actualizarUI();
        ocultarModalPresupuesto();
        
        mostrarNotificacion(`Presupuesto actualizado a $${presupuesto.toFixed(2)}`, 'success');
    }
}

// ====================
// EXPORTACIÓN
// ====================

function exportarDatos() {
    const dataStr = JSON.stringify(gastos, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `gastos_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    mostrarNotificacion('Datos exportados correctamente', 'success');
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
    const diff = hoy.getDate() - dia + (dia === 0 ? -6 : 1); // Ajuste para lunes como primer día
    return new Date(hoy.setDate(diff)).setHours(0, 0, 0, 0);
}

function toggleBusqueda() {
    const searchBox = document.getElementById('search-box');
    searchBox.style.display = searchBox.style.display === 'none' ? 'block' : 'none';
    
    if (searchBox.style.display === 'block') {
        document.getElementById('search-input').focus();
    }
}

function limpiarBusqueda() {
    document.getElementById('search-input').value = '';
    filtrarGastos();
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

function actualizarQuickSummary() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    
    const gastosHoy = gastos.filter(g => g.fecha === hoy);
    const gastosSemana = gastos.filter(g => new Date(g.fecha) >= inicioSemana);
    
    const totalHoy = gastosHoy.reduce((sum, g) => sum + g.monto, 0);
    const totalSemana = gastosSemana.reduce((sum, g) => sum + g.monto, 0);
    
    document.getElementById('summary-hoy').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana').textContent = `$${totalSemana.toFixed(2)}`;
    
    // Calcular diferencia
    const gastosPersona1 = gastosSemana.filter(g => g.persona === 'persona1')
        .reduce((sum, g) => sum + g.monto, 0);
    const gastosPersona2 = gastosSemana.filter(g => g.persona === 'persona2')
        .reduce((sum, g) => sum + g.monto, 0);
    
    const diferencia = Math.abs(gastosPersona1 - gastosPersona2);
    document.getElementById('summary-diferencia').textContent = `$${diferencia.toFixed(2)}`;
}