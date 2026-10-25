/**
 * GeoField PWA - Módulo de Persistencia IndexedDB Nativo
 * Proporciona almacenamiento asíncrono y transaccional para reportes de campo,
 * fotografías tomadas con la cámara y colas de sincronización offline.
 */

const DB_NAME = 'GeoFieldReportsDB';
const DB_VERSION = 1;
const STORE_REPORTS = 'reports';
const STORE_SETTINGS = 'settings';

let dbInstance = null;

/**
 * Inicializa y abre la conexión con IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Store para los reportes de incidencias
      if (!db.objectStoreNames.contains(STORE_REPORTS)) {
        const reportStore = db.createObjectStore(STORE_REPORTS, { keyPath: 'id' });
        reportStore.createIndex('createdAt', 'createdAt', { unique: false });
        reportStore.createIndex('status', 'status', { unique: false });
        reportStore.createIndex('category', 'category', { unique: false });
        reportStore.createIndex('priority', 'priority', { unique: false });
      }

      // 2. Store para configuraciones de usuario y metadatos
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Error al abrir base de datos:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Guarda o actualiza un reporte en IndexedDB
 * @param {Object} report
 * @returns {Promise<Object>}
 */
export async function saveReport(report) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_REPORTS], 'readwrite');
    const store = transaction.objectStore(STORE_REPORTS);
    
    // Asegurar estructura
    const data = {
      id: report.id || `rep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      title: report.title || 'Incidencia sin título',
      category: report.category || 'infraestructura',
      priority: report.priority || 'medium',
      description: report.description || '',
      location: report.location || null,
      photo: report.photo || null,
      status: report.status || 'local', // 'local' = pendiente de sincronizar, 'synced' = en la nube
      createdAt: report.createdAt || new Date().toISOString(),
      syncedAt: report.syncedAt || null,
      inspector: report.inspector || 'Inspector de Campo'
    };

    const request = store.put(data);

    request.onsuccess = () => resolve(data);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Obtiene todos los reportes ordenados del más reciente al más antiguo
 * @returns {Promise<Array>}
 */
export async function getAllReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_REPORTS], 'readonly');
    const store = transaction.objectStore(STORE_REPORTS);
    const index = store.index('createdAt');
    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Obtiene un reporte específico por su ID
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getReportById(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_REPORTS], 'readonly');
    const store = transaction.objectStore(STORE_REPORTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Elimina un reporte por su ID
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_REPORTS], 'readwrite');
    const store = transaction.objectStore(STORE_REPORTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Actualiza el estado de sincronización de un reporte
 * @param {string} id
 * @param {'local'|'synced'} newStatus
 */
export async function updateReportStatus(id, newStatus) {
  const item = await getReportById(id);
  if (!item) return null;
  item.status = newStatus;
  if (newStatus === 'synced') {
    item.syncedAt = new Date().toISOString();
  }
  return saveReport(item);
}

/**
 * Sincroniza todos los reportes locales pendientes (Simulación de API Cloud)
 * @returns {Promise<{syncedCount: number, reports: Array}>}
 */
export async function syncPendingReports() {
  const reports = await getAllReports();
  const pending = reports.filter(r => r.status === 'local');
  
  if (pending.length === 0) {
    return { syncedCount: 0, reports: [] };
  }

  // Simulamos envío seguro al servidor
  const now = new Date().toISOString();
  for (const rep of pending) {
    rep.status = 'synced';
    rep.syncedAt = now;
    await saveReport(rep);
  }

  return { syncedCount: pending.length, reports: pending };
}

/**
 * Consulta la estimación de almacenamiento de la PWA (Storage API)
 * @returns {Promise<{quotaMB: string, usageMB: string, percentUsed: number}>}
 */
export async function getStorageStats() {
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const quotaMB = (estimate.quota / (1024 * 1024)).toFixed(1);
      const usageMB = (estimate.usage / (1024 * 1024)).toFixed(2);
      const percentUsed = Math.min(100, ((estimate.usage / estimate.quota) * 100).toFixed(2));
      return { quotaMB, usageMB, percentUsed };
    } catch {
      // Fallback
    }
  }
  return { quotaMB: 'N/A', usageMB: '0.5', percentUsed: 1 };
}

/**
 * Carga reportes de ejemplo iniciales si la base de datos está vacía
 */
export async function seedInitialReportsIfEmpty() {
  const existing = await getAllReports();
  if (existing.length > 0) return existing;

  const samples = [
    {
      id: 'rep_sample_01',
      title: 'Bache con fuga de agua visible en avenida principal',
      category: 'vial',
      priority: 'high',
      description: 'Hundimiento asfáltico de aprox. 1.2 metros de diámetro con emanación de agua potable continua. Riesgo para ciclistas y vehículos ligeros.',
      location: {
        latitude: 19.432608,
        longitude: -99.133209,
        accuracy: 4.8,
        addressLabel: 'Centro Histórico, CDMX',
        timestamp: new Date().toISOString()
      },
      photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2338bdf8" font-size="20" font-family="sans-serif">📸 Evidencia de Baches y Fuga</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="14" font-family="sans-serif">Captura en Terreno #01</text></svg>',
      status: 'synced',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      syncedAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      inspector: 'Arq. Mariana Ruiz (Auditor)'
    },
    {
      id: 'rep_sample_02',
      title: 'Luminaria solar descalibrada y poste inclinado',
      category: 'electric',
      priority: 'medium',
      description: 'Poste metálico con inclinación aproximada de 15 grados tras colisión vehicular menor. Panel solar intacto pero sin encendido nocturno.',
      location: {
        latitude: 19.427025,
        longitude: -99.167665,
        accuracy: 6.2,
        addressLabel: 'Paseo de la Reforma, CDMX',
        timestamp: new Date().toISOString()
      },
      photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%2306b6d4" font-size="20" font-family="sans-serif">📸 Luminaria y Poste Inclinado</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="14" font-family="sans-serif">Captura en Terreno #02</text></svg>',
      status: 'local',
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      syncedAt: null,
      inspector: 'Ing. Carlos Mendoza'
    },
    {
      id: 'rep_sample_03',
      title: 'Acumulación de residuos de construcción en canaleta pluvial',
      category: 'environmental',
      priority: 'critical',
      description: 'Escombros arrojados bloqueando el 80% del drenaje pluvial antes del inicio de la temporada de lluvias. Requiere retiro de cuadrilla urgente.',
      location: {
        latitude: 19.419444,
        longitude: -99.155556,
        accuracy: 3.5,
        addressLabel: 'Colonia Roma Norte, CDMX',
        timestamp: new Date().toISOString()
      },
      photo: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250"><rect width="100%" height="100%" fill="%231e293b"/><text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" fill="%23f43f5e" font-size="20" font-family="sans-serif">📸 Residuos en Desagüe Pluvial</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" fill="%2394a3b8" font-size="14" font-family="sans-serif">Captura en Terreno #03</text></svg>',
      status: 'local',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      syncedAt: null,
      inspector: 'Biol. Andrea Gómez'
    }
  ];

  for (const s of samples) {
    await saveReport(s);
  }

  return getAllReports();
}
