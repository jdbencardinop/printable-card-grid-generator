import { PAPER_PRESETS, computeLayout } from './layout'
import './styles.css'
import type { CutGuideMode, ImageInfo, LayoutSettings, PaperPresetKey } from './types'

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

const CUT_GUIDE_MODES: readonly CutGuideMode[] = ['none', 'rectangle', 'corners', 'both']

let imageInfo: ImageInfo | null = null

function query<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Expected to find element: ${selector}`)
  }

  return element
}

const elements = {
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
  sheet: query<HTMLDivElement>('#sheet'),
  summary: query<HTMLParagraphElement>('#summary'),
  warning: query<HTMLParagraphElement>('#warning'),
  printPageSize: query<HTMLStyleElement>('#printPageSize'),
}

function isPaperPresetKey(value: string): value is PaperPresetKey {
  return Object.hasOwn(PAPER_PRESETS, value)
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
      reject(new Error('Choose a PNG, JPG, JPEG, or WEBP image.'))
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

function render(): void {
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

function main(): void {
  const controls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
    '.controls input, .controls select',
  )

  for (const control of controls) {
    control.addEventListener('input', render)
    control.addEventListener('change', render)
  }

  elements.imageUpload.addEventListener('change', () => {
    void handleImageUpload()
  })

  elements.printButton.addEventListener('click', () => {
    window.print()
  })

  render()
}

main()
