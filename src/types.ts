export type PaperPresetKey = 'letter' | 'a4'

export type PaperOrientation = 'portrait' | 'landscape'

export type CutGuideMode =
  | 'none'
  | 'rectangle'
  | 'corners'
  | 'both'
  | 'dotted'
  | 'crop-dotted'
  | 'crop-solid'

export interface PaperPreset {
  label: string
  widthCm: number
  heightCm: number
}

export interface LayoutSettings {
  paper: PaperPresetKey
  orientation: PaperOrientation
  marginCm: number
  horizontalGapCm: number
  verticalGapCm: number
  cardLongSideCm: number
  targetCardCount?: number
  manualColumns?: number
  manualRows?: number
  cutGuideMode: CutGuideMode
}

export interface ImageInfo {
  src: string
  naturalWidth: number
  naturalHeight: number
  name: string
}

export interface ComputedLayout {
  pageWidthCm: number
  pageHeightCm: number
  cardWidthCm: number
  cardHeightCm: number
  columns: number
  rows: number
  capacity: number
  renderedCount: number
  usedWidthCm: number
  usedHeightCm: number
  fitsPage: boolean
}

export interface PdfImpositionSettings {
  paper: PaperPresetKey
  orientation: PaperOrientation
  cardWidthIn: number
  cardHeightIn: number
  columns: number
  rows: number
  marginXIn: number
  marginYIn: number
  horizontalGapIn: number
  verticalGapIn: number
  cutGuideMode: CutGuideMode
}
