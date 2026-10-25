/**
 * GeoField PWA - Servicio de Geolocalización Nativa (Geolocation API)
 * Obtiene coordenadas de precisión métrica (lat, lon, altitud, precisión)
 * y geocodificación inversa con soporte offline.
 */

export class GeolocationService {
  /**
   * Verifica compatibilidad del navegador
   */
  isSupported() {
    return 'geolocation' in navigator;
  }

  /**
   * Obtiene la posición GPS actual con alta precisión
   * @param {Object} customOptions
   * @returns {Promise<{latitude: number, longitude: number, accuracy: number, timestamp: string}>}
   */
  async getCurrentPosition(customOptions = {}) {
    if (!this.isSupported()) {
      throw new Error('La geolocalización no es compatible con este navegador.');
    }

    const defaultOptions = {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
      ...customOptions
    };

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
          resolve({
            latitude,
            longitude,
            accuracy: Math.round(accuracy * 10) / 10, // Precisión en metros
            altitude: altitude ? Math.round(altitude) : null,
            heading,
            speed,
            timestamp: new Date(position.timestamp).toISOString()
          });
        },
        (error) => {
          let message = 'Error desconocido al obtener ubicación.';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Permiso de ubicación denegado por el usuario o navegador.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'La señal de GPS no está disponible en este momento.';
              break;
            case error.TIMEOUT:
              message = 'Se agotó el tiempo de espera al buscar satélites GPS.';
              break;
          }
          reject(new Error(message));
        },
        defaultOptions
      );
    });
  }

  /**
   * Intenta obtener el nombre de la calle/zona mediante Reverse Geocoding.
   * Si está offline o falla la red, devuelve una etiqueta legible con las coordenadas.
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<string>}
   */
  async getAddressLabel(lat, lon) {
    if (!navigator.onLine) {
      return `Coordenadas: ${lat.toFixed(5)}°, ${lon.toFixed(5)}° (Offline)`;
    }

    try {
      // Usar endpoint abierto de OpenStreetMap Nominatim con timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'es' }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data && data.display_name) {
          const parts = data.display_name.split(', ');
          // Extraer las primeras 3 partes más relevantes (calle, colonia, ciudad)
          return parts.slice(0, 3).join(', ');
        }
      }
    } catch {
      // En caso de fallo o timeout de red
    }

    return `Ubicación: ${lat.toFixed(5)}°, ${lon.toFixed(5)}°`;
  }
}
