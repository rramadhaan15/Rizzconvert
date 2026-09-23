import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import { saveAs } from 'file-saver'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export const formatMap = {
  heic: ['jpg', 'png'], heif: ['jpg', 'png'],
  jpg: ['png', 'webp', 'pdf'], jpeg: ['png', 'webp', 'pdf'],
  png: ['jpg', 'webp', 'pdf'], webp: ['jpg', 'png', 'pdf'],
  pdf: ['jpg', 'png'],
}

export function extensionOf(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  return ext || ''
}

export function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, power)
  return `${value >= 10 || power === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[power]}`
}

function stem(name) { return name.replace(/\.[^/.]+$/, '') }

async function normalizeSource(file) {
  const ext = extensionOf(file)
  if (ext !== 'heic' && ext !== 'heif') return file
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({ blob: file, toType: 'image/png' })
  return Array.isArray(converted) ? converted[0] : converted
}

async function loadImage(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()
    return image
  } finally {
    // URL is revoked by the caller after drawing via an attached marker.
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Browser gagal membuat file output.')),
    type,
    quality,
  ))
}

async function imageToRaster(file, target, quality) {
  const source = await normalizeSource(file)
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d', { alpha: target === 'png' })
  if (target === 'jpg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(image, 0, 0)
  URL.revokeObjectURL(image.src)
  const mime = target === 'jpg' ? 'image/jpeg' : `image/${target}`
  const blob = await canvasBlob(canvas, mime, quality / 100)
  return [{ blob, name: `${stem(file.name)}.${target}` }]
}

async function imageToPdf(file, quality) {
  const source = await normalizeSource(file)
  const image = await loadImage(source)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0)
  URL.revokeObjectURL(image.src)
  const orientation = canvas.width >= canvas.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height], hotfixes: ['px_scaling'] })
  pdf.addImage(canvas.toDataURL('image/jpeg', quality / 100), 'JPEG', 0, 0, canvas.width, canvas.height, undefined, 'FAST')
  return [{ blob: pdf.output('blob'), name: `${stem(file.name)}.pdf` }]
}

async function pdfToImages(file, target, quality, onProgress) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const results = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d', { alpha: target === 'png' })
    if (target === 'jpg') {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
    await page.render({ canvasContext: ctx, viewport }).promise
    const mime = target === 'jpg' ? 'image/jpeg' : 'image/png'
    const blob = await canvasBlob(canvas, mime, quality / 100)
    results.push({ blob, name: `${stem(file.name)}-halaman-${pageNumber}.${target}` })
    onProgress?.(Math.round((pageNumber / pdf.numPages) * 92))
  }
  pdf.destroy()
  return results
}

export async function convertFile(file, target, quality, onProgress) {
  onProgress?.(8)
  const source = extensionOf(file)
  if (!formatMap[source]?.includes(target)) throw new Error(`Konversi ${source.toUpperCase()} ke ${target.toUpperCase()} belum didukung.`)
  if (source === 'pdf') return pdfToImages(file, target, quality, onProgress)
  onProgress?.(38)
  const result = target === 'pdf' ? await imageToPdf(file, quality) : await imageToRaster(file, target, quality)
  onProgress?.(92)
  return result
}

export async function createPreview(file) {
  const ext = extensionOf(file)
  if (ext === 'heic' || ext === 'heif') {
    const blob = await normalizeSource(file)
    return URL.createObjectURL(blob)
  }
  if (ext === 'pdf') {
    const data = new Uint8Array(await file.arrayBuffer())
    const pdf = await pdfjsLib.getDocument({ data }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.65 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width; canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    const url = canvas.toDataURL('image/jpeg', .75)
    pdf.destroy()
    return url
  }
  return URL.createObjectURL(file)
}

export function downloadBlob(blob, name) { saveAs(blob, name) }

export async function downloadZip(items) {
  const zip = new JSZip()
  const used = new Set()
  items.forEach(({ blob, name }) => {
    let safeName = name; let index = 2
    while (used.has(safeName)) safeName = name.replace(/(\.[^.]+)$/, `-${index++}$1`)
    used.add(safeName); zip.file(safeName, blob)
  })
  const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  saveAs(archive, 'rizzconvert-hasil.zip')
}
