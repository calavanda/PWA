import './style.css';
import L from 'leaflet';
import confetti from 'canvas-confetti';
import { 
  openDB, 
  saveReport, 
  getAllReports, 
  deleteReport, 
  syncPendingReports, 
  getStorageStats, 
  seedInitialReportsIfEmpty 
} from './db/indexedDB.js';
import { CameraService } from './services/camera.js';
import { GeolocationService } from './services/geolocation.js';
import { NotificationService } from './services/notifications.js';
import { Haptics, ShareService, NetworkMonitor, PWAInstallManager } from './services/native-extras.js';

/* ==========================================================================
   ESTADO GLOBAL DE LA APLICACIÓN
   ========================================================================== */
const state = {
  currentView: 'dashboard',
  currentFilter: 'all',
  reports: [],
  capturedPhoto: null,
  currentLocation: null,
  overviewMap: null,
  overviewMarkers: [],
  formMap: null,
  formMarker: null,
  swRegistration: null
};

// Instancias de servicios nativos
const camera = new CameraService();
const geo = new GeolocationService();

/* ==========================================================================
   ELEMENTOS DEL DOM
   ========================================================================== */
const el = {
  // Conectividad
  networkPill: document.getElementById('networkPill'),
  offlineAlert: document.getElementById('offlineAlert'),
  syncBtn: document.getElementById('syncBtn'),
  pendingBadge: document.getElementById('pendingBadge'),
  installPwaBtn: document.getElementById('installPwaBtn'),
  
  // Vistas
  views: document.querySelectorAll('.view-container'),
  navButtons: document.querySelectorAll('[data-view], [data-view-target]'),

  // Dashboard Stats
  statTotalReports: document.getElementById('statTotalReports'),
  statPendingReports: document.getElementById('statPendingReports'),
  statSyncedReports: document.getElementById('statSyncedReports'),
  statStorageUsage: document.getElementById('statStorageUsage'),
  btnRefreshMap: document.getElementById('btnRefreshMap'),
  btnSeedDemo: document.getElementById('btnSeedDemo'),

  // Formulario
  reportForm: document.getElementById('reportForm'),
  reportTitle: document.getElementById('reportTitle'),
  reportDesc: document.getElementById('reportDesc'),
  reportInspector: document.getElementById('reportInspector'),
  
  // Cámara
  cameraViewport: document.getElementById('cameraViewport'),
  cameraVideo: document.getElementById('cameraVideo'),
  btnStartCamera: document.getElementById('btnStartCamera'),
  btnCapturePhoto: document.getElementById('btnCapturePhoto'),
  btnToggleFacing: document.getElementById('btnToggleFacing'),
  btnCloseCamera: document.getElementById('btnCloseCamera'),
  fileInputPhoto: document.getElementById('fileInputPhoto'),
  photoPreviewWrap: document.getElementById('photoPreviewWrap'),
  photoPreviewImg: document.getElementById('photoPreviewImg'),
  btnRemovePhoto: document.getElementById('btnRemovePhoto'),
  cameraActionButtons: document.getElementById('cameraActionButtons'),

  // GPS
  btnGetLocation: document.getElementById('btnGetLocation'),
  gpsDisplay: document.getElementById('gpsDisplay'),
  gpsAccuracyText: document.getElementById('gpsAccuracyText'),
  formMapContainer: document.getElementById('formMap'),

  // Bitácora
  reportsContainer: document.getElementById('reportsContainer'),
  filterButtons: document.querySelectorAll('.filter-btn'),
  btnExportJson: document.getElementById('btnExportJson'),
  btnExportCsv: document.getElementById('btnExportCsv'),

  // Modal
  reportDetailModal: document.getElementById('reportDetailModal'),
  modalReportTitle: document.getElementById('modalReportTitle'),
  modalReportContent: document.getElementById('modalReportContent'),
  btnCloseModal: document.getElementById('btnCloseModal'),

  // Diagnóstico
  diagSwStatus: document.getElementById('diagSwStatus'),
  diagStorageText: document.getElementById('diagStorageText'),
  diagStoragePercent: document.getElementById('diagStoragePercent'),
  diagNotifText: document.getElementById('diagNotifText'),
  btnTestNotification: document.getElementById('btnTestNotification'),
  btnTestVibration: document.getElementById('btnTestVibration'),
  btnUpdateSw: document.getElementById('btnUpdateSw'),
  btnClearDb: document.getElementById('btnClearDb'),
  diagNetText: document.getElementById('diagNetText'),
  diagNetBadge: document.getElementById('diagNetBadge'),

  // Toast
  toastContainer: document.getElementById('toastContainer')
};

/* ==========================================================================
   TOAST HELPER
   ========================================================================== */
function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  el.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/* ==========================================================================
   1. REGISTRO DEL SERVICE WORKER (REQUISITO 3)
   ========================================================================== */
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      state.swRegistration = registration;
      console.log('[App] Service Worker registrado con éxito. Scope:', registration.scope);
      
      if (el.diagSwStatus) {
        el.diagSwStatus.textContent = `Registrado y activo (Scope: ${registration.scope})`;
      }

      // Escuchar actualizaciones
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('Nueva versión disponible. Actualizando en segundo plano.', 'info');
          }
        });
      });
    } catch (error) {
      console.error('[App] Error al registrar Service Worker:', error);
      if (el.diagSwStatus) {
        el.diagSwStatus.textContent = 'Error al registrar Service Worker';
      }
    }
  } else {
    if (el.diagSwStatus) {
      el.diagSwStatus.textContent = 'No soportado por el navegador';
    }
  }
}

/* ==========================================================================
   2. GESTOR DE INSTALABILIDAD PWA (REQUISITO 1)
   ========================================================================== */
const pwaInstaller = new PWAInstallManager((canInstall, justInstalled) => {
  if (canInstall) {
    el.installPwaBtn.style.display = 'inline-flex';
  } else {
    el.installPwaBtn.style.display = 'none';
  }

  if (justInstalled) {
    showToast('¡Gracias por instalar GeoField en tu dispositivo!', 'success');
    confetti({ particleCount: 80, spread: 60, origin: { y: 0.8 } });
  }
});

el.installPwaBtn.addEventListener('click', async () => {
  Haptics.tap();
  const installed = await pwaInstaller.promptInstall();
  if (installed) {
    showToast('Instalación en progreso...', 'info');
  }
});

/* ==========================================================================
   3. ARQUITECTURA APP SHELL & NAVEGACIÓN CLIENT-SIDE (REQUISITO 2)
   ========================================================================== */
function switchView(viewId) {
  Haptics.tap();
  state.currentView = viewId;

  // Actualizar contenedores de vista
  el.views.forEach((v) => {
    v.classList.remove('active');
    if (v.id === `view-${viewId}`) {
      v.classList.add('active');
    }
  });

  // Actualizar botones de navegación Desktop y Mobile
  document.querySelectorAll('[data-view]').forEach((btn) => {
    if (btn.getAttribute('data-view') === viewId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  window.location.hash = viewId;

  // Si cambiamos al Dashboard, recalcular tamaño del mapa
  if (viewId === 'dashboard' && state.overviewMap) {
    setTimeout(() => state.overviewMap.invalidateSize(), 200);
  }

  // Si salimos de nuevo reporte y la cámara estaba prendida, detenerla
  if (viewId !== 'new-report') {
    camera.stopStream();
    el.cameraViewport.classList.remove('active');
    el.cameraActionButtons.style.display = 'flex';
  }

  // Si abrimos la vista de diagnósticos, refrescar métricas
  if (viewId === 'diagnostics') {
    refreshDiagnosticView();
  }
}

// Configurar listeners de navegación
el.navButtons.forEach((btn) => {
  btn.addEventListener('click', (e) => {
    const target = btn.getAttribute('data-view') || btn.getAttribute('data-view-target');
    if (target) {
      switchView(target);
    }
  });
});

document.getElementById('brandBtn').addEventListener('click', () => switchView('dashboard'));

/* ==========================================================================
   4. CONECTIVIDAD & RED (ONLINE/OFFLINE EVENTS)
   ========================================================================== */
const networkMonitor = new NetworkMonitor((netInfo) => {
  updateNetworkUI(netInfo);
});

function updateNetworkUI(netInfo) {
  if (netInfo.online) {
    el.networkPill.className = 'network-pill online';
    el.networkPill.querySelector('.network-text').textContent = 'En Línea';
    el.offlineAlert.style.display = 'none';

    // Auto-sincronizar pendientes al recuperar la conexión
    const pending = state.reports.filter(r => r.status === 'local');
    if (pending.length > 0) {
      showToast(`Conexión reestablecida. Sincronizando ${pending.length} reporte(s)...`, 'info');
      handleSyncReports();
    }
  } else {
    el.networkPill.className = 'network-pill offline';
    el.networkPill.querySelector('.network-text').textContent = 'Sin Conexión';
    el.offlineAlert.style.display = 'flex';
    showToast('Sin conexión a Internet. Modo Offline persistente activado.', 'info');
  }

  if (el.diagNetText) {
    el.diagNetText.textContent = `Tipo: ${netInfo.type} | Velocidad: ${netInfo.downlink} | RTT: ${netInfo.rtt}`;
    el.diagNetBadge.textContent = netInfo.online ? 'En Línea' : 'Offline';
    el.diagNetBadge.className = `badge-status-pill ${netInfo.online ? 'success' : 'warning'}`;
  }
}

/* ==========================================================================
   5. WEB API: CÁMARA NATIVA EN VIVO (REQUISITO 4)
   ========================================================================== */
el.btnStartCamera.addEventListener('click', async () => {
  Haptics.tap();
  try {
    el.cameraViewport.classList.add('active');
    el.cameraActionButtons.style.display = 'none';
    await camera.startStream(el.cameraVideo);
    showToast('Cámara iniciada. Enfoca la incidencia.', 'info');
  } catch (error) {
    console.error('Error al abrir la cámara:', error);
    showToast('No se pudo acceder a la cámara. Usa la opción "Subir Imagen".', 'error');
    el.cameraViewport.classList.remove('active');
    el.cameraActionButtons.style.display = 'flex';
  }
});

el.btnToggleFacing.addEventListener('click', async () => {
  Haptics.tap();
  try {
    await camera.toggleFacingMode(el.cameraVideo);
  } catch (e) {
    showToast('No fue posible alternar la cámara en este dispositivo.', 'info');
  }
});

el.btnCapturePhoto.addEventListener('click', () => {
  Haptics.cameraShutter();
  try {
    const dataUrl = camera.captureFrame(el.cameraVideo);
    setCapturedPhoto(dataUrl);
    camera.stopStream();
    el.cameraViewport.classList.remove('active');
    showToast('Fotografía capturada y estampada exitosamente.', 'success');
  } catch (error) {
    showToast('Error al capturar la fotografía: ' + error.message, 'error');
  }
});

el.btnCloseCamera.addEventListener('click', () => {
  Haptics.tap();
  camera.stopStream();
  el.cameraViewport.classList.remove('active');
  el.cameraActionButtons.style.display = 'flex';
});

el.fileInputPhoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await camera.processUploadedFile(file);
    setCapturedPhoto(dataUrl);
    showToast('Imagen procesada y optimizada para almacenamiento.', 'success');
  } catch (err) {
    showToast('Error al cargar la imagen seleccionada.', 'error');
  }
});

el.btnRemovePhoto.addEventListener('click', () => {
  Haptics.tap();
  setCapturedPhoto(null);
  el.cameraActionButtons.style.display = 'flex';
});

function setCapturedPhoto(dataUrl) {
  state.capturedPhoto = dataUrl;
  if (dataUrl) {
    el.photoPreviewImg.src = dataUrl;
    el.photoPreviewWrap.style.display = 'block';
    el.cameraActionButtons.style.display = 'none';
  } else {
    el.photoPreviewImg.src = '';
    el.photoPreviewWrap.style.display = 'none';
  }
}

/* ==========================================================================
   6. WEB API: GEOLOCALIZACIÓN GPS (REQUISITO 4)
   ========================================================================== */
el.btnGetLocation.addEventListener('click', async () => {
  Haptics.tap();
  el.gpsDisplay.textContent = 'Buscando satélites GPS...';
  el.btnGetLocation.disabled = true;

  try {
    const pos = await geo.getCurrentPosition();
    const address = await geo.getAddressLabel(pos.latitude, pos.longitude);
    
    state.currentLocation = {
      latitude: pos.latitude,
      longitude: pos.longitude,
      accuracy: pos.accuracy,
      addressLabel: address,
      timestamp: pos.timestamp
    };

    el.gpsDisplay.textContent = `${pos.latitude.toFixed(6)}°, ${pos.longitude.toFixed(6)}°`;
    el.gpsAccuracyText.innerHTML = `<strong>Zona:</strong> ${address} <br/><strong>Precisión satelital:</strong> ± ${pos.accuracy} metros`;
    
    renderFormMap(pos.latitude, pos.longitude);
    Haptics.success();
    showToast('Coordenadas GPS fijadas con éxito.', 'success');
  } catch (error) {
    console.error('Error GPS:', error);
    el.gpsDisplay.textContent = 'Ubicación no obtenida';
    el.gpsAccuracyText.textContent = error.message;
    showToast(error.message, 'error');
  } finally {
    el.btnGetLocation.disabled = false;
  }
});

function renderFormMap(lat, lon) {
  el.formMapContainer.style.display = 'block';

  if (!state.formMap) {
    state.formMap = L.map('formMap').setView([lat, lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(state.formMap);

    state.formMarker = L.marker([lat, lon], { draggable: true }).addTo(state.formMap);
    
    // Permitir ajustar manualmente el marcador arrastrándolo
    state.formMarker.on('dragend', async (e) => {
      const { lat: newLat, lng: newLon } = e.target.getLatLng();
      const newAddress = await geo.getAddressLabel(newLat, newLon);
      state.currentLocation.latitude = newLat;
      state.currentLocation.longitude = newLon;
      state.currentLocation.addressLabel = newAddress;
      el.gpsDisplay.textContent = `${newLat.toFixed(6)}°, ${newLon.toFixed(6)}°`;
      el.gpsAccuracyText.innerHTML = `<strong>Zona (Ajustada):</strong> ${newAddress}`;
    });
  } else {
    state.formMap.setView([lat, lon], 16);
    state.formMarker.setLatLng([lat, lon]);
    setTimeout(() => state.formMap.invalidateSize(), 150);
  }
}

/* ==========================================================================
   7. CREACIÓN & PERSISTENCIA DE REPORTES (INDEXEDDB)
   ========================================================================== */
el.reportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  Haptics.tap();

  const title = el.reportTitle.value.trim();
  const desc = el.reportDesc.value.trim();
  const category = el.reportForm.querySelector('input[name="category"]:checked')?.value || 'vial';
  const priority = el.reportForm.querySelector('input[name="priority"]:checked')?.value || 'medium';
  const inspector = el.reportInspector.value.trim() || 'Inspector';

  if (!title) {
    showToast('Por favor escribe un título para el reporte.', 'error');
    return;
  }

  // Si no capturó foto, generar una imagen de reemplazo informativa
  const photo = state.capturedPhoto || generateFallbackPhotoBadge(title, category);

  // Si no obtuvo GPS, asignar fallback céntrico
  const location = state.currentLocation || {
    latitude: 19.4326 + (Math.random() - 0.5) * 0.05,
    longitude: -99.1332 + (Math.random() - 0.5) * 0.05,
    accuracy: 10,
    addressLabel: 'Ubicación estimada en terreno',
    timestamp: new Date().toISOString()
  };

  const newReport = {
    title,
    description: desc,
    category,
    priority,
    inspector,
    location,
    photo,
    status: 'local', // Siempre se guarda en IndexedDB primero (Offline First)
    createdAt: new Date().toISOString()
  };

  try {
    await saveReport(newReport);
    Haptics.success();
    
    // Disparar Web API: Notificación de guardado offline si el usuario lo tiene habilitado
    NotificationService.notifyReportSavedOffline(title);

    showToast('¡Reporte guardado con éxito en IndexedDB!', 'success');
    
    // Resetear formulario
    el.reportForm.reset();
    setCapturedPhoto(null);
    state.currentLocation = null;
    el.gpsDisplay.textContent = 'Sin registrar';
    el.gpsAccuracyText.textContent = 'Presiona el botón para fijar la posición satelital del punto inspeccionado.';
    el.formMapContainer.style.display = 'none';

    // Recargar datos y navegar a la bitácora
    await loadReportsFromDB();
    switchView('log');

    // Si estamos en línea, sincronizar automáticamente
    if (navigator.onLine) {
      setTimeout(handleSyncReports, 1000);
    }
  } catch (error) {
    console.error('Error al guardar reporte en IndexedDB:', error);
    showToast('Error al persistir el reporte: ' + error.message, 'error');
  }
});

function generateFallbackPhotoBadge(title, category) {
  return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240" viewBox="0 0 400 240"><rect width="100%" height="100%" fill="%230f172a"/><rect x="2" y="2" width="396" height="236" fill="none" stroke="%2338bdf8" stroke-width="2" stroke-opacity="0.3"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-size="18" font-family="sans-serif">📸 ${category.toUpperCase()}</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="13" font-family="sans-serif">${encodeURIComponent(title.slice(0, 35))}</text></svg>`;
}

/* ==========================================================================
   8. GESTIÓN DE LA BITÁCORA (HISTORIAL DE REPORTES)
   ========================================================================== */
async function loadReportsFromDB() {
  state.reports = await getAllReports();
  updateMetricsUI();
  renderReportsList();
  renderOverviewMap();
}

function updateMetricsUI() {
  const total = state.reports.length;
  const pending = state.reports.filter(r => r.status === 'local').length;
  const synced = total - pending;

  el.statTotalReports.textContent = total;
  el.statPendingReports.textContent = pending;
  el.statSyncedReports.textContent = synced;
  el.pendingBadge.textContent = pending;

  if (pending > 0) {
    el.pendingBadge.style.display = 'inline-block';
  } else {
    el.pendingBadge.style.display = 'none';
  }

  // Actualizar estimación de espacio
  getStorageStats().then(stats => {
    el.statStorageUsage.textContent = `${stats.usageMB} MB`;
    if (el.diagStorageText) {
      el.diagStorageText.textContent = `Uso: ${stats.usageMB} MB de ${stats.quotaMB} MB disponibles`;
      el.diagStoragePercent.textContent = `${stats.percentUsed}%`;
    }
  });
}

function renderReportsList() {
  el.reportsContainer.innerHTML = '';

  const filtered = state.reports.filter(r => {
    if (state.currentFilter === 'all') return true;
    return r.status === state.currentFilter;
  });

  if (filtered.length === 0) {
    el.reportsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.75rem; color: var(--text-faint);"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <p style="font-size: 1.1rem; font-weight: 600; color: var(--text-main);">No hay reportes en esta categoría</p>
        <p style="font-size: 0.85rem;">Crea un nuevo reporte o recarga los datos de muestra.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((rep) => {
    const card = document.createElement('div');
    card.className = 'report-item-card';

    const dateFormatted = new Date(rep.createdAt).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });

    const isLocal = rep.status === 'local';

    card.innerHTML = `
      <div class="report-thumb-wrap">
        <img src="${rep.photo || '/icons/icon-512x512.png'}" alt="${rep.title}" loading="lazy" />
        <span class="report-status-badge ${isLocal ? 'local' : 'synced'}">
          ${isLocal ? '● Local (Offline)' : '✓ Sincronizado'}
        </span>
        <span class="report-category-badge">${rep.category.toUpperCase()}</span>
      </div>

      <div class="report-card-body">
        <div class="report-card-header">
          <h4 class="report-card-title">${rep.title}</h4>
        </div>
        <p class="report-card-desc">${rep.description || 'Sin notas adicionales registradas.'}</p>
        
        <div class="report-card-footer">
          <div>
            <span>${dateFormatted}</span><br/>
            <span style="color: #38bdf8;">${rep.location ? rep.location.addressLabel || 'Con coordenadas GPS' : 'Sin GPS'}</span>
          </div>

          <div class="report-actions-row">
            <!-- Web API: Share -->
            <button class="btn-card-action" data-action="share" data-id="${rep.id}" title="Compartir Reporte (Web Share API)">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
            </button>
            <!-- Ver Detalle -->
            <button class="btn-card-action" data-action="view" data-id="${rep.id}" title="Ver Detalle">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <!-- Eliminar de IndexedDB -->
            <button class="btn-card-action danger" data-action="delete" data-id="${rep.id}" title="Eliminar de IndexedDB">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    // Conectar eventos de acciones en la tarjeta
    card.querySelector('[data-action="share"]').addEventListener('click', async () => {
      Haptics.tap();
      const result = await ShareService.shareReport(rep);
      if (result === 'clipboard') {
        showToast('Resumen del reporte copiado al portapapeles.', 'info');
      } else if (result) {
        showToast('Reporte compartido.', 'success');
      }
    });

    card.querySelector('[data-action="view"]').addEventListener('click', () => {
      Haptics.tap();
      openReportModal(rep);
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      Haptics.tap();
      if (confirm(`¿Deseas eliminar el reporte "${rep.title}" de IndexedDB?`)) {
        await deleteReport(rep.id);
        showToast('Reporte eliminado de IndexedDB.', 'info');
        await loadReportsFromDB();
      }
    });

    el.reportsContainer.appendChild(card);
  });
}

// Filtros de bitácora
el.filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    Haptics.tap();
    el.filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFilter = btn.getAttribute('data-filter');
    renderReportsList();
  });
});

/* ==========================================================================
   9. MAPA GLOBAL DE INCIDENCIAS (LEAFLET)
   ========================================================================== */
function renderOverviewMap() {
  if (!document.getElementById('overviewMap')) return;

  const validReports = state.reports.filter(r => r.location && r.location.latitude && r.location.longitude);
  const defaultCenter = validReports.length > 0
    ? [validReports[0].location.latitude, validReports[0].location.longitude]
    : [19.432608, -99.133209];

  if (!state.overviewMap) {
    state.overviewMap = L.map('overviewMap').setView(defaultCenter, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(state.overviewMap);
  }

  // Limpiar marcadores antiguos
  state.overviewMarkers.forEach(m => state.overviewMap.removeLayer(m));
  state.overviewMarkers = [];

  // Agregar nuevos marcadores
  validReports.forEach((rep) => {
    const marker = L.marker([rep.location.latitude, rep.location.longitude]).addTo(state.overviewMap);
    
    const popupContent = `
      <div style="font-family: inherit; font-size: 13px; max-width: 200px;">
        <strong style="color: #0284c7;">${rep.title}</strong><br/>
        <span style="font-size: 11px; color: #64748b;">${rep.category.toUpperCase()} | Prioridad: ${rep.priority}</span>
        ${rep.photo ? `<img src="${rep.photo}" style="width: 100%; border-radius: 4px; margin-top: 4px; max-height: 90px; object-fit: cover;" />` : ''}
      </div>
    `;
    marker.bindPopup(popupContent);
    state.overviewMarkers.push(marker);
  });

  if (validReports.length > 1) {
    const group = new L.featureGroup(state.overviewMarkers);
    state.overviewMap.fitBounds(group.getBounds().pad(0.2));
  }
}

el.btnRefreshMap.addEventListener('click', () => {
  Haptics.tap();
  renderOverviewMap();
  showToast('Mapa recentrado.', 'info');
});

/* ==========================================================================
   10. SINCRONIZACIÓN EN LA NUBE
   ========================================================================== */
async function handleSyncReports() {
  Haptics.tap();
  const pending = state.reports.filter(r => r.status === 'local');
  if (pending.length === 0) {
    showToast('Todos los reportes ya se encuentran sincronizados en la nube.', 'info');
    return;
  }

  el.syncBtn.disabled = true;
  el.syncBtn.querySelector('.sync-label').textContent = 'Sincronizando...';

  try {
    const res = await syncPendingReports();
    Haptics.success();
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    
    // Disparar Web API: Notificación del sistema
    NotificationService.notifySyncSuccess(res.syncedCount);

    showToast(`¡${res.syncedCount} reporte(s) sincronizados con la nube con éxito!`, 'success');
    await loadReportsFromDB();
  } catch (error) {
    showToast('Error en la sincronización: ' + error.message, 'error');
  } finally {
    el.syncBtn.disabled = false;
    el.syncBtn.querySelector('.sync-label').textContent = 'Sincronizar';
  }
}

el.syncBtn.addEventListener('click', handleSyncReports);

/* ==========================================================================
   11. EXPORTACIÓN DE DATOS (OFFLINE BACKUP)
   ========================================================================== */
el.btnExportJson.addEventListener('click', () => {
  Haptics.tap();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.reports, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `GeoField_Backup_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Archivo JSON de respaldo generado.', 'success');
});

el.btnExportCsv.addEventListener('click', () => {
  Haptics.tap();
  if (state.reports.length === 0) {
    showToast('No hay reportes para exportar.', 'info');
    return;
  }

  const headers = ['ID', 'Título', 'Categoría', 'Prioridad', 'Estado', 'Fecha', 'Latitud', 'Longitud', 'Zona'];
  const rows = state.reports.map(r => [
    r.id,
    `"${(r.title || '').replace(/"/g, '""')}"`,
    r.category,
    r.priority,
    r.status,
    r.createdAt,
    r.location ? r.location.latitude : '',
    r.location ? r.location.longitude : '',
    `"${(r.location?.addressLabel || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", encodeURI(csvContent));
  downloadAnchor.setAttribute("download", `GeoField_Reportes_${Date.now()}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Reporte exportado a CSV.', 'success');
});

/* ==========================================================================
   12. MODAL DE DETALLE
   ========================================================================== */
function openReportModal(rep) {
  el.modalReportTitle.textContent = rep.title;
  el.modalReportContent.innerHTML = `
    <div style="margin-bottom: 1rem; border-radius: var(--radius-md); overflow: hidden; max-height: 240px;">
      <img src="${rep.photo}" style="width: 100%; height: auto; object-fit: cover;" alt="${rep.title}" />
    </div>
    <div style="font-size: 0.9rem; line-height: 1.6;">
      <p><strong>Categoría:</strong> ${rep.category.toUpperCase()} | <strong>Prioridad:</strong> ${rep.priority.toUpperCase()}</p>
      <p><strong>Estado:</strong> <span style="color: ${rep.status === 'synced' ? '#34d399' : '#fbbf24'};">${rep.status === 'synced' ? 'Sincronizado en la Nube' : 'Almacenado Localmente (IndexedDB)'}</span></p>
      <p><strong>Inspector:</strong> ${rep.inspector}</p>
      <p><strong>Fecha:</strong> ${new Date(rep.createdAt).toLocaleString()}</p>
      <p style="margin-top: 0.5rem;"><strong>Observaciones Técnicas:</strong><br/>${rep.description || 'Sin notas adicionales.'}</p>
      ${rep.location ? `
        <div style="background: var(--bg-surface-elevated); padding: 0.75rem; border-radius: var(--radius-sm); margin-top: 0.75rem;">
          <strong>Coordenadas GPS:</strong> ${rep.location.latitude}, ${rep.location.longitude}<br/>
          <strong>Zona:</strong> ${rep.location.addressLabel || 'N/A'}<br/>
          <a href="https://www.google.com/maps?q=${rep.location.latitude},${rep.location.longitude}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; text-decoration: underline; font-weight: 600; display: inline-block; margin-top: 0.25rem;">Abrir en Google Maps ↗</a>
        </div>
      ` : ''}
    </div>
  `;
  el.reportDetailModal.classList.add('active');
}

el.btnCloseModal.addEventListener('click', () => {
  el.reportDetailModal.classList.remove('active');
});

el.reportDetailModal.addEventListener('click', (e) => {
  if (e.target === el.reportDetailModal) {
    el.reportDetailModal.classList.remove('active');
  }
});

/* ==========================================================================
   13. DIAGNÓSTICO & PRUEBAS DE WEB APIS
   ========================================================================== */
function refreshDiagnosticView() {
  const perm = NotificationService.getPermissionState();
  el.diagNotifText.textContent = `Permiso actual: ${perm.toUpperCase()}`;
}

el.btnTestNotification.addEventListener('click', async () => {
  Haptics.tap();
  const hasPerm = await NotificationService.requestPermission();
  if (hasPerm) {
    await NotificationService.notify('🛰️ Alerta de Prueba GeoField', {
      body: 'La Web API de Notificaciones está funcionando al 100% en esta PWA.',
      tag: 'test-alert'
    });
    showToast('Notificación nativa emitida con éxito.', 'success');
  } else {
    showToast('El permiso de notificaciones fue denegado o no está soportado.', 'error');
  }
  refreshDiagnosticView();
});

el.btnTestVibration.addEventListener('click', () => {
  if (Haptics.isSupported()) {
    Haptics.success();
    showToast('Vibración háptica disparada (patrón de confirmación).', 'info');
  } else {
    showToast('La Vibration API no está soportada en este hardware o navegador de escritorio.', 'info');
  }
});

el.btnUpdateSw.addEventListener('click', async () => {
  Haptics.tap();
  if (state.swRegistration) {
    try {
      await state.swRegistration.update();
      showToast('Service Worker verificado y actualizado.', 'success');
    } catch {
      showToast('No fue posible forzar la actualización del Service Worker.', 'info');
    }
  }
});

el.btnClearDb.addEventListener('click', async () => {
  Haptics.tap();
  if (confirm('¿Estás seguro de que deseas vaciar todos los registros de IndexedDB?')) {
    const all = await getAllReports();
    for (const r of all) {
      await deleteReport(r.id);
    }
    await loadReportsFromDB();
    showToast('Base de datos IndexedDB vaciada.', 'info');
  }
});

el.btnSeedDemo.addEventListener('click', async () => {
  Haptics.tap();
  await seedInitialReportsIfEmpty();
  await loadReportsFromDB();
  showToast('Datos de demostración cargados en IndexedDB.', 'success');
});

/* ==========================================================================
   14. INICIALIZACIÓN GLOBAL DE LA APLICACIÓN
   ========================================================================== */
async function initApp() {
  console.log('[App] Inicializando GeoField PWA...');

  // Registrar Service Worker
  await registerServiceWorker();

  // Abrir IndexedDB y cargar datos
  await openDB();
  await seedInitialReportsIfEmpty();
  await loadReportsFromDB();

  // Inicializar estado de red
  updateNetworkUI(networkMonitor.getInfo());

  // Resolver hash en URL si existe
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash && ['dashboard', 'new-report', 'log', 'diagnostics'].includes(initialHash)) {
    switchView(initialHash);
  } else {
    switchView('dashboard');
  }

  console.log('[App] GeoField PWA lista y operativa.');
}

window.addEventListener('DOMContentLoaded', initApp);
