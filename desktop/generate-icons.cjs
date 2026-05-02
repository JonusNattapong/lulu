/**
 * Generate Lulu icon for desktop app.
 * Creates a simple 256x256 purple icon with "L" letter.
 * Run: node generate-icons.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const size = 256;
const outDir = path.join(__dirname);

// Simple PNG: RGBA pixel buffer
function createPNG(width, height, rgba) {
  // Minimal PNG creation without external deps
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    for (const byte of data) {
      crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBytes = Buffer.from(type);
    const crcData = Buffer.concat([typeBytes, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, typeBytes, data, crc]);
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const srcOffset = (y * width + x) * 4;
      rawData[pixelOffset] = rgba[srcOffset];
      rawData[pixelOffset + 1] = rgba[srcOffset + 1];
      rawData[pixelOffset + 2] = rgba[srcOffset + 2];
      rawData[pixelOffset + 3] = rgba[srcOffset + 3];
    }
  }

  // Compress with zlib (use built-in zlib)
  const zlib = require("node:zlib");
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // IDAT chunk
  const idat = chunk("IDAT", compressed);

  // IEND chunk
  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, chunk("IHDR", ihdr), idat, iend]);
}

// Draw the icon
const rgba = Buffer.alloc(size * size * 4);
const centerX = size / 2;
const centerY = size / 2;
const radius = size * 0.42;

// Purple gradient colors
const color1 = { r: 168, g: 85, b: 247 }; // #A855F7
const color2 = { r: 139, g: 92, b: 246 }; // #8B5CF6

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (y * size + x) * 4;
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= radius) {
      // Inside circle — gradient based on y position
      const t = y / size;
      const r = Math.round(color1.r + (color2.r - color1.r) * t);
      const g = Math.round(color1.g + (color2.g - color1.g) * t);
      const b = Math.round(color1.b + (color2.b - color1.b) * t);

      // Anti-alias edge
      const alpha = dist > radius - 1 ? Math.max(0, 255 - (dist - radius + 1) * 255) : 255;

      // Draw "L" letter shape (white)
      const letterLeft = size * 0.28;
      const letterRight = size * 0.72;
      const letterTop = size * 0.25;
      const letterMid = size * 0.58;
      const letterBottom = size * 0.75;
      const barWidth = size * 0.14;

      const inVertical = x >= letterLeft && x <= letterLeft + barWidth && y >= letterTop && y <= letterBottom;
      const inHorizontal = x >= letterLeft && x <= letterRight && y >= letterMid && y <= letterMid + barWidth;

      if (inVertical || inHorizontal) {
        // White letter
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = alpha;
      } else {
        // Purple background
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = alpha;
      }
    } else {
      // Transparent
      rgba[idx] = 0;
      rgba[idx + 1] = 0;
      rgba[idx + 2] = 0;
      rgba[idx + 3] = 0;
    }
  }
}

// Generate PNG
const png = createPNG(size, size, rgba);
fs.writeFileSync(path.join(outDir, "icon.png"), png);
console.log("[icons] Created icon.png");

// For Windows ICO, just use the PNG (electron-builder will convert)
fs.writeFileSync(path.join(outDir, "icon.ico"), png);
console.log("[icons] Created icon.ico (PNG format — electron-builder will handle conversion)");
