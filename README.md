# Printable Card Grid Generator

A small browser-based tool for arranging cards into print-ready grids on US Letter or A4 paper.

## Features

- Upload a PNG, JPG, JPEG, WEBP, or SVG image
- Preserve the uploaded image aspect ratio
- Default US Letter page
- Default 6.5 cm card long side
- Auto-fit grid
- Optional target card count
- Manual rows and columns
- Printer-safe margin presets plus independent top/right/bottom/left margins
- Optional light cut guides
- Print or save as PDF from the browser
- Multi-page PDF imposition mode using `pdf-lib`
- Preserve vector PDF quality when laying out PDF pages
- PDF guide variants: none, crop marks, dotted boxes, solid boxes, crop + dotted, crop + solid
- Standalone local PDF imposition script

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Local PDF imposition script

Use the local script when you want to impose a multi-page PDF without opening the browser:

```bash
npm run impose:pdf -- input.pdf output.pdf \
  --paper letter \
  --orientation landscape \
  --card-width 3.5 \
  --card-height 4 \
  --columns 3 \
  --rows 2 \
  --margin-x 0.25 \
  --margin-y 0.25 \
  --marks crop-dotted
```

Use `--margin-top`, `--margin-right`, `--margin-bottom`, and `--margin-left`
when a printer needs asymmetric safe margins.

Supported mark styles:

```txt
none, crop, dotted, solid, crop-dotted, crop-solid
```

## Deployment

This project is configured for GitHub Pages through GitHub Actions.

The Vite base path is set to:

```txt
/printable-card-grid-generator/
```

In GitHub repository settings, use:

```txt
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```

## Printing tip

When printing, select **Actual size** or **100% scale**. Do not use **Fit to page** if exact dimensions matter.
