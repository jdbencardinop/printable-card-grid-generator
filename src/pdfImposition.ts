import { PDFDocument, PDFPage, rgb } from 'pdf-lib'
import type { CutGuideMode, PdfImpositionSettings, PaperOrientation, PaperPresetKey } from './types'

const INCH = 72

const PAPER_POINTS: Record<PaperPresetKey, { width: number; height: number }> = {
  letter: {
    width: 8.5 * INCH,
    height: 11 * INCH,
  },
  a4: {
    width: 595.28,
    height: 841.89,
  },
}

export function getPaperSizePoints(
  paper: PaperPresetKey,
  orientation: PaperOrientation,
): { width: number; height: number } {
  const size = PAPER_POINTS[paper]
  return orientation === 'landscape'
    ? { width: size.height, height: size.width }
    : size
}

function drawCropMarks(page: PDFPage, x: number, y: number, width: number, height: number): void {
  const mark = {
    length: 10,
    offset: 5,
    color: rgb(0.72, 0.72, 0.72),
    width: 0.35,
  }
  const x0 = x
  const x1 = x + width
  const y0 = y
  const y1 = y + height
  const marks = [
    [[x0 - mark.offset - mark.length, y0], [x0 - mark.offset, y0]],
    [[x0, y0 - mark.offset - mark.length], [x0, y0 - mark.offset]],
    [[x1 + mark.offset, y0], [x1 + mark.offset + mark.length, y0]],
    [[x1, y0 - mark.offset - mark.length], [x1, y0 - mark.offset]],
    [[x0 - mark.offset - mark.length, y1], [x0 - mark.offset, y1]],
    [[x0, y1 + mark.offset], [x0, y1 + mark.offset + mark.length]],
    [[x1 + mark.offset, y1], [x1 + mark.offset + mark.length, y1]],
    [[x1, y1 + mark.offset], [x1, y1 + mark.offset + mark.length]],
  ] as const

  for (const [[startX, startY], [endX, endY]] of marks) {
    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      color: mark.color,
      thickness: mark.width,
    })
  }
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  style: 'dotted' | 'solid',
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.62, 0.62, 0.62),
    borderWidth: style === 'dotted' ? 0.45 : 0.35,
    ...(style === 'dotted' ? { borderDashArray: [3, 3] } : {}),
  })
}

function drawGuides(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  guideMode: CutGuideMode,
): void {
  if (guideMode === 'none') return
  if (guideMode === 'rectangle') {
    drawBox(page, x, y, width, height, 'solid')
    return
  }
  if (guideMode === 'corners') {
    drawCropMarks(page, x, y, width, height)
    return
  }
  if (guideMode === 'both') {
    drawBox(page, x, y, width, height, 'solid')
    drawCropMarks(page, x, y, width, height)
    return
  }
  if (guideMode === 'dotted') {
    drawBox(page, x, y, width, height, 'dotted')
    return
  }
  if (guideMode === 'crop-dotted') {
    drawBox(page, x, y, width, height, 'dotted')
    drawCropMarks(page, x, y, width, height)
    return
  }
  if (guideMode === 'crop-solid') {
    drawBox(page, x, y, width, height, 'solid')
    drawCropMarks(page, x, y, width, height)
  }
}

export function computePdfCapacity(settings: PdfImpositionSettings): {
  capacity: number
  pageWidthPt: number
  pageHeightPt: number
  cardWidthPt: number
  cardHeightPt: number
  marginXPt: number
  marginYPt: number
  usedWidthPt: number
  usedHeightPt: number
  fitsPage: boolean
} {
  if (
    !Number.isFinite(settings.columns) ||
    !Number.isFinite(settings.rows) ||
    settings.columns < 1 ||
    settings.rows < 1
  ) {
    throw new Error('Columns and rows must be positive integers.')
  }
  if (
    !Number.isFinite(settings.cardWidthIn) ||
    !Number.isFinite(settings.cardHeightIn) ||
    settings.cardWidthIn <= 0 ||
    settings.cardHeightIn <= 0
  ) {
    throw new Error('Card width and height must be positive numbers.')
  }
  if (
    !Number.isFinite(settings.marginXIn) ||
    !Number.isFinite(settings.marginYIn) ||
    !Number.isFinite(settings.horizontalGapIn) ||
    !Number.isFinite(settings.verticalGapIn) ||
    settings.marginXIn < 0 ||
    settings.marginYIn < 0 ||
    settings.horizontalGapIn < 0 ||
    settings.verticalGapIn < 0
  ) {
    throw new Error('Margins and gaps must be non-negative numbers.')
  }

  const page = getPaperSizePoints(settings.paper, settings.orientation)
  const cardWidthPt = settings.cardWidthIn * INCH
  const cardHeightPt = settings.cardHeightIn * INCH
  const marginXPt = settings.marginXIn * INCH
  const marginYPt = settings.marginYIn * INCH
  const gapXPt = settings.horizontalGapIn * INCH
  const gapYPt = settings.verticalGapIn * INCH
  const usedWidthPt = settings.columns * cardWidthPt + Math.max(0, settings.columns - 1) * gapXPt + marginXPt * 2
  const usedHeightPt = settings.rows * cardHeightPt + Math.max(0, settings.rows - 1) * gapYPt + marginYPt * 2

  return {
    capacity: settings.columns * settings.rows,
    pageWidthPt: page.width,
    pageHeightPt: page.height,
    cardWidthPt,
    cardHeightPt,
    marginXPt,
    marginYPt,
    usedWidthPt,
    usedHeightPt,
    fitsPage: usedWidthPt <= page.width + 0.01 && usedHeightPt <= page.height + 0.01,
  }
}

export async function imposePdf(sourceBytes: Uint8Array, settings: PdfImpositionSettings): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourceBytes)
  const outputPdf = await PDFDocument.create()
  const size = computePdfCapacity(settings)
  const gapXPt = settings.horizontalGapIn * INCH
  const gapYPt = settings.verticalGapIn * INCH

  for (let sheetStart = 0; sheetStart < sourcePdf.getPageCount(); sheetStart += size.capacity) {
    const page = outputPdf.addPage([size.pageWidthPt, size.pageHeightPt])
    const remaining = Math.min(size.capacity, sourcePdf.getPageCount() - sheetStart)
    const embeddedPages = await outputPdf.embedPdf(
      sourceBytes,
      Array.from({ length: remaining }, (_, index) => sheetStart + index),
    )

    embeddedPages.forEach((embeddedPage, index) => {
      const column = index % settings.columns
      const row = Math.floor(index / settings.columns)
      const x = size.marginXPt + column * (size.cardWidthPt + gapXPt)
      const y = size.pageHeightPt - size.marginYPt - (row + 1) * size.cardHeightPt - row * gapYPt

      page.drawPage(embeddedPage, {
        x,
        y,
        width: size.cardWidthPt,
        height: size.cardHeightPt,
      })
      drawGuides(page, x, y, size.cardWidthPt, size.cardHeightPt, settings.cutGuideMode)
    })
  }

  return outputPdf.save()
}
