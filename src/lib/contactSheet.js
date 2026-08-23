// Contact sheet generator — renders selected frames into a print-ready grid and
// exports to high-resolution PNG or multi-page PDF. Everything is drawn on a
// canvas, so export is pixel-exact and never leaves the browser.

import { jsPDF } from 'jspdf';
import { download } from './catalog.js';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const LABEL_COLORS = {
  red: '#ff3b30',
  yellow: '#ffcc00',
  green: '#34c759',
  blue: '#0a84ff',
  purple: '#bf5af0',
};

// Render a contact sheet onto a canvas. Returns the canvas element.
// opts: { columns, title, cellSize, gap, showMeta }
export async function renderContactSheet(images, opts = {}) {
  const columns = opts.columns || 4;
  const cell = opts.cellSize || 480; // px per thumbnail box (high-res)
  const gap = opts.gap ?? 28;
  const pad = 64;
  const headerH = 120;
  const captionH = opts.showMeta === false ? 24 : 56;
  const usable = images.filter((i) => i.src);

  const rows = Math.max(1, Math.ceil(usable.length / columns));
  const cellW = cell;
  const cellH = cell + captionH;

  const width = pad * 2 + columns * cellW + (columns - 1) * gap;
  const height = pad * 2 + headerH + rows * cellH + (rows - 1) * gap;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, width, height);

  // Header
  ctx.fillStyle = '#f5f5f7';
  ctx.font = '600 44px system-ui, -apple-system, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(opts.title || 'Contact Sheet', pad, pad);
  ctx.fillStyle = '#8e8e93';
  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  const stamp = new Date().toLocaleString();
  ctx.fillText(
    `Culling Grid by Storitellah  ·  ${usable.length} frames  ·  ${stamp}`,
    pad,
    pad + 60
  );

  for (let idx = 0; idx < usable.length; idx += 1) {
    const img = usable[idx];
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const x = pad + col * (cellW + gap);
    const y = pad + headerH + row * (cellH + gap);

    // Cell background
    ctx.fillStyle = '#161618';
    ctx.fillRect(x, y, cellW, cell);

    try {
      const bitmap = await loadImage(img.src);
      const scale = Math.min(cellW / bitmap.width, cell / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      ctx.drawImage(bitmap, x + (cellW - w) / 2, y + (cell - h) / 2, w, h);
    } catch {
      ctx.fillStyle = '#3a3a3c';
      ctx.font = '400 22px system-ui, sans-serif';
      ctx.fillText('preview unavailable', x + 20, y + cell / 2);
    }

    // Color label bar
    if (img.label && LABEL_COLORS[img.label]) {
      ctx.fillStyle = LABEL_COLORS[img.label];
      ctx.fillRect(x, y, cellW, 8);
    }

    // Caption
    if (opts.showMeta !== false) {
      ctx.fillStyle = '#c7c7cc';
      ctx.font = '400 22px system-ui, -apple-system, sans-serif';
      const stars = img.rating ? '  ' + '★'.repeat(img.rating) : '';
      let name = img.name;
      const maxChars = Math.floor(cellW / 12);
      if (name.length > maxChars) name = name.slice(0, maxChars - 1) + '…';
      ctx.fillText(name + stars, x + 4, y + cell + 16);
    }
  }

  return canvas;
}

export async function exportContactSheetPng(images, opts = {}) {
  const usable = images.filter((i) => i.src);
  if (!usable.length) return { count: 0 };
  const canvas = await renderContactSheet(usable, opts);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  const stamp = new Date().toISOString().slice(0, 10);
  download(`contact_sheet_${stamp}.png`, blob, 'image/png');
  return { count: usable.length };
}

export async function exportContactSheetPdf(images, opts = {}) {
  const usable = images.filter((i) => i.src);
  if (!usable.length) return { count: 0 };
  const canvas = await renderContactSheet(usable, opts);
  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // Fit the sheet onto A4 landscape with margins.
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const scale = Math.min(maxW / canvas.width, maxH / canvas.height);
  const w = canvas.width * scale;
  const h = canvas.height * scale;
  pdf.setFillColor(11, 11, 12);
  pdf.rect(0, 0, pageW, pageH, 'F');
  pdf.addImage(imgData, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  const stamp = new Date().toISOString().slice(0, 10);
  pdf.save(`contact_sheet_${stamp}.pdf`);
  return { count: usable.length };
}
