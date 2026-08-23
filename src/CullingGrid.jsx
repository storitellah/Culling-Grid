import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Star, Flag, Download, Eye, Grid, Columns, LayoutGrid, Sun, Moon,
  Bug, FolderOpen, Save, FileDown, ImageDown, ChevronDown, X, Check,
  Ban, CircleSlash,
} from 'lucide-react';
import { loadPreview, classify, humanSize } from './lib/decode.js';
import {
  downloadCatalog, parseCatalog, applyCatalog,
} from './lib/catalog.js';

// Heavy export libs (JSZip, jsPDF) are loaded on demand to keep launch fast.
const loadXmp = () => import('./lib/xmp.js');
const loadContactSheet = () => import('./lib/contactSheet.js');

const BUG_EMAIL = 'hello@storitellah.com';
const LABELS = [
  { key: 'red', color: '#ff453a' },
  { key: 'yellow', color: '#ffd60a' },
  { key: 'green', color: '#30d158' },
  { key: 'blue', color: '#0a84ff' },
  { key: 'purple', color: '#bf5af0' },
];
const LABEL_HEX = Object.fromEntries(LABELS.map((l) => [l.key, l.color]));

// Load previews with a small concurrency cap so ingestion never blocks the UI.
async function ingest(files, onEach) {
  const list = Array.from(files).filter((f) => {
    const c = classify(f.name);
    return c.kind !== 'unknown' || f.type.startsWith('image/');
  });
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length) {
      const idx = cursor++;
      const file = list[idx];
      try {
        const preview = await loadPreview(file);
        onEach(file, preview);
      } catch {
        onEach(file, { url: null, source: 'placeholder', unsupported: true });
      }
    }
  };
  const pool = Array.from({ length: Math.min(4, list.length) }, worker);
  await Promise.all(pool);
}

export default function CullingGrid() {
  const [images, setImages] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 50, y: 50 });
  const [viewMode, setViewMode] = useState('grid'); // grid | loupe | compare | sheet
  const [isDragging, setIsDragging] = useState(false);
  const [filter, setFilter] = useState('all'); // all | picks | rejects
  const [theme, setTheme] = useState('dark');
  const [menu, setMenu] = useState(null); // 'catalog' | 'export' | null
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);
  const catalogInputRef = useRef(null);
  const toastTimer = useRef(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  // Theme init + persistence
  useEffect(() => {
    const saved = localStorage.getItem('cg-theme');
    const initial = saved || 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('cg-theme', next); } catch { /* ignore */ }
  };

  const updateSelected = useCallback((patch) => {
    setImages((prev) =>
      prev.map((img, idx) =>
        idx === selectedIndex ? { ...img, ...(typeof patch === 'function' ? patch(img) : patch) } : img
      )
    );
  }, [selectedIndex]);

  // ---- Import -------------------------------------------------------------
  const importFiles = useCallback((fileList) => {
    const list = Array.from(fileList);
    if (!list.length) return;

    // Release old previews.
    setImages((prev) => {
      prev.forEach((img) => img.src && URL.revokeObjectURL(img.src));
      return prev;
    });

    // Seed records immediately (no spinner — thumbnails fill in as decoded).
    const seeded = list
      .filter((f) => {
        const c = classify(f.name);
        return c.kind !== 'unknown' || f.type.startsWith('image/');
      })
      .map((file, idx) => ({
        id: `${file.name}-${file.size}-${idx}`,
        name: file.name,
        size: file.size,
        src: null,
        source: null,
        unsupported: false,
        rating: 0,
        flagged: false,
        rejected: false,
        label: null,
      }));

    setImages(seeded);
    setSelectedIndex(0);

    const byId = new Map();
    seeded.forEach((s, i) => byId.set(`${s.name}-${s.size}-${i}`, s.id));

    let i = -1;
    ingest(list, (file, preview) => {
      i += 1;
      const id = byId.get(`${file.name}-${file.size}-${i}`);
      setImages((prev) =>
        prev.map((img) =>
          img.id === id
            ? { ...img, src: preview.url, source: preview.source, unsupported: !!preview.unsupported }
            : img
        )
      );
    }).then(() => {
      notify(`Imported ${seeded.length} frame${seeded.length === 1 ? '' : 's'}`);
    });
  }, [notify]);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) importFiles(e.dataTransfer.files);
  };

  // Cleanup on unmount
  useEffect(() => () => {
    images.forEach((img) => img.src && URL.revokeObjectURL(img.src));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Catalog ------------------------------------------------------------
  const saveCatalog = () => {
    if (!images.length) return notify('Nothing to save yet');
    downloadCatalog(images);
    notify('Session catalog saved (.cgcat)');
    setMenu(null);
  };
  const openCatalog = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const cat = parseCatalog(text);
      if (!images.length) {
        notify('Import the matching photos first, then open the catalog');
        return;
      }
      const { images: next, matched } = applyCatalog(images, cat);
      setImages(next);
      notify(`Catalog restored · ${matched} of ${images.length} frames matched`);
    } catch (err) {
      notify(`Could not read catalog: ${err.message}`);
    }
  };

  // ---- Exports ------------------------------------------------------------
  const doExportXmp = async () => {
    setMenu(null);
    notify('Preparing XMP sidecars…');
    const { exportXmpZip } = await loadXmp();
    const { count } = await exportXmpZip(images);
    notify(count ? `Exported ${count} XMP sidecar${count === 1 ? '' : 's'} for Lightroom` : 'No rated/flagged frames to export');
  };
  const doExportPicks = async () => {
    setMenu(null);
    const { exportPicksList } = await loadXmp();
    const { count } = exportPicksList(images);
    notify(count ? `Exported picks list · ${count} frames` : 'No picks to export');
  };
  const contactSheetSource = () => {
    const picks = images.filter((i) => (i.rating > 0 || i.flagged) && i.src);
    return picks.length ? picks : images.filter((i) => i.src);
  };
  const doContactPng = async () => {
    setMenu(null);
    notify('Rendering contact sheet…');
    const { exportContactSheetPng } = await loadContactSheet();
    const { count } = await exportContactSheetPng(contactSheetSource(), { title: 'Culling Grid — Contact Sheet' });
    notify(count ? `Contact sheet PNG exported · ${count} frames` : 'No frames to export');
  };
  const doContactPdf = async () => {
    setMenu(null);
    notify('Rendering contact sheet…');
    const { exportContactSheetPdf } = await loadContactSheet();
    const { count } = await exportContactSheetPdf(contactSheetSource(), { title: 'Culling Grid — Contact Sheet' });
    notify(count ? `Contact sheet PDF exported · ${count} frames` : 'No frames to export');
  };

  // ---- Keyboard -----------------------------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (!images.length) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        updateSelected({ rating: parseInt(e.key, 10) });
      } else if (['6', '7', '8', '9'].includes(e.key)) {
        const map = { 6: 'red', 7: 'yellow', 8: 'green', 9: 'blue' };
        const label = map[e.key];
        updateSelected((img) => ({ label: img.label === label ? null : label }));
      } else if (k === 'p') {
        updateSelected({ flagged: true, rejected: false });
      } else if (k === 'x') {
        updateSelected((img) => ({ rejected: !img.rejected, flagged: false }));
      } else if (k === 'u') {
        updateSelected({ flagged: false, rejected: false });
      } else if (e.key === 'ArrowRight' || k === 'j') {
        setSelectedIndex((p) => Math.min(p + 1, images.length - 1));
      } else if (e.key === 'ArrowLeft' || k === 'k') {
        setSelectedIndex((p) => Math.max(p - 1, 0));
      } else if (k === 'g') {
        setViewMode('grid');
      } else if (k === 'e') {
        setViewMode('loupe');
      } else if (k === 'c') {
        setViewMode('compare');
      } else if (k === 's') {
        setViewMode('sheet');
      } else if (e.code === 'Space') {
        e.preventDefault();
        setZoom((z) => (z === 1 ? 2.5 : 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, updateSelected]);

  // Close menus on outside click / escape
  useEffect(() => {
    const onDown = (e) => { if (!e.target.closest('[data-menu]')) setMenu(null); };
    const onEsc = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onEsc); };
  }, []);

  const handleMouseMove = (e) => {
    if (zoom === 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setPanPosition({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  const current = images[selectedIndex];
  const compare = images[selectedIndex + 1] || images[selectedIndex - 1];
  const visible = images.filter((img) => {
    if (filter === 'picks') return img.rating > 0 || img.flagged;
    if (filter === 'rejects') return img.rejected;
    return true;
  });
  const stats = {
    picks: images.filter((i) => i.flagged || i.rating > 0).length,
    rejects: images.filter((i) => i.rejected).length,
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <Header
        images={images} selectedIndex={selectedIndex} viewMode={viewMode} setViewMode={setViewMode}
        theme={theme} toggleTheme={toggleTheme} menu={menu} setMenu={setMenu}
        onImport={() => fileInputRef.current?.click()}
        onSaveCatalog={saveCatalog} onOpenCatalog={() => catalogInputRef.current?.click()}
        onExportXmp={doExportXmp} onExportPicks={doExportPicks}
        onContactPng={doContactPng} onContactPdf={doContactPdf}
        stats={stats}
      />

      <input ref={fileInputRef} type="file" multiple accept="image/*,.cr2,.cr3,.nef,.arw,.raf,.rw2,.dng,.orf,.pef,.srw,.tif,.tiff,.heic,.heif" className="hidden" onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} />
      <input ref={catalogInputRef} type="file" accept=".cgcat,application/json" className="hidden" onChange={openCatalog} />

      <main
        className="relative flex-1 overflow-hidden"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setIsDragging(false); }}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-30 m-4 flex items-center justify-center rounded-3xl border-2 border-dashed pointer-events-none"
            style={{ borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Drop photos to import</p>
          </div>
        )}

        {!images.length ? (
          <EmptyState onImport={() => fileInputRef.current?.click()} />
        ) : viewMode === 'grid' ? (
          <GridView images={visible} allImages={images} selectedIndex={selectedIndex} setSelectedIndex={(i) => setSelectedIndex(images.indexOf(visible[i]))} />
        ) : viewMode === 'loupe' ? (
          <LoupeView current={current} zoom={zoom} panPosition={panPosition} onMouseMove={handleMouseMove} />
        ) : viewMode === 'compare' ? (
          <CompareView a={current} b={compare} zoom={zoom} panPosition={panPosition} onMouseMove={handleMouseMove} />
        ) : (
          <SheetView images={contactSheetSource()} onPng={doContactPng} onPdf={doContactPdf} />
        )}
      </main>

      <Filmstrip
        images={images} selectedIndex={selectedIndex} setSelectedIndex={setSelectedIndex}
        filter={filter} setFilter={setFilter} current={current} updateSelected={updateSelected}
      />

      {toast && (
        <div className="cg-sheet fixed bottom-28 left-1/2 z-50 -translate-x-1/2 cg-material-strong rounded-2xl px-4 py-2.5 text-sm shadow-2xl"
          style={{ border: '1px solid var(--hairline)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function Header(props) {
  const {
    images, selectedIndex, viewMode, setViewMode, theme, toggleTheme, menu, setMenu,
    onImport, onSaveCatalog, onOpenCatalog, onExportXmp, onExportPicks, onContactPng, onContactPdf, stats,
  } = props;

  const views = [
    { id: 'grid', label: 'Grid', hint: 'G', Icon: Grid },
    { id: 'loupe', label: 'Loupe', hint: 'E', Icon: Eye },
    { id: 'compare', label: 'Compare', hint: 'C', Icon: Columns },
    { id: 'sheet', label: 'Contact', hint: 'S', Icon: LayoutGrid },
  ];

  return (
    <header className="cg-material-strong z-40 flex h-14 shrink-0 items-center justify-between gap-3 px-4"
      style={{ borderBottom: '1px solid var(--hairline)' }}>
      {/* Brand */}
      <div className="flex min-w-0 items-center gap-3">
        <img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-semibold tracking-tight">Culling Grid</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--text-3)' }}>by Storitellah</div>
        </div>
        {images.length > 0 && (
          <span className="ml-1 hidden items-center gap-2 text-[11px] sm:flex" style={{ color: 'var(--text-3)' }}>
            <span>{selectedIndex + 1}/{images.length}</span>
            {stats.picks > 0 && <span style={{ color: 'var(--pick)' }}>● {stats.picks}</span>}
            {stats.rejects > 0 && <span style={{ color: 'var(--reject)' }}>● {stats.rejects}</span>}
          </span>
        )}
      </div>

      {/* View switcher */}
      <div className="cg-material flex items-center gap-0.5 rounded-xl p-1" style={{ border: '1px solid var(--hairline)' }}>
        {views.map(({ id, label, hint, Icon }) => (
          <button key={id} onClick={() => setViewMode(id)} title={`${label} [${hint}]`}
            className="cg-press flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium"
            style={viewMode === id
              ? { background: 'var(--accent)', color: '#fff' }
              : { color: 'var(--text-2)' }}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button onClick={onImport} className="cg-press cg-material hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium sm:flex"
          style={{ border: '1px solid var(--hairline)' }}>
          <FolderOpen className="h-3.5 w-3.5" /> Import
        </button>

        <Menu id="catalog" menu={menu} setMenu={setMenu} label="Catalog" Icon={Save}>
          <MenuItem Icon={Save} onClick={onSaveCatalog}>Save session…</MenuItem>
          <MenuItem Icon={FolderOpen} onClick={onOpenCatalog}>Open session…</MenuItem>
        </Menu>

        <Menu id="export" menu={menu} setMenu={setMenu} label="Export" Icon={Download} primary>
          <MenuLabel>Lightroom Classic</MenuLabel>
          <MenuItem Icon={FileDown} onClick={onExportXmp}>XMP sidecars (.zip)</MenuItem>
          <MenuItem Icon={FileDown} onClick={onExportPicks}>Picks list (.txt)</MenuItem>
          <MenuLabel>Contact sheet</MenuLabel>
          <MenuItem Icon={ImageDown} onClick={onContactPng}>Export PNG</MenuItem>
          <MenuItem Icon={FileDown} onClick={onContactPdf}>Export PDF</MenuItem>
        </Menu>

        <button onClick={toggleTheme} title="Toggle theme"
          className="cg-press cg-material grid h-8 w-8 place-items-center rounded-lg" style={{ border: '1px solid var(--hairline)' }}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <a href={`mailto:${BUG_EMAIL}?subject=${encodeURIComponent('Culling Grid — Bug Report')}&body=${encodeURIComponent('Describe what happened:\n\n\n---\nBrowser: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : ''))}`}
          title={`Report a bug to ${BUG_EMAIL}`}
          className="cg-press cg-material grid h-8 w-8 place-items-center rounded-lg" style={{ border: '1px solid var(--hairline)' }}>
          <Bug className="h-4 w-4" />
        </a>
      </div>
    </header>
  );
}

function Menu({ id, menu, setMenu, label, Icon, primary, children }) {
  const open = menu === id;
  return (
    <div className="relative" data-menu>
      <button onClick={() => setMenu(open ? null : id)}
        className="cg-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
        style={primary
          ? { background: 'var(--accent)', color: '#fff' }
          : { border: '1px solid var(--hairline)', color: 'var(--text)', background: 'var(--surface)' }}>
        <Icon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <div className="cg-sheet cg-material-strong absolute right-0 top-full z-50 mt-2 w-56 rounded-xl p-1.5 shadow-2xl"
          style={{ border: '1px solid var(--hairline)' }}>
          {children}
        </div>
      )}
    </div>
  );
}
function MenuLabel({ children }) {
  return <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>{children}</div>;
}
function MenuItem({ Icon, onClick, children }) {
  return (
    <button onClick={onClick}
      className="cg-press flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:brightness-125"
      style={{ color: 'var(--text)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hairline)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
      <Icon className="h-4 w-4" style={{ color: 'var(--text-2)' }} /> {children}
    </button>
  );
}

function EmptyState({ onImport }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <img src="/icon.svg" alt="" className="mb-5 h-16 w-16 rounded-2xl opacity-90" />
      <h1 className="text-xl font-semibold tracking-tight">Cull faster.</h1>
      <p className="mt-1.5 max-w-md text-sm" style={{ color: 'var(--text-2)' }}>
        Drop a burst of RAW frames or a folder of exports. Previews are pulled straight from the
        embedded JPEGs — no waiting, no spinners. Everything stays on your machine.
      </p>
      <button onClick={onImport}
        className="cg-press mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-lg"
        style={{ background: 'var(--accent)', color: '#fff' }}>
        Import photos
      </button>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px]" style={{ color: 'var(--text-3)' }}>
        <Legend k="1–5" v="Rate" /><Legend k="6–9" v="Label" /><Legend k="P" v="Pick" />
        <Legend k="X" v="Reject" /><Legend k="Space" v="100%" /><Legend k="←/→" v="Nav" />
      </div>
      <p className="mt-6 text-[11px]" style={{ color: 'var(--text-3)' }}>
        RAW · CR2/CR3 · NEF · ARW · RAF · RW2 · DNG · HEIC · TIFF · JPEG · PNG
      </p>
    </div>
  );
}
function Legend({ k, v }) {
  return <span><strong style={{ color: 'var(--text)' }}>{k}</strong> {v}</span>;
}

function Thumb({ img }) {
  if (img.src) return <img src={img.src} alt={img.name} className="h-full w-full object-cover" loading="lazy" />;
  if (img.unsupported) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center" style={{ color: 'var(--text-3)' }}>
        <CircleSlash className="h-5 w-5" />
        <span className="px-1 text-[9px] leading-tight">no preview</span>
      </div>
    );
  }
  // Neutral placeholder while decoding (no spinner, per spec)
  return <div className="h-full w-full animate-pulse" style={{ background: 'var(--bg-elev)' }} />;
}

function Badges({ img }) {
  return (
    <>
      {img.label && <div className="absolute left-0 top-0 h-1.5 w-full" style={{ background: LABEL_HEX[img.label] }} />}
      {img.flagged && (
        <div className="absolute left-1.5 top-2.5 grid h-5 w-5 place-items-center rounded-full shadow" style={{ background: 'var(--pick)' }}>
          <Flag className="h-3 w-3 fill-black text-black" />
        </div>
      )}
      {img.rejected && (
        <div className="absolute left-1.5 top-2.5 grid h-5 w-5 place-items-center rounded-full shadow" style={{ background: 'var(--reject)' }}>
          <X className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      )}
      {img.rating > 0 && (
        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold cg-material" style={{ color: 'var(--star)' }}>
          <Star className="h-2.5 w-2.5" style={{ fill: 'var(--star)' }} />{img.rating}
        </div>
      )}
    </>
  );
}

function GridView({ images, allImages, selectedIndex, setSelectedIndex }) {
  const selId = allImages[selectedIndex]?.id;
  return (
    <div className="grid h-full grid-cols-3 gap-3 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
      style={{ alignContent: 'start' }}>
      {images.map((img, idx) => (
        <button key={img.id} onClick={() => setSelectedIndex(idx)}
          className="cg-press group relative aspect-square overflow-hidden rounded-xl"
          style={{
            outline: img.id === selId ? '2px solid var(--accent)' : '1px solid var(--hairline)',
            outlineOffset: img.id === selId ? '1px' : '0',
            opacity: img.rejected ? 0.5 : 1,
            background: 'var(--bg-elev)',
          }}>
          <Thumb img={img} />
          <Badges img={img} />
        </button>
      ))}
    </div>
  );
}

function Peep({ img, zoom, panPosition }) {
  if (!img) return null;
  if (!img.src) {
    return <div className="grid h-full w-full place-items-center text-sm" style={{ color: 'var(--text-3)' }}>{img.unsupported ? 'No preview available' : 'Decoding…'}</div>;
  }
  return (
    <div className="h-full w-full"
      style={{
        backgroundImage: `url(${img.src})`,
        backgroundPosition: `${panPosition.x}% ${panPosition.y}%`,
        backgroundSize: zoom === 1 ? 'contain' : `${zoom * 100}%`,
        backgroundRepeat: 'no-repeat',
      }} />
  );
}

function LoupeView({ current, zoom, panPosition, onMouseMove }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black"
      style={{ cursor: zoom === 1 ? 'zoom-in' : 'zoom-out' }} onMouseMove={onMouseMove}>
      <Peep img={current} zoom={zoom} panPosition={panPosition} />
      {current && (
        <div className="cg-material absolute left-4 top-4 rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--hairline)' }}>
          {current.name} · {zoom > 1 ? '100%' : 'Fit'} · {humanSize(current.size)}
        </div>
      )}
    </div>
  );
}

function CompareView({ a, b, zoom, panPosition, onMouseMove }) {
  return (
    <div className="grid h-full grid-cols-2 bg-black" style={{ cursor: zoom === 1 ? 'zoom-in' : 'zoom-out' }} onMouseMove={onMouseMove}>
      {[a, b].map((img, i) => (
        <div key={i} className="relative h-full w-full overflow-hidden" style={{ borderLeft: i === 1 ? '1px solid var(--hairline)' : 'none' }}>
          <Peep img={img} zoom={zoom} panPosition={panPosition} />
          {img && (
            <div className="cg-material absolute bottom-4 left-4 rounded-lg px-2.5 py-1 text-xs" style={{ border: '1px solid var(--hairline)' }}>
              <span style={{ color: i === 0 ? 'var(--accent)' : 'var(--text-2)' }}>{i === 0 ? 'A' : 'B'}</span> · {img.name}{img.rating ? ` · ★${img.rating}` : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SheetView({ images, onPng, onPdf }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="text-sm">
          <span className="font-semibold">Contact sheet</span>
          <span className="ml-2" style={{ color: 'var(--text-3)' }}>{images.length} selected {images.length ? '(picks)' : ''}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onPng} className="cg-press cg-material flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium" style={{ border: '1px solid var(--hairline)' }}>
            <ImageDown className="h-3.5 w-3.5" /> PNG
          </button>
          <button onClick={onPdf} className="cg-press flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: 'var(--accent)', color: '#fff' }}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </button>
        </div>
      </div>
      {images.length ? (
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto p-5 sm:grid-cols-3 md:grid-cols-4" style={{ alignContent: 'start' }}>
          {images.map((img) => (
            <figure key={img.id} className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--hairline)', background: 'var(--bg-elev)' }}>
              <div className="relative aspect-[4/3]">
                <Thumb img={img} />
                <Badges img={img} />
              </div>
              <figcaption className="truncate px-2 py-1.5 text-[11px]" style={{ color: 'var(--text-2)' }}>
                {img.name}{img.rating ? ` · ★${img.rating}` : ''}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--text-3)' }}>
          Pick or rate frames to build a contact sheet.
        </div>
      )}
    </div>
  );
}

function Filmstrip({ images, selectedIndex, setSelectedIndex, filter, setFilter, current, updateSelected }) {
  const filters = [
    { id: 'all', label: 'All' },
    { id: 'picks', label: 'Picks' },
    { id: 'rejects', label: 'Rejects' },
  ];
  return (
    <footer className="cg-material-strong z-40 flex h-24 shrink-0 items-center gap-3 px-3" style={{ borderTop: '1px solid var(--hairline)' }}>
      {/* Quick actions for current */}
      <div className="hidden shrink-0 flex-col gap-1.5 md:flex">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => updateSelected({ rating: n })} className="cg-press"
              title={`${n} star`}>
              <Star className="h-4 w-4" style={{ color: current && current.rating >= n ? 'var(--star)' : 'var(--text-3)', fill: current && current.rating >= n ? 'var(--star)' : 'transparent' }} />
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {LABELS.map((l) => (
            <button key={l.key} onClick={() => updateSelected((img) => ({ label: img.label === l.key ? null : l.key }))}
              className="cg-press h-4 w-4 rounded-full" title={l.key}
              style={{ background: l.color, outline: current && current.label === l.key ? '2px solid var(--text)' : 'none', outlineOffset: '1px', opacity: current && current.label === l.key ? 1 : 0.55 }} />
          ))}
          <button onClick={() => updateSelected({ flagged: true, rejected: false })} className="cg-press ml-1 grid h-4 w-4 place-items-center rounded" title="Pick [P]" style={{ background: current && current.flagged ? 'var(--pick)' : 'transparent', border: '1px solid var(--pick)' }}>
            <Check className="h-3 w-3" style={{ color: current && current.flagged ? '#000' : 'var(--pick)' }} strokeWidth={3} />
          </button>
          <button onClick={() => updateSelected((img) => ({ rejected: !img.rejected, flagged: false }))} className="cg-press grid h-4 w-4 place-items-center rounded" title="Reject [X]" style={{ background: current && current.rejected ? 'var(--reject)' : 'transparent', border: '1px solid var(--reject)' }}>
            <Ban className="h-3 w-3" style={{ color: current && current.rejected ? '#fff' : 'var(--reject)' }} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      <div className="h-14 w-px shrink-0" style={{ background: 'var(--hairline)' }} />

      {/* Filmstrip */}
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto py-2">
        {images.map((img, idx) => (
          <button key={img.id} onClick={() => setSelectedIndex(idx)}
            className="cg-press relative h-16 w-16 shrink-0 overflow-hidden rounded-lg"
            style={{
              outline: idx === selectedIndex ? '2px solid var(--accent)' : '1px solid var(--hairline)',
              opacity: idx === selectedIndex ? 1 : img.rejected ? 0.4 : 0.7,
              background: 'var(--bg-elev)',
            }}>
            <Thumb img={img} />
            {img.label && <div className="absolute left-0 top-0 h-1 w-full" style={{ background: LABEL_HEX[img.label] }} />}
            {img.flagged && <div className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: 'var(--pick)' }} />}
            {img.rejected && <div className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: 'var(--reject)' }} />}
          </button>
        ))}
      </div>

      {/* Filter segmented control */}
      <div className="cg-material hidden shrink-0 items-center gap-0.5 rounded-lg p-1 sm:flex" style={{ border: '1px solid var(--hairline)' }}>
        {filters.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="cg-press rounded-md px-2.5 py-1 text-[11px] font-medium"
            style={filter === f.id ? { background: 'var(--accent)', color: '#fff' } : { color: 'var(--text-2)' }}>
            {f.label}
          </button>
        ))}
      </div>
    </footer>
  );
}
