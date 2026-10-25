/**
 * GeoField PWA - Servicio de Notificaciones Nativo (Notification API & Push)
 * Gestiona permisos de usuario, notificaciones locales y notificaciones mediante Service Worker.
 */

export class NotificationService {
  /**
   * Verifica compatibilidad
   */
  static isSupported() {
    return 'Notification' in window;
  }

  /**
   * Obtiene el estado actual del permiso ('default', 'granted', 'denied')
   */
  static getPermissionState() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  /**
   * Solicita permiso al usuario para enviar notificaciones
   * @returns {Promise<boolean>}
   */
  static async requestPermission() {
    if (!this.isSupported()) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.error('[NotificationService] Error al solicitar permiso:', e);
      return false;
    }
  }

  /**
   * Muestra una notificación usando el Service Worker o el constructor de Notification
   * @param {string} title
   * @param {Object} options
   */
  static async notify(title, options = {}) {
    if (!this.isSupported() || Notification.permission !== 'granted') {
      console.log('[NotificationService] Permiso no concedido o no soportado');
      return false;
    }

    const defaultOptions = {
      body: 'Notificación de GeoField',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/badge-72x72.png',
      vibrate: [120, 80, 120],
      tag: 'geofield-alert',
      renotify: true,
      ...options
    };

    // Preferir registro del Service Worker para mayor compatibilidad en móviles y background
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, defaultOptions);
          return true;
        }
      } catch (err) {
        console.warn('[NotificationService] SW showNotification falló, usando constructor:', err);
      }
    }

    // Fallback nativo
    try {
      new Notification(title, defaultOptions);
      return true;
    } catch (err) {
      console.error('[NotificationService] Error al mostrar notificación:', err);
      return false;
    }
  }

  /**
   * Dispara notificación de reporte guardado en IndexedDB
   * @param {string} titleReport
   */
  static async notifyReportSavedOffline(titleReport) {
    return this.notify('📁 Reporte Guardado en Terreno', {
      body: `"${titleReport}" guardado de forma segura en IndexedDB. Se sincronizará automáticamente al detectar conexión.`,
      tag: 'report-saved'
    });
  }

  /**
   * Dispara notificación de sincronización exitosa
   * @param {number} count
   */
  static async notifySyncSuccess(count) {
    return this.notify('☁️ Sincronización Exitosa', {
      body: `Se han subido y respaldado ${count} reporte(s) a la nube con éxito.`,
      tag: 'sync-complete'
    });
  }
}
