#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { PDFDocument, rgb } from 'pdf-lib'

const INCH = 72
const PAPER_POINTS = {
  letter: { width: 8.5 * INCH, height: 11 * INCH },
  a4: { width: 595.28, height: 841.89 },
}

const defaults = {
  paper: 'letter',
  orientation: 'landscape',
  cardWidthIn: 3.5,
  cardHeightIn: 4,
  columns: 3,
  rows: 2,
  marginXIn: 0.25,
  marginYIn: 0.25,
  horizontalGapIn: 0,
  verticalGapIn: 0,
  marks: 'crop-dotted',
}

function printUsage() {
  console.log(`Usage:
  node scripts/impose-pdf.mjs input.pdf output.pdf [options]

Options:
  --paper letter|a4
  --orientation landscape|portrait
  --card-width 3.5
  --card-height 4
  --columns 3
  --rows 2
  --margin-x 0.25
  --margin-y 0.25
  --gap-x 0
  --gap-y 0
  --marks none|crop|dotted|solid|crop-dotted|crop-solid

Example:
  node scripts/impose-pdf.mjs cards.pdf cards-6up.pdf --card-width 3.5 --card-height 4 --columns 3 --rows 2 --marks crop-dotted
`)
}

function readArgs(argv) {
  const [input, output, ...rest] = argv
  if (!input || !output || input === '--help') {
    printUsage()
    process.exit(input === '--help' ? 0 : 1)
  }

  const settings = { ...defaults }
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index]
    const value = rest[index + 1]
    if (!key || !value) throw new Error(`Missing value for ${key}`)
    if (key === '--paper') settings.paper = value
    else if (key === '--orientation') settings.orientation = value
    else if (key === '--card-width') settings.cardWidthIn = Number(value)
    else if (key === '--card-height') settings.cardHeightIn = Number(value)
    else if (key === '--columns') settings.columns = Number(value)
    else if (key === '--rows') settings.rows = Number(value)
    else if (key === '--margin-x') settings.marginXIn = Number(value)
    else if (key === '--margin-y') settings.marginYIn = Number(value)
    else if (key === '--gap-x') settings.horizontalGapIn = Number(value)
    else if (key === '--gap-y') settings.verticalGapIn = Number(value)
    else if (key === '--marks') settings.marks = value
    else throw new Error(`Unknown option: ${key}`)
  }

  return { input, output, settings }
}

function getPaperSize(settings) {
  const paper = PAPER_POINTS[settings.paper]
  if (!paper) throw new Error(`Unsupported paper: ${settings.paper}`)
  if (!['portrait', 'landscape'].includes(settings.orientation)) {
    throw new Error(`Unsupported orientation: ${settings.orientation}`)
  }
  return settings.orientation === 'landscape' ? { width: paper.height, height: paper.width } : paper
}

function validateSettings(settings) {
  if (!Number.isFinite(settings.columns) || !Number.isFinite(settings.rows) || settings.columns < 1 || settings.rows < 1) {
    throw new Error('--columns and --rows must be positive integers')
  }
  if (
    !Number.isFinite(settings.cardWidthIn) ||
    !Number.isFinite(settings.cardHeightIn) ||
    settings.cardWidthIn <= 0 ||
    settings.cardHeightIn <= 0
  ) {
    throw new Error('--card-width and --card-height must be positive numbers')
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
    throw new Error('Margins and gaps must be non-negative numbers')
  }
  if (!['none', 'crop', 'dotted', 'solid', 'crop-dotted', 'crop-solid'].includes(settings.marks)) {
    throw new Error(`Unsupported mark style: ${settings.marks}`)
  }
}

function drawCropMarks(page, x, y, width, height) {
  const mark = { length: 10, offset: 5, color: rgb(0.72, 0.72, 0.72), width: 0.35 }
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
  ]
  for (const [[startX, startY], [endX, endY]] of marks) {
    page.drawLine({
      start: { x: startX, y: startY },
      end: { x: endX, y: endY },
      color: mark.color,
      thickness: mark.width,
    })
  }
}

function drawBox(page, x, y, width, height, dotted) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.62, 0.62, 0.62),
    borderWidth: dotted ? 0.45 : 0.35,
    ...(dotted ? { borderDashArray: [3, 3] } : {}),
  })
}

function drawGuides(page, x, y, width, height, marks) {
  if (marks === 'none') return
  if (marks === 'crop') drawCropMarks(page, x, y, width, height)
  else if (marks === 'dotted') drawBox(page, x, y, width, height, true)
  else if (marks === 'solid') drawBox(page, x, y, width, height, false)
  else if (marks === 'crop-dotted') {
    drawBox(page, x, y, width, height, true)
    drawCropMarks(page, x, y, width, height)
  } else if (marks === 'crop-solid') {
    drawBox(page, x, y, width, height, false)
    drawCropMarks(page, x, y, width, height)
  }
}

async function main() {
  const { input, output, settings } = readArgs(process.argv.slice(2))
  validateSettings(settings)
  const sourceBytes = await readFile(input)
  const sourcePdf = await PDFDocument.load(sourceBytes)
  const outputPdf = await PDFDocument.create()
  const paper = getPaperSize(settings)
  const cardWidth = settings.cardWidthIn * INCH
  const cardHeight = settings.cardHeightIn * INCH
  const marginX = settings.marginXIn * INCH
  const marginY = settings.marginYIn * INCH
  const gapX = settings.horizontalGapIn * INCH
  const gapY = settings.verticalGapIn * INCH
  const capacity = settings.columns * settings.rows

  for (let sheetStart = 0; sheetStart < sourcePdf.getPageCount(); sheetStart += capacity) {
    const page = outputPdf.addPage([paper.width, paper.height])
    const remaining = Math.min(capacity, sourcePdf.getPageCount() - sheetStart)
    const embeddedPages = await outputPdf.embedPdf(
      sourceBytes,
      Array.from({ length: remaining }, (_, index) => sheetStart + index),
    )

    embeddedPages.forEach((embeddedPage, index) => {
      const column = index % settings.columns
      const row = Math.floor(index / settings.columns)
      const x = marginX + column * (cardWidth + gapX)
      const y = paper.height - marginY - (row + 1) * cardHeight - row * gapY
      page.drawPage(embeddedPage, { x, y, width: cardWidth, height: cardHeight })
      drawGuides(page, x, y, cardWidth, cardHeight, settings.marks)
    })
  }

  await writeFile(output, await outputPdf.save())
  console.log(`${output} (${outputPdf.getPageCount()} sheets)`)
}

await main()
