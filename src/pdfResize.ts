import { PDFDocument } from 'pdf-lib'
import { getPaperSizePoints } from './pdfImposition'
import type { PdfResizeMode, PdfResizeSettings } from './types'

function getDrawBox(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: PdfResizeMode,
): { x: number; y: number; width: number; height: number } {
  if (mode === 'stretch') {
    return {
      x: 0,
      y: 0,
      width: targetWidth,
      height: targetHeight,
    }
  }

  const fitScale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const fillScale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const scale = mode === 'fill'
    ? fillScale
    : mode === 'center'
      ? Math.min(1, fitScale)
      : fitScale
  const width = sourceWidth * scale
  const height = sourceHeight * scale

  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height,
  }
}

export async function resizePdfPages(
  sourceBytes: Uint8Array,
  settings: PdfResizeSettings,
): Promise<Uint8Array> {
  const sourcePdf = await PDFDocument.load(sourceBytes)
  const outputPdf = await PDFDocument.create()
  const target = getPaperSizePoints(settings.paper, settings.orientation)

  for (let index = 0; index < sourcePdf.getPageCount(); index += 1) {
    const sourcePage = sourcePdf.getPage(index)
    const embeddedPage = (await outputPdf.embedPdf(sourceBytes, [index]))[0]
    const outputPage = outputPdf.addPage([target.width, target.height])
    const drawBox = getDrawBox(
      sourcePage.getWidth(),
      sourcePage.getHeight(),
      target.width,
      target.height,
      settings.mode,
    )

    outputPage.drawPage(embeddedPage, drawBox)
  }

  return outputPdf.save()
}
