// ====================
// CONFIGURACIÓN INICIAL
// ====================

let registros = JSON.parse(localStorage.getItem('limites_registros')) || [];
let config = JSON.parse(localStorage.getItem('gastos_config')) || {
    nombres: {
        persona1: 'Yo',
        persona2: 'Ella'
    }
};

let limiteSeleccionado = null;
let chartInstance = null;

// Inicializar
document.addEventListener('DOMContentLoaded', function() {
    inicializarApp();
    cargarRegistros();
    actualizarUI();
});

function inicializarApp() {
    // Configurar tema
    const temaGuardado = localStorage.getItem('tema') || 'light';
    document.documentElement.setAttribute('data-theme', temaGuardado);
    actualizarIconoTema(temaGuardado);
    
    // Configurar eventos
    configurarEventos();
    
    // Configurar nombres
    document.getElementById('name-persona1-result').textContent = config.nombres.persona1;
    document.getElementById('name-persona2-result').textContent = config.nombres.persona2;
    
    // Configurar fecha por defecto
    document.getElementById('fecha-limite').value = new Date().toISOString().split('T')[0];
    
    // Inicializar gráfico
    inicializarGrafico();
}

function configurarEventos() {
    // Toggle tema
    document.getElementById('theme-btn').addEventListener('click', toggleTema);
    
    // Botón volver
    document.getElementById('back-btn').addEventListener('click', function() {
        window.location.href = 'index.html';
    });
    
    // Selección de límites
    document.querySelectorAll('.opcion-card').forEach(card => {
        card.addEventListener('click', function() {
            // Deseleccionar todas
            document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
            
            // Seleccionar esta
            this.classList.add('selected');
            limiteSeleccionado = parseFloat(this.dataset.limit);
            
            // Mostrar información de límite seleccionado
            const opcionInfo = document.getElementById('opcion-seleccionada-info');
            const texto = document.getElementById('opcion-seleccionada-texto');
            const tipo = document.getElementById('opcion-seleccionada-tipo');
            
            let nombreLimite = '';
            let tipoLimite = '';
            
            switch(limiteSeleccionado) {
                case 30:
                    nombreLimite = '$30.00';
                    tipoLimite = 'Estricto';
                    break;
                case 20:
                    nombreLimite = '$20.00';
                    tipoLimite = 'Moderado';
                    break;
                case 10:
                    nombreLimite = '$10.00';
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
            
            habilitarBotonCalcular();
        });
    });
    
    // Botón calcular
    document.getElementById('calcular-btn').addEventListener('click', calcular);
    
    // Enter en gasto real también calcula
    document.getElementById('gasto-real').addEventListener('keypress', function(e) {
        if (e.key === 'Enter' && !document.getElementById('calcular-btn').disabled) {
            calcular();
        }
    });
    
    // Botón guardar
    document.getElementById('guardar-btn').addEventListener('click', guardarRegistro);
    
    // Botón limpiar todo
    document.getElementById('clear-all').addEventListener('click', function() {
        if (confirm('¿Estás seguro de eliminar todos los registros?')) {
            registros = [];
            localStorage.setItem('limites_registros', JSON.stringify(registros));
            cargarRegistros();
            actualizarUI();
            mostrarNotificacion('Todos los registros eliminados', 'success');
        }
    });
    
    // Habilitar botón cuando se ingresa gasto
    document.getElementById('gasto-real').addEventListener('input', habilitarBotonCalcular);
    
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
}

function habilitarBotonCalcular() {
    const gasto = document.getElementById('gasto-real').value;
    const boton = document.getElementById('calcular-btn');
    boton.disabled = !(limiteSeleccionado !== null && gasto && parseFloat(gasto) > 0);
}

// ====================
// CÁLCULOS
// ====================

function calcular() {
    const gastoReal = parseFloat(document.getElementById('gasto-real').value);
    const descripcion = document.getElementById('descripcion-limite').value.trim();
    
    if (!gastoReal || gastoReal <= 0) {
        mostrarNotificacion('Por favor ingresa un gasto válido', 'error');
        return;
    }
    
    if (limiteSeleccionado === null) {
        mostrarNotificacion('Por favor selecciona un límite', 'error');
        return;
    }
    
    // Calcular según el límite seleccionado
    let exceso = 0;
    let ahorroTotal = 0;
    let ahorroPorPersona = 0;
    let dentroDeLimite = false;
    let montoLimite = limiteSeleccionado === 0 ? 0 : limiteSeleccionado;
    
    if (limiteSeleccionado === 0) {
        // Caso sin límite: todo el gasto se divide entre 2
        exceso = gastoReal;
        ahorroTotal = gastoReal;
        ahorroPorPersona = gastoReal / 2;
    } else {
        // Caso con límite
        exceso = Math.max(gastoReal - montoLimite, 0);
        
        if (exceso > 0) {
            // Hay exceso: se divide el exceso entre 2
            ahorroTotal = exceso;
            ahorroPorPersona = exceso / 2;
        } else {
            // Dentro del límite
            dentroDeLimite = true;
            ahorroTotal = 0;
            ahorroPorPersona = 0;
        }
    }
    
    // Mostrar resultados
    document.getElementById('result-gasto-real').textContent = `$${gastoReal.toFixed(2)}`;
    document.getElementById('result-limite').textContent = montoLimite === 0 ? 'Sin límite' : `$${montoLimite.toFixed(2)}`;
    document.getElementById('result-exceso').textContent = `$${exceso.toFixed(2)}`;
    document.getElementById('result-ahorro-total').textContent = `$${ahorroTotal.toFixed(2)}`;
    document.getElementById('ahorro-persona1').textContent = `$${ahorroPorPersona.toFixed(2)}`;
    document.getElementById('ahorro-persona2').textContent = `$${ahorroPorPersona.toFixed(2)}`;
    
    // Mostrar sección de resultados
    document.getElementById('result-section').style.display = 'block';
    
    // Guardar cálculo temporal
    window.calculoTemporal = {
        fecha: document.getElementById('fecha-limite').value,
        gastoReal: gastoReal,
        limite: montoLimite,
        exceso: exceso,
        ahorroTotal: ahorroTotal,
        ahorroPorPersona: ahorroPorPersona,
        dentroDeLimite: dentroDeLimite,
        descripcion: descripcion || `Gasto del día`
    };
    
    // Scroll a resultados
    document.getElementById('result-section').scrollIntoView({ behavior: 'smooth' });
}

function guardarRegistro() {
    if (!window.calculoTemporal) {
        mostrarNotificacion('Primero debes calcular un resultado', 'error');
        return;
    }
    
    const calculo = window.calculoTemporal;
    
    // Crear objeto de registro
    const nuevoRegistro = {
        id: Date.now(),
        fecha: calculo.fecha,
        gastoReal: calculo.gastoReal,
        limite: calculo.limite,
        exceso: calculo.exceso,
        ahorroTotal: calculo.ahorroTotal,
        ahorroPorPersona: calculo.ahorroPorPersona,
        dentroDeLimite: calculo.dentroDeLimite,
        descripcion: calculo.descripcion,
        timestamp: new Date().toISOString()
    };
    
    // Agregar al array
    registros.push(nuevoRegistro);
    
    // Guardar
    localStorage.setItem('limites_registros', JSON.stringify(registros));
    
    // Actualizar UI
    cargarRegistros();
    actualizarUI();
    
    // Limpiar formulario
    document.getElementById('gasto-real').value = '';
    document.getElementById('descripcion-limite').value = '';
    document.querySelectorAll('.opcion-card').forEach(c => c.classList.remove('selected'));
    document.getElementById('opcion-seleccionada-info').style.display = 'none';
    document.getElementById('result-section').style.display = 'none';
    limiteSeleccionado = null;
    window.calculoTemporal = null;
    habilitarBotonCalcular();
    
    // Mostrar confirmación
    const mensaje = calculo.dentroDeLimite 
        ? '✅ ¡Excelente! Cumpliste el límite del día'
        : `✅ Registro guardado. Ahorro forzado: $${calculo.ahorroTotal.toFixed(2)}`;
    
    mostrarNotificacion(mensaje, 'success');
}

// ====================
// INTERFAZ DE USUARIO
// ====================

function actualizarUI() {
    actualizarResumen();
    actualizarGrafico('excesos');
    cargarRegistros();
}

function actualizarResumen() {
    const hoy = new Date().toISOString().split('T')[0];
    const inicioSemana = obtenerInicioSemana();
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    
    // Filtrar registros
    const registrosHoy = registros.filter(r => r.fecha === hoy);
    const registrosSemana = registros.filter(r => new Date(r.fecha) >= inicioSemana);
    const registrosMes = registros.filter(r => new Date(r.fecha) >= inicioMes);
    
    // Calcular totales
    const totalHoy = registrosHoy.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalSemana = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalMes = registrosMes.reduce((sum, r) => sum + r.ahorroTotal, 0);
    
    // Actualizar resumen
    document.getElementById('summary-hoy-limite').textContent = `$${totalHoy.toFixed(2)}`;
    document.getElementById('summary-semana-limite').textContent = `$${totalSemana.toFixed(2)}`;
    document.getElementById('summary-mes-limite').textContent = `$${totalMes.toFixed(2)}`;
    
    // Calcular totales generales
    const totalAhorro = registros.reduce((sum, r) => sum + r.ahorroTotal, 0);
    const totalExcesos = registros.filter(r => r.exceso > 0).length;
    
    // Actualizar totales
    document.getElementById('total-ahorro-forzado').textContent = `$${totalAhorro.toFixed(2)}`;
    document.getElementById('total-dias-exceso').textContent = totalExcesos;
}

function cargarRegistros() {
    const container = document.getElementById('registros-container');
    const emptyState = document.getElementById('empty-state-limites');
    const totales = document.getElementById('totales-limites');
    
    if (registros.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        totales.style.display = 'none';
        return;
    }
    
    emptyState.style.display = 'none';
    totales.style.display = 'block';
    
    // Ordenar por fecha (más reciente primero)
    const registrosOrdenados = [...registros].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    
    let html = '';
    
    registrosOrdenados.forEach(registro => {
        const fechaFormateada = new Date(registro.fecha).toLocaleDateString('es-ES', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
        
        const clase = registro.dentroDeLimite ? 'cumplido' : 'exceso';
        const statusText = registro.dentroDeLimite ? 'Dentro de límite' : 'Con exceso';
        const limiteText = registro.limite === 0 ? 'Sin límite' : `Límite: $${registro.limite}`;
        
        html += `
            <div class="registro-item ${clase}">
                <div class="registro-header">
                    <div class="registro-status ${clase}">${statusText}</div>
                    <div class="registro-monto">$${registro.gastoReal.toFixed(2)}</div>
                </div>
                <div class="gasto-descripcion">${registro.descripcion}</div>
                <div class="gasto-meta">
                    <div class="gasto-info">
                        <span>${limiteText}</span>
                        ${!registro.dentroDeLimite ? 
                            `<span>Ahorro: $${registro.ahorroTotal.toFixed(2)}</span>` : 
                            ''
                        }
                    </div>
                    <div class="gasto-fecha">${fechaFormateada}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
    
    // Agregar botones de eliminación
    container.querySelectorAll('.registro-item').forEach((item, index) => {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Eliminar';
        deleteBtn.onclick = function() {
            eliminarRegistro(registrosOrdenados[index].id);
        };
        item.querySelector('.registro-header').appendChild(deleteBtn);
    });
}

function eliminarRegistro(id) {
    if (confirm('¿Estás seguro de eliminar este registro?')) {
        registros = registros.filter(registro => registro.id !== id);
        localStorage.setItem('limites_registros', JSON.stringify(registros));
        cargarRegistros();
        actualizarUI();
        mostrarNotificacion('Registro eliminado', 'success');
    }
}

// ====================
// GRÁFICOS
// ====================

function inicializarGrafico() {
    const ctx = document.getElementById('limites-chart').getContext('2d');
    
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Ahorro Forzado ($)',
                data: [],
                backgroundColor: '#667eea',
                borderColor: '#764ba2',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'var(--text-color)'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'var(--text-secondary)',
                        callback: function(value) {
                            return '$' + value;
                        }
                    },
                    grid: {
                        color: 'var(--border-color)'
                    }
                },
                x: {
                    ticks: {
                        color: 'var(--text-secondary)'
                    },
                    grid: {
                        color: 'var(--border-color)'
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
    
    const hoy = new Date();
    const inicioSemana = obtenerInicioSemana();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    
    switch(tipo) {
        case 'excesos':
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
            
            ultimos7Dias.forEach(fecha => {
                const registrosDia = registros.filter(r => r.fecha === fecha);
                const totalAhorro = registrosDia.reduce((sum, r) => sum + r.ahorroTotal, 0);
                datos.push(totalAhorro);
            });
            
            chartInstance.data.datasets[0].label = 'Ahorro Forzado ($)';
            chartInstance.data.datasets[0].backgroundColor = '#f56565';
            break;
            
        case 'ahorros':
            // Ahorro por semana (últimas 4 semanas)
            const ultimas4Semanas = Array.from({length: 4}, (_, i) => {
                const fecha = new Date();
                fecha.setDate(fecha.getDate() - (i * 7));
                const inicioSemanaFecha = obtenerInicioSemanaFecha(fecha);
                return inicioSemanaFecha;
            }).reverse();
            
            labels = ultimas4Semanas.map(fecha => {
                const d = new Date(fecha);
                return `Sem ${d.getDate()}/${d.getMonth() + 1}`;
            });
            
            ultimas4Semanas.forEach(inicioSemanaFecha => {
                const finSemana = new Date(inicioSemanaFecha);
                finSemana.setDate(finSemana.getDate() + 6);
                
                const registrosSemana = registros.filter(r => {
                    const fechaReg = new Date(r.fecha);
                    return fechaReg >= inicioSemanaFecha && fechaReg <= finSemana;
                });
                
                const totalAhorro = registrosSemana.reduce((sum, r) => sum + r.ahorroTotal, 0);
                datos.push(totalAhorro);
            });
            
            chartInstance.data.datasets[0].label = 'Ahorro Semanal ($)';
            chartInstance.data.datasets[0].backgroundColor = '#38a169';
            break;
    }
    
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = datos;
    chartInstance.update();
}

function obtenerInicioSemanaFecha(fecha) {
    const fechaObj = new Date(fecha);
    const dia = fechaObj.getDay();
    const diff = fechaObj.getDate() - dia + (dia === 0 ? -6 : 1);
    return new Date(fechaObj.setDate(diff)).setHours(0, 0, 0, 0);
}

// ====================
// ACCIONES
// ====================

function ejecutarAccion(accion) {
    switch(accion) {
        case 'ver-mis-limites':
            mostrarNotificacion('Mostrando tus excesos', 'info');
            // Aquí podrías implementar filtro por persona
            break;
            
        case 'ver-sus-limites':
            mostrarNotificacion('Mostrando sus excesos', 'info');
            break;
            
        case 'ver-semana-limites':
            mostrarNotificacion('Mostrando esta semana', 'info');
            // Filtrar registros de esta semana
            break;
            
        case 'ver-todos-limites':
            mostrarNotificacion('Mostrando todos', 'info');
            cargarRegistros();
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
    
    // Actualizar nombres en la página
    document.getElementById('name-persona1-result').textContent = nombre1;
    document.getElementById('name-persona2-result').textContent = nombre2;
    
    localStorage.setItem('gastos_config', JSON.stringify(config));
    ocultarModalNombres();
    
    mostrarNotificacion('Nombres actualizados', 'success');
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