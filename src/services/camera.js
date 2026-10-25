/**
 * GeoField PWA - Servicio de Cámara Nativa (MediaDevices & Canvas API)
 * Permite capturar imágenes en vivo desde el dispositivo con preview,
 * cambio de lente (delantero/trasero) y compresión optimizada para IndexedDB.
 */

export class CameraService {
  constructor() {
    this.stream = null;
    this.facingMode = 'environment'; // Cámara trasera por defecto para fotos de campo
  }

  /**
   * Verifica si el dispositivo soporta MediaDevices
   */
  isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Inicia el stream de video en un elemento <video>
   * @param {HTMLVideoElement} videoElement
   * @returns {Promise<MediaStream>}
   */
  async startStream(videoElement) {
    this.stopStream();

    const constraints = {
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = this.stream;
      await videoElement.play();
      return this.stream;
    } catch (error) {
      console.warn('[CameraService] Error con facingMode ideal, intentando modo básico:', error);
      // Fallback a cualquier cámara de video
      this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      videoElement.srcObject = this.stream;
      await videoElement.play();
      return this.stream;
    }
  }

  /**
   * Alterna entre cámara frontal y trasera
   * @param {HTMLVideoElement} videoElement
   */
  async toggleFacingMode(videoElement) {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return this.startStream(videoElement);
  }

  /**
   * Captura el frame actual del video y lo convierte a DataURL comprimido (JPEG 85%)
   * @param {HTMLVideoElement} videoElement
   * @returns {string} dataURL en base64
   */
  captureFrame(videoElement) {
    if (!videoElement || !videoElement.videoWidth) {
      throw new Error('El video aún no está listo para capturar.');
    }

    const canvas = document.createElement('canvas');
    const maxWidth = 1024;
    let width = videoElement.videoWidth;
    let height = videoElement.videoHeight;

    // Redimensionar proporcionalmente para no saturar memoria en IndexedDB
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Si la cámara es frontal, reflejar horizontalmente para vista de espejo natural
    if (this.facingMode === 'user') {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(videoElement, 0, 0, width, height);

    // Añadir marca de agua sutil de auditoría con fecha y coordenadas si están disponibles
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(10, height - 34, 280, 24);
    ctx.fillStyle = '#38bdf8';
    const stamp = `GeoField Audit: ${new Date().toLocaleString()}`;
    ctx.fillText(stamp, 18, height - 18);

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  /**
   * Detiene el flujo de la cámara para liberar recursos y batería
   */
  stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * Comprime y procesa un archivo cargado desde el input tradicional
   * @param {File} file
   * @returns {Promise<string>}
   */
  processUploadedFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxWidth = 1024;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
