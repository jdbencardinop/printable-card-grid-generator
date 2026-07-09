import type { ComputedLayout, ImageInfo, LayoutSettings, PaperPreset, PaperPresetKey } from './types'

export const PAPER_PRESETS: Record<PaperPresetKey, PaperPreset> = {
  letter: {
    label: 'US Letter',
    widthCm: 21.59,
    heightCm: 27.94,
  },
  a4: {
    label: 'A4',
    widthCm: 21,
    heightCm: 29.7,
  },
}

const EPSILON_CM = 0.001

function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback
  }

  return value
}

function normalizeGap(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }

  return value
}

function normalizeCount(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined || value < 1) {
    return fallback
  }

  return Math.max(1, Math.floor(value))
}

function fitCount(availableCm: number, itemCm: number, gapCm: number): number {
  if (availableCm <= 0 || itemCm <= 0) {
    return 1
  }

  return Math.max(1, Math.floor((availableCm + gapCm) / (itemCm + gapCm)))
}

function computeCardSize(image: ImageInfo, cardLongSideCm: number): Pick<ComputedLayout, 'cardWidthCm' | 'cardHeightCm'> {
  const imageWidth = clampDimension(image.naturalWidth, 1)
  const imageHeight = clampDimension(image.naturalHeight, 1)
  const longSide = clampDimension(cardLongSideCm, 6.5)

  if (imageWidth >= imageHeight) {
    return {
      cardWidthCm: longSide,
      cardHeightCm: longSide * (imageHeight / imageWidth),
    }
  }

  return {
    cardWidthCm: longSide * (imageWidth / imageHeight),
    cardHeightCm: longSide,
  }
}

export function computeLayout(image: ImageInfo, settings: LayoutSettings): ComputedLayout {
  const paper = PAPER_PRESETS[settings.paper]
  const marginCm = normalizeGap(settings.marginCm)
  const horizontalGapCm = normalizeGap(settings.horizontalGapCm)
  const verticalGapCm = normalizeGap(settings.verticalGapCm)
  const { cardWidthCm, cardHeightCm } = computeCardSize(image, settings.cardLongSideCm)
  const availableWidthCm = paper.widthCm - marginCm * 2
  const availableHeightCm = paper.heightCm - marginCm * 2
  const autoColumns = fitCount(availableWidthCm, cardWidthCm, horizontalGapCm)
  const autoRows = fitCount(availableHeightCm, cardHeightCm, verticalGapCm)
  const columns = normalizeCount(settings.manualColumns, autoColumns)
  const rows = normalizeCount(settings.manualRows, autoRows)
  const capacity = columns * rows
  const targetCardCount = normalizeCount(settings.targetCardCount, capacity)
  const renderedCount = Math.min(targetCardCount, capacity)
  const usedWidthCm = columns * cardWidthCm + Math.max(0, columns - 1) * horizontalGapCm + marginCm * 2
  const usedHeightCm = rows * cardHeightCm + Math.max(0, rows - 1) * verticalGapCm + marginCm * 2

  return {
    pageWidthCm: paper.widthCm,
    pageHeightCm: paper.heightCm,
    cardWidthCm,
    cardHeightCm,
    columns,
    rows,
    capacity,
    renderedCount,
    usedWidthCm,
    usedHeightCm,
    fitsPage:
      usedWidthCm <= paper.widthCm + EPSILON_CM &&
      usedHeightCm <= paper.heightCm + EPSILON_CM,
  }
}
