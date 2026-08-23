// Lightroom Classic bridge — writes XMP sidecar files.
//
// Lightroom Classic reads star ratings (xmp:Rating) and colour labels
// (xmp:Label) from a same-named .xmp sidecar sitting next to each RAW. On
// import (or "Read Metadata from Files") those transfer straight into the
// catalog. Pick/reject *flags* are catalog-only in Lightroom and have no
// standardised sidecar field, so we map a pick to a 5-star rating override when
// the user opts in, and always provide a filtered folder/text export as the
// reliable path for picks. Original files are never touched — only sidecars are
// produced.

import JSZip from 'jszip';
import { download } from './catalog.js';

// Lightroom's colour-label vocabulary. Custom colours fall back to their name.
const LABELS = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
};

function baseName(name) {
  return name.replace(/\.[^./\\]+$/, '');
}

function xmpEscape(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildXmpSidecar(img, { pickAsRating = false } = {}) {
  let rating = img.rating || 0;
  if (pickAsRating && img.flagged && rating === 0) rating = 5;

  const labelName = img.label ? LABELS[img.label] || img.label : '';
  const props = [];
  if (rating > 0) props.push(`   xmp:Rating="${rating}"`);
  if (labelName) props.push(`   xmp:Label="${xmpEscape(labelName)}"`);
  props.push('   xmp:CreatorTool="Culling Grid by Storitellah"');

  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Culling Grid">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
${props.join('\n')}>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

// Bundle one .xmp per rated/flagged/labelled frame into a single zip.
export async function exportXmpZip(images, opts = {}) {
  const picks = images.filter(
    (i) => i.rating > 0 || i.flagged || i.label || i.rejected
  );
  if (!picks.length) return { count: 0 };

  const zip = new JSZip();
  for (const img of picks) {
    zip.file(`${baseName(img.name)}.xmp`, buildXmpSidecar(img, opts));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const stamp = new Date().toISOString().slice(0, 10);
  download(`lightroom_xmp_${stamp}.zip`, blob, 'application/zip');
  return { count: picks.length };
}

// Filtered folder / picks manifest — a plain, greppable list that works for
// picks even though flags aren't an XMP field. Useful with `xargs cp` etc.
export function exportPicksList(images) {
  const picks = images.filter((i) => i.rating > 0 || i.flagged);
  if (!picks.length) return { count: 0 };
  const lines = picks.map((p) => {
    const stars = p.rating ? ` [${'★'.repeat(p.rating)}]` : '';
    const label = p.label ? ` {${p.label}}` : '';
    return `${p.name}${stars}${label}`;
  });
  const stamp = Date.now();
  download(`culled_picks_${stamp}.txt`, lines.join('\n'), 'text/plain');
  return { count: picks.length };
}
