/**
 * GeoField PWA - Servicios Nativos Complementarios
 * Incluye: Vibration API, Web Share API, Network Information API y PWA Install Prompt
 */

/**
 * Servicio de Vibración Háptica (Vibration API)
 */
export const Haptics = {
  isSupported() {
    return 'vibrate' in navigator;
  },

  /** Vibración muy sutil para botones y toques (15ms) */
  tap() {
    if (this.isSupported()) {
      try { navigator.vibrate(20); } catch {}
    }
  },

  /** Vibración de obturador de cámara (50ms) */
  cameraShutter() {
    if (this.isSupported()) {
      try { navigator.vibrate([60]); } catch {}
    }
  },

  /** Vibración de éxito (dos pulsos suaves) */
  success() {
    if (this.isSupported()) {
      try { navigator.vibrate([40, 60, 80]); } catch {}
    }
  },

  /** Vibración de alerta o error */
  error() {
    if (this.isSupported()) {
      try { navigator.vibrate([100, 50, 100]); } catch {}
    }
  }
};

/**
 * Servicio para Compartir Reportes (Web Share API)
 */
export const ShareService = {
  isSupported() {
    return !!navigator.share;
  },

  /**
   * Comparte el reporte usando el menú nativo del SO
   * @param {Object} report
   * @returns {Promise<boolean>}
   */
  async shareReport(report) {
    const locText = report.location 
      ? `\n📍 Ubicación GPS: https://www.google.com/maps?q=${report.location.latitude},${report.location.longitude}`
      : '';
    
    const shareData = {
      title: `[GeoField] ${report.title}`,
      text: `Incidencia: ${report.title}\nCategoría: ${report.category.toUpperCase()}\nPrioridad: ${report.priority}\nDescripción: ${report.description}${locText}\nEstado: ${report.status === 'synced' ? 'Sincronizado' : 'Pendiente'}`
    };

    if (this.isSupported()) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.warn('[ShareService] Falló Web Share, usando portapapeles:', err);
        } else {
          return false;
        }
      }
    }

    // Fallback: copiar al portapapeles
    try {
      await navigator.clipboard.writeText(`${shareData.title}\n\n${shareData.text}`);
      return 'clipboard';
    } catch {
      return false;
    }
  }
};

/**
 * Monitor de Estado de Red (Network Information API & Events)
 */
export class NetworkMonitor {
  constructor(onStatusChange) {
    this.onStatusChange = onStatusChange;
    this.init();
  }

  init() {
    window.addEventListener('online', () => this.trigger());
    window.addEventListener('offline', () => this.trigger());

    if (navigator.connection) {
      navigator.connection.addEventListener('change', () => this.trigger());
    }
  }

  getInfo() {
    const isOnline = navigator.onLine;
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    return {
      online: isOnline,
      statusText: isOnline ? 'En Línea' : 'Sin Conexión (Offline)',
      type: conn ? conn.effectiveType || conn.type || 'wifi' : (isOnline ? 'Conectado' : 'Sin red'),
      downlink: conn ? `${conn.downlink || 0} Mbps` : 'N/A',
      rtt: conn ? `${conn.rtt || 0} ms` : 'N/A',
      saveData: conn ? !!conn.saveData : false
    };
  }

  trigger() {
    if (this.onStatusChange) {
      this.onStatusChange(this.getInfo());
    }
  }
}

/**
 * Gestor del Prompt de Instalación PWA (beforeinstallprompt)
 */
export class PWAInstallManager {
  constructor(onCanInstallChange) {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.onCanInstallChange = onCanInstallChange;
    this.init();
  }

  init() {
    // Detectar si ya está corriendo como PWA standalone
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      this.isInstalled = true;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      // Prevenir el banner mini de Chrome por defecto
      e.preventDefault();
      this.deferredPrompt = e;
      console.log('[PWAInstall] Evento beforeinstallprompt capturado. Listo para instalación.');
      if (this.onCanInstallChange) {
        this.onCanInstallChange(true);
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      console.log('[PWAInstall] ¡PWA instalada exitosamente por el usuario!');
      if (this.onCanInstallChange) {
        this.onCanInstallChange(false, true);
      }
    });
  }

  canInstall() {
    return !!this.deferredPrompt && !this.isInstalled;
  }

  async promptInstall() {
    if (!this.deferredPrompt) {
      return false;
    }

    try {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      console.log('[PWAInstall] Decisión del usuario:', choiceResult.outcome);
      this.deferredPrompt = null;
      if (this.onCanInstallChange) {
        this.onCanInstallChange(false);
      }
      return choiceResult.outcome === 'accepted';
    } catch (err) {
      console.error('[PWAInstall] Error al mostrar prompt de instalación:', err);
      return false;
    }
  }
}
