# 🛰️ GeoField - Progressive Web App (PWA) de Producción

> **Aplicación Web Progresiva completa para auditorías técnicas e inspección de incidencias en terreno con persistencia 100% offline, georreferenciación GPS y captura fotográfica nativa.**

[![PWA Ready](https://img.shields.io/badge/PWA-Installable-06b6d4?style=for-the-badge&logo=pwa)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
[![Vite](https://img.shields.io/badge/Vite-8.x-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![IndexedDB](https://img.shields.io/badge/IndexedDB-Persistencia_Offline-10b981?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com)

---

## 📋 Caso de Uso en el Entorno Real

En entornos de campo (obras civiles, zonas rurales, inspección de luminarias o drenajes pluviales), los inspectores técnicos y brigadas de protección civil a menudo enfrentan **cobertura de red nula o intermitente**. 

**GeoField** resuelve esta problemática crítica mediante una arquitectura **Offline-First**:
- El inspector puede levantar reportes técnicos, tomar fotografías in situ con la cámara y registrar coordenadas GPS satelitales sin conexión a Internet.
- Todos los datos y archivos multimedia se preservan íntegros en **IndexedDB**.
- Al recuperar conexión (o mediante Background Sync), la PWA sincroniza automáticamente los reportes con la nube y emite notificaciones nativas de confirmación.

---

## 🎯 Cumplimiento de Requisitos Técnicos

### 1. Instalabilidad (Web App Manifest & Splash Screen)
- **`public/manifest.json` completo**: Metadatos obligatorios (`name`, `short_name`, `start_url`, `scope`, `display: standalone`, `orientation: portrait-primary`, `theme_color: #0f172a`, `background_color: #090d16`).
- **Paquete de iconos PNG de alta resolución**:
  - `icon-192x192.png` (Regular y Maskable)
  - `icon-512x512.png` (Regular y Maskable)
  - `apple-touch-icon.png` (180x180 px para iOS Safari)
  - `badge-72x72.png` (Para notificaciones Push en Android)
  - `icon.svg` (Formato vectorial)
- **Splash Screen nativa**: Habilitada automáticamente mediante los atributos `background_color`, `theme_color` y los iconos maskable.
- **Prompt de instalación personalizado**: Captura del evento `beforeinstallprompt` con botón visible "Instalar PWA" en el encabezado y detección del evento `appinstalled`.

### 2. Arquitectura de Interfaz y Renderizado (App Shell)
- **Patrón App Shell**: Interfaz responsiva que separa la estructura base (encabezado sticky, monitor de conectividad, barra de navegación táctil inferior en móviles y tabs en escritorio) del contenido dinámico.
- **Renderizado del lado del cliente (CSR)**: Navegación instantánea y fluida entre 4 módulos sin recargar la página:
  1. **Dashboard / Centro de Operaciones**: Métricas Bento en tiempo real, mapa interactivo global con Leaflet/OpenStreetMap y pines categorizados por severidad.
  2. **Nuevo Reporte**: Formulario técnico con visor de cámara en vivo y georreferenciación satelital.
  3. **Bitácora**: Tarjetas detalladas de incidencias con filtros de sincronización y exportación en formato **JSON** y **CSV**.
  4. **PWA Diagnostics**: Matriz de evaluación técnica de Service Worker, StorageManager API, permisos de Web APIs y estado de red.

### 3. Service Worker y Persistencia de Datos Local
- **Registro, Instalación y Activación Limpia**:
  - `install`: Pre-caching de recursos críticos del App Shell (`/`, `/index.html`, `/manifest.json`, iconos y assets). `skipWaiting()` para despliegues inmediatos.
  - `activate`: Limpieza automática de versiones de caché obsoletas mediante `caches.delete()`, seguido de `clients.claim()`.
  - `fetch`: Estrategias inteligentes:
    - **Cache-First**: Para recursos estáticos y assets del App Shell.
    - **Stale-While-Revalidate**: Para tiles de mapas y tipografías externas.
    - **Network-First**: Para peticiones dinámicas con fallback a caché en modo offline.
- **Persistencia en IndexedDB**:
  - Base de datos transaccional nativa: `GeoFieldReportsDB`.
  - Object Store `reports` con índices por `createdAt`, `status` (`'local'` vs `'synced'`), `category` y `priority`.
  - Almacena texto, metadatos GPS y fotografías optimizadas en formato DataURL.

### 4. Consumo de Web APIs Nativas del Dispositivo
La aplicación integra **6 Web APIs nativas**:
1. **MediaDevices & Canvas API (Cámara en Vivo)**: Acceso directo a `navigator.mediaDevices.getUserMedia`, alternancia entre cámara frontal y trasera, captura instantánea de fotogramas y estampado de marca de agua de auditoría.
2. **Geolocation API**: `navigator.geolocation.getCurrentPosition` con `enableHighAccuracy: true`, captura de latitud, longitud, altitud y cálculo de precisión métrica (± metros) junto a geocodificación inversa.
3. **Notification API & Push**: Notificaciones locales y vía Service Worker para confirmar almacenamiento offline y sincronización con la nube.
4. **Web Share API**: `navigator.share()` para compartir fichas técnicas de campo directamente a WhatsApp, Telegram, Gmail o redes del sistema operativo (con fallback al portapapeles).
5. **Vibration API**: `navigator.vibrate()` con respuesta háptica táctil en obturación de cámara, clics y alertas.
6. **StorageManager API**: `navigator.storage.estimate()` para visualizar la cuota de almacenamiento disponible y el porcentaje utilizado en disco.

### 5. Despliegue y Versionamiento
- **Alojamiento en Vercel**: Configurado con `vercel.json` para enrutamiento SPA y encabezados de control de caché optimizados para Service Workers (`no-cache, must-revalidate` en `sw.js`).
- **Repositorio Git**: [https://github.com/calavanda/PWA.git](https://github.com/calavanda/PWA.git) con historial de commits estructurado.

---

## 🚀 Ejecución en Entorno Local

### Prerrequisitos
- Node.js v18 o superior.
- npm v9 o superior.

### Pasos
1. Clonar el repositorio:
   ```bash
   git clone https://github.com/calavanda/PWA.git
   cd PWA
   ```
2. Instalar dependencias:
   ```bash
   npm install
   ```
3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abrir en el navegador en `http://localhost:3000`.

### Compilación para Producción
```bash
npm run build
npm run preview
```

---

## 📱 Verificación de PWA en Google Chrome DevTools

1. Abre las herramientas de desarrollo (`F12` o `Ctrl + Shift + I`).
2. Pestaña **Application**:
   - **Manifest**: Verifica el nombre, iconos y orientación.
   - **Service Workers**: Comprueba el estado `Active and running` de `/sw.js`.
   - **IndexedDB**: Inspecciona la base de datos `GeoFieldReportsDB` y el store `reports`.
   - **Storage**: Revisa la cuota de almacenamiento y botón de borrado.
3. Pestaña **Lighthouse**: Ejecuta la auditoría seleccionando la categoría **Progressive Web App** para comprobar la insignia de instalabilidad.
