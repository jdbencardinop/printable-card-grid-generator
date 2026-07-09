# Printable Card Grid Generator

A small browser-based tool for arranging an uploaded image into a printable grid on US Letter or A4 paper.

## Features

- Upload a PNG, JPG, JPEG, or WEBP image
- Preserve the uploaded image aspect ratio
- Default US Letter page
- Default 6.5 cm card long side
- Auto-fit grid
- Optional target card count
- Manual rows and columns
- Adjustable margins and spacing
- Optional light cut guides
- Print or save as PDF from the browser

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
