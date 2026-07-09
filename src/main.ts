import { PDFDocument } from 'pdf-lib'
import { PAPER_PRESETS, computeLayout } from './layout'
import { computePdfCapacity, getPaperSizePoints, imposePdf } from './pdfImposition'
import './styles.css'
import type {
  CutGuideMode,
  ImageInfo,
  LayoutSettings,
  PaperOrientation,
  PaperPresetKey,
  PdfImpositionSettings,
} from './types'

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/svg+xml',
])

const CUT_GUIDE_MODES: readonly CutGuideMode[] = [
  'none',
  'rectangle',
  'corners',
  'both',
  'dotted',
  'crop-dotted',
  'crop-solid',
]

type AppMode = 'image' | 'pdf'

let appMode: AppMode = 'image'
let imageInfo: ImageInfo | null = null
let pdfInfo: { bytes: Uint8Array; pageCount: number; name: string } | null = null

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Expected to find element: ${selector}`)
  }

  return element
}

const elements = {
  imageModeButton: query<HTMLButtonElement>('#imageModeButton'),
  pdfModeButton: query<HTMLButtonElement>('#pdfModeButton'),
  imageModePanel: query<HTMLDivElement>('#imageModePanel'),
  pdfModePanel: query<HTMLDivElement>('#pdfModePanel'),
  paper: query<HTMLSelectElement>('#paper'),
  imageUpload: query<HTMLInputElement>('#imageUpload'),
  imagePreview: query<HTMLImageElement>('#imagePreview'),
  imagePlaceholder: query<HTMLSpanElement>('#imagePlaceholder'),
  imageMeta: query<HTMLParagraphElement>('#imageMeta'),
  cardLongSideCm: query<HTMLInputElement>('#cardLongSideCm'),
  targetCardCount: query<HTMLInputElement>('#targetCardCount'),
  manualColumns: query<HTMLInputElement>('#manualColumns'),
  manualRows: query<HTMLInputElement>('#manualRows'),
  marginCm: query<HTMLInputElement>('#marginCm'),
  horizontalGapCm: query<HTMLInputElement>('#horizontalGapCm'),
  verticalGapCm: query<HTMLInputElement>('#verticalGapCm'),
  showCutGuides: query<HTMLInputElement>('#showCutGuides'),
  cutGuideMode: query<HTMLSelectElement>('#cutGuideMode'),
  printButton: query<HTMLButtonElement>('#printButton'),
  pdfUpload: query<HTMLInputElement>('#pdfUpload'),
  pdfMeta: query<HTMLParagraphElement>('#pdfMeta'),
  pdfPaper: query<HTMLSelectElement>('#pdfPaper'),
  pdfOrientation: query<HTMLSelectElement>('#pdfOrientation'),
  pdfCardWidthIn: query<HTMLInputElement>('#pdfCardWidthIn'),
  pdfCardHeightIn: query<HTMLInputElement>('#pdfCardHeightIn'),
  pdfColumns: query<HTMLInputElement>('#pdfColumns'),
  pdfRows: query<HTMLInputElement>('#pdfRows'),
  pdfMarginXIn: query<HTMLInputElement>('#pdfMarginXIn'),
  pdfMarginYIn: query<HTMLInputElement>('#pdfMarginYIn'),
  pdfGapXIn: query<HTMLInputElement>('#pdfGapXIn'),
  pdfGapYIn: query<HTMLInputElement>('#pdfGapYIn'),
  pdfCutGuideMode: query<HTMLSelectElement>('#pdfCutGuideMode'),
  generatePdfButton: query<HTMLButtonElement>('#generatePdfButton'),
  sheet: query<HTMLDivElement>('#sheet'),
  summary: query<HTMLParagraphElement>('#summary'),
  warning: query<HTMLParagraphElement>('#warning'),
  printPageSize: query<HTMLStyleElement>('#printPageSize'),
}

function isPaperPresetKey(value: string): value is PaperPresetKey {
  return Object.hasOwn(PAPER_PRESETS, value)
}

function isPaperOrientation(value: string): value is PaperOrientation {
  return value === 'portrait' || value === 'landscape'
}

function isCutGuideMode(value: string): value is CutGuideMode {
  return CUT_GUIDE_MODES.includes(value as CutGuideMode)
}

function readRequiredNumber(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value)

  if (!Number.isFinite(value)) {
    return fallback
  }

  return value
}

function readPositiveNumber(input: HTMLInputElement, fallback: number): number {
  const value = readRequiredNumber(input, fallback)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function readNonNegativeNumber(input: HTMLInputElement, fallback: number): number {
  const value = readRequiredNumber(input, fallback)
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function readPositiveInteger(input: HTMLInputElement, fallback: number): number {
  const value = Number(input.value)
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback
}

function readOptionalPositiveInteger(input: HTMLInputElement): number | undefined {
  const value = Number(input.value)

  if (!Number.isFinite(value) || value < 1) {
    return undefined
  }

  return Math.floor(value)
}

function revokePreviousImage(): void {
  if (imageInfo?.src.startsWith('blob:')) {
    URL.revokeObjectURL(imageInfo.src)
  }
}

function readImageFile(file: File): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      reject(new Error('Choose a PNG, JPG, JPEG, WEBP, or SVG image.'))
      return
    }

    const src = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      resolve({
        src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        name: file.name,
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(src)
      reject(new Error('The selected image could not be loaded.'))
    }

    img.src = src
  })
}

async function readPdfFile(file: File): Promise<{ bytes: Uint8Array; pageCount: number; name: string }> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Choose a PDF file.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await PDFDocument.load(bytes)
  return {
    bytes,
    pageCount: pdf.getPageCount(),
    name: file.name,
  }
}

function getSettingsFromControls(): LayoutSettings {
  const paperValue = elements.paper.value
  const guideModeValue = elements.cutGuideMode.value

  if (!isPaperPresetKey(paperValue)) {
    throw new Error(`Unsupported paper preset: ${paperValue}`)
  }

  if (!isCutGuideMode(guideModeValue)) {
    throw new Error(`Unsupported cut guide mode: ${guideModeValue}`)
  }

  return {
    paper: paperValue,
    marginCm: readRequiredNumber(elements.marginCm, 0.5),
    horizontalGapCm: readRequiredNumber(elements.horizontalGapCm, 0.5),
    verticalGapCm: readRequiredNumber(elements.verticalGapCm, 1),
    cardLongSideCm: readRequiredNumber(elements.cardLongSideCm, 6.5),
    targetCardCount: readOptionalPositiveInteger(elements.targetCardCount),
    manualColumns: readOptionalPositiveInteger(elements.manualColumns),
    manualRows: readOptionalPositiveInteger(elements.manualRows),
    cutGuideMode: elements.showCutGuides.checked ? guideModeValue : 'none',
  }
}

function getPdfSettingsFromControls(): PdfImpositionSettings {
  const paperValue = elements.pdfPaper.value
  const orientationValue = elements.pdfOrientation.value
  const guideModeValue = elements.pdfCutGuideMode.value

  if (!isPaperPresetKey(paperValue)) {
    throw new Error(`Unsupported paper preset: ${paperValue}`)
  }
  if (!isPaperOrientation(orientationValue)) {
    throw new Error(`Unsupported paper orientation: ${orientationValue}`)
  }
  if (!isCutGuideMode(guideModeValue)) {
    throw new Error(`Unsupported cut guide mode: ${guideModeValue}`)
  }

  return {
    paper: paperValue,
    orientation: orientationValue,
    cardWidthIn: readPositiveNumber(elements.pdfCardWidthIn, 3.5),
    cardHeightIn: readPositiveNumber(elements.pdfCardHeightIn, 4),
    columns: readPositiveInteger(elements.pdfColumns, 3),
    rows: readPositiveInteger(elements.pdfRows, 2),
    marginXIn: readNonNegativeNumber(elements.pdfMarginXIn, 0.25),
    marginYIn: readNonNegativeNumber(elements.pdfMarginYIn, 0.25),
    horizontalGapIn: readNonNegativeNumber(elements.pdfGapXIn, 0),
    verticalGapIn: readNonNegativeNumber(elements.pdfGapYIn, 0),
    cutGuideMode: guideModeValue,
  }
}

function syncPrintPageSize(paper: PaperPresetKey): void {
  const pageSize = paper === 'a4' ? 'A4' : 'letter'
  elements.printPageSize.textContent = `@page { size: ${pageSize} portrait; margin: 0; }`
}

function setWarning(message: string | null): void {
  elements.warning.hidden = message === null
  elements.warning.textContent = message ?? ''
}

function renderEmptySheet(settings: LayoutSettings): void {
  const paper = PAPER_PRESETS[settings.paper]

  elements.sheet.className = 'sheet is-empty'
  elements.sheet.innerHTML =
    '<p class="empty-state">Upload an image to preview the printable sheet.</p>'
  elements.sheet.style.setProperty('--page-width-cm', `${paper.widthCm}cm`)
  elements.sheet.style.setProperty('--page-height-cm', `${paper.heightCm}cm`)
  elements.sheet.style.setProperty('--margin-cm', `${settings.marginCm}cm`)
  elements.summary.textContent = 'Upload an image to build a sheet.'
  elements.printButton.disabled = true
  setWarning(null)
}

function renderImageMode(): void {
  const settings = getSettingsFromControls()
  syncPrintPageSize(settings.paper)

  if (!imageInfo) {
    renderEmptySheet(settings)
    return
  }

  const layout = computeLayout(imageInfo, settings)
  const paper = PAPER_PRESETS[settings.paper]
  const fragment = document.createDocumentFragment()

  elements.sheet.className = 'sheet'
  elements.sheet.innerHTML = ''
  elements.sheet.style.setProperty('--page-width-cm', `${layout.pageWidthCm}cm`)
  elements.sheet.style.setProperty('--page-height-cm', `${layout.pageHeightCm}cm`)
  elements.sheet.style.setProperty('--card-width-cm', `${layout.cardWidthCm}cm`)
  elements.sheet.style.setProperty('--card-height-cm', `${layout.cardHeightCm}cm`)
  elements.sheet.style.setProperty('--columns', String(layout.columns))
  elements.sheet.style.setProperty('--margin-cm', `${settings.marginCm}cm`)
  elements.sheet.style.setProperty('--h-gap-cm', `${settings.horizontalGapCm}cm`)
  elements.sheet.style.setProperty('--v-gap-cm', `${settings.verticalGapCm}cm`)

  for (let i = 0; i < layout.renderedCount; i += 1) {
    const card = document.createElement('div')
    const img = document.createElement('img')

    card.className = `card guide-${settings.cutGuideMode}`
    img.src = imageInfo.src
    img.alt = `${imageInfo.name} card ${i + 1}`

    card.append(img)
    fragment.append(card)
  }

  elements.sheet.append(fragment)
  elements.printButton.disabled = false
  elements.summary.textContent =
    `${layout.columns} x ${layout.rows} = ${layout.capacity} max. ` +
    `Rendering ${layout.renderedCount} card(s). ` +
    `Card size: ${layout.cardWidthCm.toFixed(2)} x ${layout.cardHeightCm.toFixed(
      2,
    )} cm on ${paper.label}.`

  const warnings: string[] = []

  if (settings.targetCardCount && settings.targetCardCount > layout.capacity) {
    warnings.push(`Only ${layout.capacity} cards fit with the current settings.`)
  }

  if (!layout.fitsPage) {
    warnings.push(
      `The selected grid uses ${layout.usedWidthCm.toFixed(
        2,
      )} x ${layout.usedHeightCm.toFixed(2)} cm and exceeds the page size.`,
    )
  }

  setWarning(warnings.length > 0 ? warnings.join(' ') : null)
}

function renderPdfMode(): void {
  const settings = getPdfSettingsFromControls()
  const layout = computePdfCapacity(settings)
  const pageSize = getPaperSizePoints(settings.paper, settings.orientation)
  const fragment = document.createDocumentFragment()
  const renderedCount = Math.min(pdfInfo?.pageCount ?? layout.capacity, layout.capacity)
  const pageWidthIn = pageSize.width / 72
  const pageHeightIn = pageSize.height / 72

  elements.sheet.className = 'sheet pdf-sheet'
  elements.sheet.innerHTML = ''
  elements.sheet.style.setProperty('--page-width-cm', `${pageWidthIn * 2.54}cm`)
  elements.sheet.style.setProperty('--page-height-cm', `${pageHeightIn * 2.54}cm`)
  elements.sheet.style.setProperty('--card-width-cm', `${settings.cardWidthIn * 2.54}cm`)
  elements.sheet.style.setProperty('--card-height-cm', `${settings.cardHeightIn * 2.54}cm`)
  elements.sheet.style.setProperty('--columns', String(settings.columns))
  elements.sheet.style.setProperty('--margin-cm', `${settings.marginYIn * 2.54}cm ${settings.marginXIn * 2.54}cm`)
  elements.sheet.style.setProperty('--h-gap-cm', `${settings.horizontalGapIn * 2.54}cm`)
  elements.sheet.style.setProperty('--v-gap-cm', `${settings.verticalGapIn * 2.54}cm`)

  for (let i = 0; i < renderedCount; i += 1) {
    const card = document.createElement('div')
    card.className = `card pdf-card guide-${settings.cutGuideMode}`
    card.textContent = `PDF page ${i + 1}`
    fragment.append(card)
  }

  elements.sheet.append(fragment)
  elements.generatePdfButton.disabled = !pdfInfo || !layout.fitsPage
  elements.printButton.disabled = true

  const sheets = pdfInfo ? Math.ceil(pdfInfo.pageCount / layout.capacity) : 0
  elements.summary.textContent = pdfInfo
    ? `${settings.columns} x ${settings.rows} = ${layout.capacity} pages per sheet. ` +
      `${pdfInfo.pageCount} PDF page(s) will generate ${sheets} sheet(s).`
    : 'Upload a PDF to generate an imposed PDF.'

  const warnings: string[] = []
  if (!layout.fitsPage) {
    warnings.push('The selected PDF layout exceeds the page size.')
  }
  if (!pdfInfo) {
    warnings.push('No PDF selected yet.')
  }
  setWarning(warnings.length > 0 ? warnings.join(' ') : null)
}

function render(): void {
  if (appMode === 'image') {
    renderImageMode()
  } else {
    renderPdfMode()
  }
}

function setMode(nextMode: AppMode): void {
  appMode = nextMode
  elements.imageModePanel.hidden = nextMode !== 'image'
  elements.pdfModePanel.hidden = nextMode !== 'pdf'
  elements.imageModeButton.classList.toggle('is-active', nextMode === 'image')
  elements.pdfModeButton.classList.toggle('is-active', nextMode === 'pdf')
  render()
}

async function handleImageUpload(): Promise<void> {
  const file = elements.imageUpload.files?.[0]

  if (!file) {
    return
  }

  try {
    const nextImage = await readImageFile(file)
    revokePreviousImage()
    imageInfo = nextImage
    elements.imagePreview.src = nextImage.src
    elements.imagePreview.hidden = false
    elements.imagePlaceholder.hidden = true
    elements.imageMeta.textContent = `${nextImage.name}: ${nextImage.naturalWidth} x ${nextImage.naturalHeight}px`
    render()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the image.'
    setWarning(message)
  }
}

async function handlePdfUpload(): Promise<void> {
  const file = elements.pdfUpload.files?.[0]
  if (!file) return

  try {
    pdfInfo = await readPdfFile(file)
    elements.pdfMeta.textContent = `${pdfInfo.name}: ${pdfInfo.pageCount} page(s)`
    render()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the PDF.'
    setWarning(message)
  }
}

async function generatePdf(): Promise<void> {
  if (!pdfInfo) return

  try {
    elements.generatePdfButton.disabled = true
    elements.generatePdfButton.textContent = 'Generating...'
    const bytes = await imposePdf(pdfInfo.bytes, getPdfSettingsFromControls())
    const pdfBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(pdfBuffer).set(bytes)
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const baseName = pdfInfo.name.replace(/\.pdf$/i, '')
    anchor.href = url
    anchor.download = `${baseName}-imposed.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not generate the PDF.'
    setWarning(message)
  } finally {
    elements.generatePdfButton.textContent = 'Generate imposed PDF'
    render()
  }
}

function main(): void {
  const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '.controls input, .controls select',
  )

  for (const control of controls) {
    control.addEventListener('input', render)
    control.addEventListener('change', render)
  }

  elements.imageModeButton.addEventListener('click', () => setMode('image'))
  elements.pdfModeButton.addEventListener('click', () => setMode('pdf'))

  elements.imageUpload.addEventListener('change', () => {
    void handleImageUpload()
  })

  elements.pdfUpload.addEventListener('change', () => {
    void handlePdfUpload()
  })

  elements.printButton.addEventListener('click', () => {
    window.print()
  })

  elements.generatePdfButton.addEventListener('click', () => {
    void generatePdf()
  })

  render()
}

main()
