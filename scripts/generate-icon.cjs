// Generates resources/icon.png: a flat "3x2 button grid" app icon, pure Node stdlib (no image deps).
const { deflateSync, crc32 } = require('zlib')
const { writeFileSync, mkdirSync } = require('fs')
const { join } = require('path')

const SIZE = 256
const BG = [79, 70, 229, 255] // indigo
const BTN = [244, 244, 255, 255] // near-white
const OUTER_RADIUS = 44

function roundedRectContains(px, py, x, y, w, h, r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

const pad = 28
const gap = 14
const cols = 3
const rows = 2
const gridW = SIZE - pad * 2
const gridH = SIZE - pad * 2
const btnW = (gridW - gap * (cols - 1)) / cols
const btnH = (gridH - gap * (rows - 1)) / rows

const buttons = []
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    buttons.push({
      x: pad + c * (btnW + gap),
      y: pad + r * (btnH + gap),
      w: btnW,
      h: btnH
    })
  }
}

const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE)
let offset = 0
for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    let pixel = [0, 0, 0, 0]
    if (roundedRectContains(x, y, 0, 0, SIZE, SIZE, OUTER_RADIUS)) {
      pixel = BG
      for (const b of buttons) {
        if (roundedRectContains(x, y, b.x, b.y, b.w, b.h, 12)) {
          pixel = BTN
          break
        }
      }
    }
    raw[offset++] = pixel[0]
    raw[offset++] = pixel[1]
    raw[offset++] = pixel[2]
    raw[offset++] = pixel[3]
  }
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput) >>> 0, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const idat = deflateSync(raw)
const png = Buffer.concat([
  signature,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0))
])

const outDir = join(__dirname, '..', 'resources')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'icon.png'), png)
console.log('wrote', join(outDir, 'icon.png'))
