import { PDFDocument } from 'pdf-lib'
import { PAPER_PRESETS, computeLayout, getPaperDimensionsCm } from './layout'
import { computePdfCapacity, getPaperSizePoints, imposePdf } from './pdfImposition'
import { resizePdfPages } from './pdfResize'
import './styles.css'
import type {
  CutGuideMode,
  ImageInfo,
  LayoutSettings,
  PaperOrientation,
  PaperPresetKey,
  PdfImpositionSettings,
  PdfResizeMode,
  PdfResizeSettings,
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

const PDF_RESIZE_MODES: readonly PdfResizeMode[] = [
  'stretch',
  'fit',
  'fill',
  'center',
]

const REDUCED_MOTION_QUERY = window.matchMedia('(prefers-reduced-motion: reduce)')
const KONAMI_KEYS = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const

const SCROLLBAR_COLOR_STOPS = [
  { progress: 0, color: [33, 24, 20] },
  { progress: 0.25, color: [33, 24, 20] },
  { progress: 0.26, color: [0, 111, 128] },
  { progress: 0.5, color: [0, 111, 128] },
  { progress: 0.51, color: [157, 23, 77] },
  { progress: 0.75, color: [157, 23, 77] },
  { progress: 0.76, color: [122, 82, 0] },
  { progress: 1, color: [122, 82, 0] },
] as const

type AppMode = 'image' | 'pdf' | 'resize'

let appMode: AppMode = 'image'
let imageInfo: ImageInfo | null = null
let pdfInfo: { bytes: Uint8Array; pageCount: number; name: string } | null = null
let resizePdfInfo: { bytes: Uint8Array; pageCount: number; name: string } | null = null
let scrollCueFrame: number | undefined
let scrollbarFrame: number | undefined
let pointerFrame: number | undefined
let pendingPointer: { x: number; y: number } | null = null
let easterProgress = 0
let easterTimeout: number | undefined
let registrationTapCount = 0
let registrationTapTimeout: number | undefined

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
  resizeModeButton: query<HTMLButtonElement>('#resizeModeButton'),
  controls: query<HTMLElement>('.controls'),
  imageModePanel: query<HTMLDivElement>('#imageModePanel'),
  pdfModePanel: query<HTMLDivElement>('#pdfModePanel'),
  resizeModePanel: query<HTMLDivElement>('#resizeModePanel'),
  paper: query<HTMLSelectElement>('#paper'),
  paperOrientation: query<HTMLSelectElement>('#paperOrientation'),
  imageUpload: query<HTMLInputElement>('#imageUpload'),
  imagePreview: query<HTMLImageElement>('#imagePreview'),
  imagePlaceholder: query<HTMLSpanElement>('#imagePlaceholder'),
  imageMeta: query<HTMLParagraphElement>('#imageMeta'),
  cardLongSideCm: query<HTMLInputElement>('#cardLongSideCm'),
  targetCardCount: query<HTMLInputElement>('#targetCardCount'),
  manualColumns: query<HTMLInputElement>('#manualColumns'),
  manualRows: query<HTMLInputElement>('#manualRows'),
  marginPreset: query<HTMLSelectElement>('#marginPreset'),
  marginTopCm: query<HTMLInputElement>('#marginTopCm'),
  marginRightCm: query<HTMLInputElement>('#marginRightCm'),
  marginBottomCm: query<HTMLInputElement>('#marginBottomCm'),
  marginLeftCm: query<HTMLInputElement>('#marginLeftCm'),
  horizontalGapCm: query<HTMLInputElement>('#horizontalGapCm'),
  verticalGapCm: query<HTMLInputElement>('#verticalGapCm'),
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
  pdfMarginPreset: query<HTMLSelectElement>('#pdfMarginPreset'),
  pdfMarginTopIn: query<HTMLInputElement>('#pdfMarginTopIn'),
  pdfMarginRightIn: query<HTMLInputElement>('#pdfMarginRightIn'),
  pdfMarginBottomIn: query<HTMLInputElement>('#pdfMarginBottomIn'),
  pdfMarginLeftIn: query<HTMLInputElement>('#pdfMarginLeftIn'),
  pdfGapXIn: query<HTMLInputElement>('#pdfGapXIn'),
  pdfGapYIn: query<HTMLInputElement>('#pdfGapYIn'),
  pdfCutGuideMode: query<HTMLSelectElement>('#pdfCutGuideMode'),
  generatePdfButton: query<HTMLButtonElement>('#generatePdfButton'),
  resizePdfUpload: query<HTMLInputElement>('#resizePdfUpload'),
  resizePdfMeta: query<HTMLParagraphElement>('#resizePdfMeta'),
  resizePaper: query<HTMLSelectElement>('#resizePaper'),
  resizeOrientation: query<HTMLSelectElement>('#resizeOrientation'),
  resizeMode: query<HTMLSelectElement>('#resizeMode'),
  generateResizedPdfButton: query<HTMLButtonElement>('#generateResizedPdfButton'),
  sheet: query<HTMLDivElement>('#sheet'),
  summary: query<HTMLParagraphElement>('#summary'),
  warning: query<HTMLParagraphElement>('#warning'),
  previewArea: query<HTMLElement>('.preview-area'),
  previewScroll: query<HTMLDivElement>('#previewScroll'),
  scrollCue: query<HTMLDivElement>('#scrollCue'),
  easterEggOverlay: query<HTMLDivElement>('#easterEggOverlay'),
  easterEggHint: query<HTMLSpanElement>('#easterEggHint'),
  registrationWheel: query<HTMLElement>('#registrationWheel'),
  printPageSize: query<HTMLStyleElement>('#printPageSize'),
}

function prefersReducedMotion(): boolean {
  return REDUCED_MOTION_QUERY.matches
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

function isPdfResizeMode(value: string): value is PdfResizeMode {
  return PDF_RESIZE_MODES.includes(value as PdfResizeMode)
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

function formatCssMargins(values: { top: number; right: number; bottom: number; left: number }, unit: string): string {
  return `${values.top}${unit} ${values.right}${unit} ${values.bottom}${unit} ${values.left}${unit}`
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
  const orientationValue = elements.paperOrientation.value
  const guideModeValue = elements.cutGuideMode.value

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
    marginsCm: {
      top: readNonNegativeNumber(elements.marginTopCm, 0.5),
      right: readNonNegativeNumber(elements.marginRightCm, 0.5),
      bottom: readNonNegativeNumber(elements.marginBottomCm, 0.5),
      left: readNonNegativeNumber(elements.marginLeftCm, 0.5),
    },
    horizontalGapCm: readRequiredNumber(elements.horizontalGapCm, 0.5),
    verticalGapCm: readRequiredNumber(elements.verticalGapCm, 1),
    cardLongSideCm: readRequiredNumber(elements.cardLongSideCm, 6.5),
    targetCardCount: readOptionalPositiveInteger(elements.targetCardCount),
    manualColumns: readOptionalPositiveInteger(elements.manualColumns),
    manualRows: readOptionalPositiveInteger(elements.manualRows),
    cutGuideMode: guideModeValue,
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
    marginsIn: {
      top: readNonNegativeNumber(elements.pdfMarginTopIn, 0.25),
      right: readNonNegativeNumber(elements.pdfMarginRightIn, 0.25),
      bottom: readNonNegativeNumber(elements.pdfMarginBottomIn, 0.25),
      left: readNonNegativeNumber(elements.pdfMarginLeftIn, 0.25),
    },
    horizontalGapIn: readNonNegativeNumber(elements.pdfGapXIn, 0),
    verticalGapIn: readNonNegativeNumber(elements.pdfGapYIn, 0),
    cutGuideMode: guideModeValue,
  }
}

function getPdfResizeSettingsFromControls(): PdfResizeSettings {
  const paperValue = elements.resizePaper.value
  const orientationValue = elements.resizeOrientation.value
  const modeValue = elements.resizeMode.value

  if (!isPaperPresetKey(paperValue)) {
    throw new Error(`Unsupported resize paper preset: ${paperValue}`)
  }
  if (!isPaperOrientation(orientationValue)) {
    throw new Error(`Unsupported resize paper orientation: ${orientationValue}`)
  }
  if (!isPdfResizeMode(modeValue)) {
    throw new Error(`Unsupported resize mode: ${modeValue}`)
  }

  return {
    paper: paperValue,
    orientation: orientationValue,
    mode: modeValue,
  }
}

function syncPrintPageSize(paper: PaperPresetKey, orientation: PaperOrientation): void {
  const pageSize = paper === 'a4' ? 'A4' : 'letter'
  elements.printPageSize.textContent = `@page { size: ${pageSize} ${orientation}; margin: 0; }`
}

function setWarning(message: string | null): void {
  elements.warning.hidden = message === null
  elements.warning.textContent = message ?? ''
}

function renderEmptySheet(settings: LayoutSettings): void {
  const paper = getPaperDimensionsCm(settings.paper, settings.orientation)

  elements.sheet.className = 'sheet is-empty'
  elements.sheet.innerHTML =
    '<p class="empty-state">Upload an image to preview the printable sheet.</p>'
  elements.sheet.style.setProperty('--page-width-cm', `${paper.widthCm}cm`)
  elements.sheet.style.setProperty('--page-height-cm', `${paper.heightCm}cm`)
  elements.sheet.style.setProperty('--margin-cm', formatCssMargins(settings.marginsCm, 'cm'))
  elements.summary.textContent = 'Upload an image to build a sheet.'
  elements.printButton.disabled = true
  setWarning(null)
}

function renderImageMode(): void {
  const settings = getSettingsFromControls()
  syncPrintPageSize(settings.paper, settings.orientation)

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
  elements.sheet.style.setProperty('--margin-cm', formatCssMargins(settings.marginsCm, 'cm'))
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
  elements.printButton.disabled = !layout.fitsPage
  elements.summary.textContent =
    `${layout.columns} x ${layout.rows} = ${layout.capacity} max. ` +
    `Rendering ${layout.renderedCount} card(s). ` +
    `Card size: ${layout.cardWidthCm.toFixed(2)} x ${layout.cardHeightCm.toFixed(
      2,
    )} cm on ${paper.label} ${settings.orientation}.`

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
  elements.sheet.style.setProperty('--margin-cm', formatCssMargins({
    top: settings.marginsIn.top * 2.54,
    right: settings.marginsIn.right * 2.54,
    bottom: settings.marginsIn.bottom * 2.54,
    left: settings.marginsIn.left * 2.54,
  }, 'cm'))
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

function renderResizeMode(): void {
  const settings = getPdfResizeSettingsFromControls()
  const pageSize = getPaperSizePoints(settings.paper, settings.orientation)
  const pageWidthIn = pageSize.width / 72
  const pageHeightIn = pageSize.height / 72
  const paper = PAPER_PRESETS[settings.paper]

  elements.sheet.className = 'sheet pdf-sheet'
  elements.sheet.innerHTML = ''
  elements.sheet.style.setProperty('--page-width-cm', `${pageWidthIn * 2.54}cm`)
  elements.sheet.style.setProperty('--page-height-cm', `${pageHeightIn * 2.54}cm`)
  elements.sheet.style.setProperty('--card-width-cm', `${pageWidthIn * 2.54}cm`)
  elements.sheet.style.setProperty('--card-height-cm', `${pageHeightIn * 2.54}cm`)
  elements.sheet.style.setProperty('--columns', '1')
  elements.sheet.style.setProperty('--margin-cm', '0cm')
  elements.sheet.style.setProperty('--h-gap-cm', '0cm')
  elements.sheet.style.setProperty('--v-gap-cm', '0cm')

  const card = document.createElement('div')
  card.className = 'card pdf-card'
  card.textContent = resizePdfInfo ? 'Resized PDF page' : 'Target page preview'
  elements.sheet.append(card)

  elements.generatePdfButton.disabled = true
  elements.generateResizedPdfButton.disabled = !resizePdfInfo
  elements.printButton.disabled = true

  elements.summary.textContent = resizePdfInfo
    ? `${resizePdfInfo.pageCount} page(s) will resize to ${paper.label} ${settings.orientation} using ${settings.mode} mode.`
    : 'Upload a PDF to resize every page.'

  setWarning(resizePdfInfo ? null : 'No PDF selected yet.')
}

function render(): void {
  if (appMode === 'image') {
    renderImageMode()
  } else if (appMode === 'pdf') {
    renderPdfMode()
  } else {
    renderResizeMode()
  }

  scheduleScrollCueUpdate()
  scheduleScrollbarAccentUpdate()
}

function setMode(nextMode: AppMode): void {
  appMode = nextMode
  elements.imageModePanel.hidden = nextMode !== 'image'
  elements.pdfModePanel.hidden = nextMode !== 'pdf'
  elements.resizeModePanel.hidden = nextMode !== 'resize'
  elements.imageModeButton.classList.toggle('is-active', nextMode === 'image')
  elements.pdfModeButton.classList.toggle('is-active', nextMode === 'pdf')
  elements.resizeModeButton.classList.toggle('is-active', nextMode === 'resize')
  elements.imageModeButton.setAttribute('aria-selected', String(nextMode === 'image'))
  elements.pdfModeButton.setAttribute('aria-selected', String(nextMode === 'pdf'))
  elements.resizeModeButton.setAttribute('aria-selected', String(nextMode === 'resize'))
  elements.imageModeButton.tabIndex = nextMode === 'image' ? 0 : -1
  elements.pdfModeButton.tabIndex = nextMode === 'pdf' ? 0 : -1
  elements.resizeModeButton.tabIndex = nextMode === 'resize' ? 0 : -1
  render()
}

function getModeButton(mode: AppMode): HTMLButtonElement {
  if (mode === 'image') return elements.imageModeButton
  if (mode === 'pdf') return elements.pdfModeButton
  return elements.resizeModeButton
}

function handleModeTabKeydown(event: KeyboardEvent): void {
  const modes: AppMode[] = ['image', 'pdf', 'resize']
  const currentIndex = modes.indexOf(appMode)
  let nextIndex = currentIndex

  if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + modes.length) % modes.length
  } else if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % modes.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = modes.length - 1
  } else {
    return
  }

  event.preventDefault()
  const nextMode = modes[nextIndex]
  setMode(nextMode)
  getModeButton(nextMode).focus()
}

function swapInputValues(firstInput: HTMLInputElement, secondInput: HTMLInputElement): void {
  const firstValue = firstInput.value
  firstInput.value = secondInput.value
  secondInput.value = firstValue
}

function handlePdfOrientationChange(): void {
  swapInputValues(elements.pdfColumns, elements.pdfRows)
  swapInputValues(elements.pdfCardWidthIn, elements.pdfCardHeightIn)
  render()
}

function applyMarginPreset(select: HTMLSelectElement, inputs: HTMLInputElement[]): void {
  if (select.value === 'custom') {
    return
  }

  for (const input of inputs) {
    input.value = select.value
  }

  render()
}

function markPresetCustom(select: HTMLSelectElement): void {
  select.value = 'custom'
}

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function interpolateColor(start: readonly number[], end: readonly number[], progress: number): string {
  const [red, green, blue] = start.map((channel, index) => {
    const nextChannel = end[index] ?? channel
    return Math.round(channel + (nextChannel - channel) * progress)
  })

  return `rgb(${red} ${green} ${blue})`
}

function getScrollbarColor(progress: number): string {
  const clampedProgress = clampProgress(progress)

  for (let index = 0; index < SCROLLBAR_COLOR_STOPS.length - 1; index += 1) {
    const currentStop = SCROLLBAR_COLOR_STOPS[index]
    const nextStop = SCROLLBAR_COLOR_STOPS[index + 1]

    if (clampedProgress >= currentStop.progress && clampedProgress <= nextStop.progress) {
      const localProgress = (clampedProgress - currentStop.progress) /
        (nextStop.progress - currentStop.progress)

      return interpolateColor(currentStop.color, nextStop.color, localProgress)
    }
  }

  return interpolateColor(
    SCROLLBAR_COLOR_STOPS[SCROLLBAR_COLOR_STOPS.length - 1].color,
    SCROLLBAR_COLOR_STOPS[SCROLLBAR_COLOR_STOPS.length - 1].color,
    1,
  )
}

function updateScrollbarAccent(scroller: HTMLElement): void {
  const maxVerticalScroll = scroller.scrollHeight - scroller.clientHeight
  const maxHorizontalScroll = scroller.scrollWidth - scroller.clientWidth
  const verticalProgress = maxVerticalScroll > 0 ? scroller.scrollTop / maxVerticalScroll : 0
  const horizontalProgress = maxHorizontalScroll > 0 ? scroller.scrollLeft / maxHorizontalScroll : 0
  const progress = maxVerticalScroll > 0 ? verticalProgress : horizontalProgress

  scroller.style.setProperty('--scrollbar-thumb-color', getScrollbarColor(progress))
}

function updatePageScrollbarAccent(): void {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight
  const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0
  const color = getScrollbarColor(progress)

  document.documentElement.style.setProperty('--scrollbar-thumb-color', color)
  document.body.style.setProperty('--scrollbar-thumb-color', color)
}

function updateScrollbarAccents(): void {
  updateScrollbarAccent(elements.previewScroll)
  updateScrollbarAccent(elements.controls)
  updatePageScrollbarAccent()
}

function scheduleScrollbarAccentUpdate(): void {
  if (scrollbarFrame !== undefined) {
    window.cancelAnimationFrame(scrollbarFrame)
  }

  scrollbarFrame = window.requestAnimationFrame(() => {
    scrollbarFrame = undefined
    updateScrollbarAccents()
  })
}

function updateScrollCue(): void {
  if (prefersReducedMotion()) {
    elements.scrollCue.classList.add('is-hidden')
    elements.scrollCue.classList.remove('is-ready')
    return
  }

  const maxScroll = elements.previewScroll.scrollHeight - elements.previewScroll.clientHeight
  const hasScrollableProof = maxScroll > 100

  elements.scrollCue.classList.toggle('is-ready', hasScrollableProof)
  elements.scrollCue.classList.toggle('is-hidden', !hasScrollableProof)

  if (!hasScrollableProof) {
    elements.scrollCue.style.setProperty('--scroll-progress', '0')
    elements.scrollCue.classList.remove('is-faded')
    return
  }

  const progress = Math.min(1, Math.max(0, elements.previewScroll.scrollTop / maxScroll))
  elements.scrollCue.style.setProperty('--scroll-progress', String(progress))
  elements.scrollCue.classList.toggle('is-faded', elements.previewScroll.scrollTop > 200)
  scheduleScrollbarAccentUpdate()
}

function scheduleScrollCueUpdate(): void {
  if (scrollCueFrame !== undefined) {
    window.cancelAnimationFrame(scrollCueFrame)
  }

  scrollCueFrame = window.requestAnimationFrame(() => {
    scrollCueFrame = undefined
    updateScrollCue()
  })
}

function updateGlowTargets(pointer: { x: number; y: number }): void {
  const glowTargets = document.querySelectorAll<HTMLElement>('.hero-proof span')

  glowTargets.forEach((target) => {
    const rect = target.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distance = Math.hypot(pointer.x - centerX, pointer.y - centerY)
    const intensity = Math.max(0, 1 - distance / 140)

    target.style.setProperty('--glow-intensity', intensity.toFixed(3))
  })
}

function setupPointerPersonality(): void {
  const resetPointerEffects = (): void => {
    document.documentElement.style.removeProperty('--pointer-x')
    document.documentElement.style.removeProperty('--pointer-y')
    elements.previewArea.style.setProperty('--preview-glow', '0')

    document
      .querySelectorAll<HTMLElement>('.hero-proof span')
      .forEach((target) => target.style.setProperty('--glow-intensity', '0'))
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      if (prefersReducedMotion()) {
        return
      }

      pendingPointer = { x: event.clientX, y: event.clientY }

      if (pointerFrame !== undefined) {
        return
      }

      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = undefined

        if (!pendingPointer) {
          return
        }

        document.documentElement.style.setProperty('--pointer-x', `${pendingPointer.x}px`)
        document.documentElement.style.setProperty('--pointer-y', `${pendingPointer.y}px`)
        updateGlowTargets(pendingPointer)
      })
    },
    { passive: true },
  )

  elements.previewArea.addEventListener(
    'pointermove',
    (event) => {
      if (prefersReducedMotion()) {
        return
      }

      const rect = elements.previewArea.getBoundingClientRect()
      elements.previewArea.style.setProperty('--preview-x', `${event.clientX - rect.left}px`)
      elements.previewArea.style.setProperty('--preview-y', `${event.clientY - rect.top}px`)
      elements.previewArea.style.setProperty('--preview-glow', '1')
    },
    { passive: true },
  )

  elements.previewArea.addEventListener('pointerleave', () => {
    elements.previewArea.style.setProperty('--preview-glow', '0')
  })

  REDUCED_MOTION_QUERY.addEventListener('change', () => {
    if (prefersReducedMotion()) {
      resetPointerEffects()
    }

    scheduleScrollCueUpdate()
  })
}

function setupScrollCue(): void {
  elements.previewScroll.addEventListener('scroll', () => {
    scheduleScrollCueUpdate()
    scheduleScrollbarAccentUpdate()
  }, { passive: true })

  elements.controls.addEventListener('scroll', scheduleScrollbarAccentUpdate, { passive: true })
  window.addEventListener('scroll', scheduleScrollbarAccentUpdate, { passive: true })

  window.addEventListener('resize', () => {
    scheduleScrollCueUpdate()
    scheduleScrollbarAccentUpdate()
  }, { passive: true })

  scheduleScrollCueUpdate()
  scheduleScrollbarAccentUpdate()
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function normalizeShortcutKey(event: KeyboardEvent): string {
  return event.key.length === 1 ? event.key.toLowerCase() : event.key
}

function syncEasterHint(): void {
  elements.easterEggHint.classList.toggle(
    'is-visible',
    easterProgress >= 2 && !prefersReducedMotion(),
  )
}

function triggerEasterEgg(): void {
  if (easterTimeout !== undefined) {
    window.clearTimeout(easterTimeout)
  }

  elements.easterEggOverlay.classList.add('is-active')
  elements.easterEggOverlay.setAttribute('aria-hidden', 'false')

  easterTimeout = window.setTimeout(() => {
    elements.easterEggOverlay.classList.remove('is-active')
    elements.easterEggOverlay.setAttribute('aria-hidden', 'true')
    easterTimeout = undefined
  }, 3000)
}

function setupEasterEgg(): void {
  window.addEventListener('keydown', (event) => {
    if (isEditableTarget(event.target)) {
      return
    }

    const key = normalizeShortcutKey(event)
    const expectedKey = KONAMI_KEYS[easterProgress]

    if (key === expectedKey) {
      easterProgress += 1

      if (easterProgress === KONAMI_KEYS.length) {
        easterProgress = 0
        syncEasterHint()
        triggerEasterEgg()
        return
      }

      syncEasterHint()
      return
    }

    easterProgress = key === KONAMI_KEYS[0] ? 1 : 0
    syncEasterHint()
  })
}

function setupRegistrationWheelShortcut(): void {
  elements.registrationWheel.addEventListener('click', () => {
    registrationTapCount += 1

    if (registrationTapTimeout !== undefined) {
      window.clearTimeout(registrationTapTimeout)
    }

    if (registrationTapCount >= 7) {
      registrationTapCount = 0
      triggerEasterEgg()
      return
    }

    registrationTapTimeout = window.setTimeout(() => {
      registrationTapCount = 0
      registrationTapTimeout = undefined
    }, 1800)
  })
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

async function handleResizePdfUpload(): Promise<void> {
  const file = elements.resizePdfUpload.files?.[0]
  if (!file) return

  try {
    resizePdfInfo = await readPdfFile(file)
    elements.resizePdfMeta.textContent = `${resizePdfInfo.name}: ${resizePdfInfo.pageCount} page(s)`
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

async function generateResizedPdf(): Promise<void> {
  if (!resizePdfInfo) return

  try {
    elements.generateResizedPdfButton.disabled = true
    elements.generateResizedPdfButton.textContent = 'Generating...'
    const settings = getPdfResizeSettingsFromControls()
    const bytes = await resizePdfPages(resizePdfInfo.bytes, settings)
    const pdfBuffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(pdfBuffer).set(bytes)
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const baseName = resizePdfInfo.name.replace(/\.pdf$/i, '')
    anchor.href = url
    anchor.download = `${baseName}-${settings.paper}-${settings.orientation}-${settings.mode}.pdf`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resize the PDF.'
    setWarning(message)
  } finally {
    elements.generateResizedPdfButton.textContent = 'Generate resized PDF'
    render()
  }
}

function main(): void {
  const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '.controls input, .controls select',
  )
  const imageMarginInputs = [
    elements.marginTopCm,
    elements.marginRightCm,
    elements.marginBottomCm,
    elements.marginLeftCm,
  ]
  const pdfMarginInputs = [
    elements.pdfMarginTopIn,
    elements.pdfMarginRightIn,
    elements.pdfMarginBottomIn,
    elements.pdfMarginLeftIn,
  ]

  for (const control of controls) {
    if (control === elements.pdfOrientation) {
      continue
    }

    control.addEventListener('input', render)
    control.addEventListener('change', render)
  }

  elements.imageModeButton.addEventListener('click', () => setMode('image'))
  elements.pdfModeButton.addEventListener('click', () => setMode('pdf'))
  elements.resizeModeButton.addEventListener('click', () => setMode('resize'))
  elements.imageModeButton.addEventListener('keydown', handleModeTabKeydown)
  elements.pdfModeButton.addEventListener('keydown', handleModeTabKeydown)
  elements.resizeModeButton.addEventListener('keydown', handleModeTabKeydown)
  elements.pdfOrientation.addEventListener('change', handlePdfOrientationChange)
  elements.marginPreset.addEventListener('change', () => applyMarginPreset(elements.marginPreset, imageMarginInputs))
  elements.pdfMarginPreset.addEventListener('change', () => applyMarginPreset(elements.pdfMarginPreset, pdfMarginInputs))

  for (const input of imageMarginInputs) {
    input.addEventListener('input', () => markPresetCustom(elements.marginPreset))
  }

  for (const input of pdfMarginInputs) {
    input.addEventListener('input', () => markPresetCustom(elements.pdfMarginPreset))
  }

  elements.imageUpload.addEventListener('change', () => {
    void handleImageUpload()
  })

  elements.pdfUpload.addEventListener('change', () => {
    void handlePdfUpload()
  })

  elements.resizePdfUpload.addEventListener('change', () => {
    void handleResizePdfUpload()
  })

  elements.printButton.addEventListener('click', () => {
    window.print()
  })

  elements.generatePdfButton.addEventListener('click', () => {
    void generatePdf()
  })

  elements.generateResizedPdfButton.addEventListener('click', () => {
    void generateResizedPdf()
  })

  setupPointerPersonality()
  setupScrollCue()
  setupEasterEgg()
  setupRegistrationWheelShortcut()
  render()
}

main()
