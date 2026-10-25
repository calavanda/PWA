import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outputDir = path.resolve(__dirname, '../public/icons');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// SVG Base con diseño moderno estilo pin de geo-localización con ondas de pulso y check de campo
const svgIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#0b1120"/>
      <stop offset="100%" stop-color="#030712"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#06b6d4"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="glowGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Contenedor del fondo con bordes redondeados -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  
  <!-- Borde exterior sutil iluminado -->
  <rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="url(#accentGrad)" stroke-width="3" stroke-opacity="0.35"/>
  
  <!-- Anillos concéntricos de radar de fondo -->
  <circle cx="256" cy="230" r="160" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6,8" stroke-opacity="0.2"/>
  <circle cx="256" cy="230" r="110" fill="none" stroke="#06b6d4" stroke-width="2" stroke-opacity="0.25"/>

  <!-- Destello de escaneo de radar -->
  <path d="M 256 230 L 370 170 A 130 130 0 0 1 385 240 Z" fill="url(#glowGrad)"/>

  <!-- Sombra del pin principal -->
  <ellipse cx="256" cy="420" rx="64" ry="16" fill="#000000" opacity="0.6" filter="blur(6px)"/>
  
  <!-- Cuerpo del pin de geolocalización -->
  <g filter="url(#glow)">
    <path d="M 256 90 
             C 178 90, 116 152, 116 230 
             C 116 320, 230 404, 256 422 
             C 282 404, 396 320, 396 230 
             C 396 152, 334 90, 256 90 Z" 
          fill="url(#accentGrad)"/>
  </g>

  <!-- Núcleo oscuro interior del pin -->
  <circle cx="256" cy="226" r="66" fill="#0f172a"/>
  
  <!-- Símbolo de verificación / auditor de campo iluminado -->
  <path d="M 226 226 L 246 246 L 290 198" 
        fill="none" 
        stroke="#38bdf8" 
        stroke-width="14" 
        stroke-linecap="round" 
        stroke-linejoin="round"/>
        
  <!-- Destello de satélite superior -->
  <circle cx="256" cy="50" r="8" fill="#38bdf8"/>
  <circle cx="256" cy="50" r="16" fill="none" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.5"/>
</svg>
`;

// Guardar SVG principal en public/icons/icon.svg y public/favicon.svg
fs.writeFileSync(path.resolve(__dirname, '../public/favicon.svg'), svgIcon.trim());
fs.writeFileSync(path.resolve(outputDir, 'icon.svg'), svgIcon.trim());

const sizes = [
  { name: 'icon-192x192.png', size: 192, maskable: false },
  { name: 'icon-512x512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192x192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512x512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon-32x32.png', size: 32, maskable: false },
  { name: 'badge-72x72.png', size: 72, maskable: false }
];

async function generate() {
  const svgBuffer = Buffer.from(svgIcon);

  for (const item of sizes) {
    const dest = path.resolve(outputDir, item.name);
    if (item.maskable) {
      // Para maskable añadimos un margen seguro (safe area de 10%)
      const safeSize = Math.round(item.size * 0.8);
      const padding = Math.round((item.size - safeSize) / 2);
      
      const inner = await sharp(svgBuffer)
        .resize(safeSize, safeSize)
        .toBuffer();

      await sharp({
        create: {
          width: item.size,
          height: item.size,
          channels: 4,
          background: { r: 15, g: 23, b: 42, alpha: 1 }
        }
      })
      .composite([{ input: inner, top: padding, left: padding }])
      .png()
      .toFile(dest);
    } else {
      await sharp(svgBuffer)
        .resize(item.size, item.size)
        .png()
        .toFile(dest);
    }
    console.log(`Generated: ${item.name} (${item.size}x${item.size})`);
  }
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
