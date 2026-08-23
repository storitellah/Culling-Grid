import React, { useState, useEffect, useRef } from 'react';
import { Star, Flag, Download, Eye, Grid, Columns } from 'lucide-react';

export default function CullingGrid() {
  const [images, setImages] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 50, y: 50 }); // Center in percentage
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'loupe' | 'compare'
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Turn a list of File objects into image records with preview URLs.
  const loadFiles = (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;

    // Release any previously created object URLs before replacing the set.
    setImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.src));
      return prev;
    });

    const loaded = files.map((file, idx) => ({
      id: `${file.name}-${idx}`,
      name: file.name,
      src: URL.createObjectURL(file),
      rating: 0,
      flagged: false,
      file,
    }));
    setImages(loaded);
    setSelectedIndex(0);
    setCompareIndex(loaded.length > 1 ? 1 : null);
  };

  // Load local files into preview URLs
  const handleFileUpload = (e) => {
    loadFiles(e.target.files);
  };

  // Drag-and-drop import onto the main viewport.
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
  };

  // Revoke all object URLs when the component unmounts.
  useEffect(() => {
    return () => images.forEach((img) => URL.revokeObjectURL(img.src));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard navigation & culling shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!images.length) return;

      // Rating: 0 - 5
      if (['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        const rating = parseInt(e.key, 10);
        setImages((prev) =>
          prev.map((img, idx) => (idx === selectedIndex ? { ...img, rating } : img))
        );
      }

      // Flag / Reject: 'p' (pick), 'u' (unflag)
      if (e.key.toLowerCase() === 'p') {
        setImages((prev) =>
          prev.map((img, idx) => (idx === selectedIndex ? { ...img, flagged: true } : img))
        );
      }
      if (e.key.toLowerCase() === 'u') {
        setImages((prev) =>
          prev.map((img, idx) => (idx === selectedIndex ? { ...img, flagged: false } : img))
        );
      }

      // Navigation
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'j') {
        setSelectedIndex((prev) => Math.min(prev + 1, images.length - 1));
      }
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'k') {
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }

      // View Modes
      if (e.key.toLowerCase() === 'g') setViewMode('grid');
      if (e.key.toLowerCase() === 'e') setViewMode('loupe');
      if (e.key.toLowerCase() === 'c') setViewMode('compare');

      // Zoom toggle: Spacebar
      if (e.code === 'Space') {
        e.preventDefault();
        setZoom((prev) => (prev === 1 ? 2.5 : 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, selectedIndex]);

  // Synchronized Pan tracking for burst comparison
  const handleMouseMove = (e) => {
    if (zoom === 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPanPosition({ x, y });
  };

  // Export culled picks as a Lightroom search string or plain file list
  const exportLightroomList = () => {
    const picks = images.filter((img) => img.rating > 0 || img.flagged);
    if (!picks.length) return alert('No flagged or rated photos to export.');

    const fileNames = picks.map((p) => p.name).join('\n');
    const blob = new Blob([fileNames], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lightroom_culled_picks_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const current = images[selectedIndex];
  const compare = images[compareIndex];

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 font-mono select-none">
      {/* Top Header */}
      <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-6">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-wider text-emerald-400 text-sm">BURST_CULLER v1.0</span>
          <span className="text-xs text-zinc-500">
            {images.length ? `[${selectedIndex + 1} / ${images.length}]` : 'No images loaded'}
          </span>
        </div>

        {/* View Switchers */}
        <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-lg border border-zinc-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 ${
              viewMode === 'grid' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'
            }`}
          >
            <Grid className="w-3.5 h-3.5" /> Grid [G]
          </button>
          <button
            onClick={() => setViewMode('loupe')}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 ${
              viewMode === 'loupe' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'
            }`}
          >
            <Eye className="w-3.5 h-3.5" /> Loupe [E]
          </button>
          <button
            onClick={() => setViewMode('compare')}
            className={`px-3 py-1 text-xs rounded flex items-center gap-1.5 ${
              viewMode === 'compare' ? 'bg-zinc-800 text-white font-semibold' : 'text-zinc-400'
            }`}
          >
            <Columns className="w-3.5 h-3.5" /> Compare [C]
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <input
            type="file"
            multiple
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700 transition"
          >
            Import Burst Folder
          </button>
          <button
            onClick={exportLightroomList}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Export LR Selects
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main
        className="flex-1 overflow-hidden relative"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-emerald-500/10 border-2 border-dashed border-emerald-500 pointer-events-none">
            <p className="text-sm text-emerald-300">Drop images to import</p>
          </div>
        )}
        {!images.length ? (
          <div className="flex h-full flex-col items-center justify-center text-zinc-500">
            <p className="text-sm">Drop raw burst frame exports or import a directory to start culling.</p>
            <p className="text-xs mt-2 text-zinc-600">Keys: [1-5] Stars | [P] Pick | [U] Unflag | [Space] 100% Zoom | [←/→] Nav</p>
          </div>
        ) : (
          <>
            {/* 1. GRID VIEW */}
            {viewMode === 'grid' && (
              <div className="grid h-full grid-cols-4 gap-3 overflow-y-auto p-4 md:grid-cols-6 lg:grid-cols-8">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    onClick={() => setSelectedIndex(idx)}
                    className={`group relative aspect-square cursor-pointer overflow-hidden rounded border-2 transition ${
                      idx === selectedIndex
                        ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <img src={img.src} alt={img.name} className="h-full w-full object-cover" />
                    {img.flagged && (
                      <div className="absolute top-1 left-1 bg-emerald-500 text-black p-0.5 rounded">
                        <Flag className="w-3 h-3 fill-black" />
                      </div>
                    )}
                    {img.rating > 0 && (
                      <div className="absolute bottom-1 right-1 bg-zinc-950/80 px-1.5 py-0.5 rounded text-[10px] text-amber-400 flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5 fill-amber-400" />
                        {img.rating}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 2. LOUPE (100% ZOOM) VIEW */}
            {viewMode === 'loupe' && current && (
              <div
                className="relative h-full w-full overflow-hidden bg-black flex items-center justify-center cursor-crosshair"
                onMouseMove={handleMouseMove}
              >
                <div
                  className="h-full w-full transition-transform duration-75"
                  style={{
                    backgroundImage: `url(${current.src})`,
                    backgroundPosition: `${panPosition.x}% ${panPosition.y}%`,
                    backgroundSize: zoom === 1 ? 'contain' : `${zoom * 100}%`,
                    backgroundRepeat: 'no-repeat',
                  }}
                />
                <div className="absolute top-4 left-4 bg-zinc-950/80 px-3 py-1.5 rounded border border-zinc-800 text-xs">
                  {current.name} • {zoom > 1 ? '100% Burst Zoom' : 'Fit'}
                </div>
              </div>
            )}

            {/* 3. SYNCED SIDE-BY-SIDE COMPARE VIEW */}
            {viewMode === 'compare' && current && compare && (
              <div className="grid h-full grid-cols-2 divide-x divide-zinc-800 bg-black cursor-crosshair" onMouseMove={handleMouseMove}>
                {/* Image A (Selected) */}
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage: `url(${current.src})`,
                      backgroundPosition: `${panPosition.x}% ${panPosition.y}%`,
                      backgroundSize: zoom === 1 ? 'contain' : `${zoom * 100}%`,
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                  <div className="absolute bottom-4 left-4 bg-zinc-950/80 px-2.5 py-1 rounded text-xs text-emerald-400 border border-zinc-800">
                    Candidate A: {current.name} (★ {current.rating})
                  </div>
                </div>

                {/* Image B (Compare) */}
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    className="h-full w-full"
                    style={{
                      backgroundImage: `url(${compare.src})`,
                      backgroundPosition: `${panPosition.x}% ${panPosition.y}%`,
                      backgroundSize: zoom === 1 ? 'contain' : `${zoom * 100}%`,
                      backgroundRepeat: 'no-repeat',
                    }}
                  />
                  <div className="absolute bottom-4 left-4 bg-zinc-950/80 px-2.5 py-1 rounded text-xs text-zinc-400 border border-zinc-800">
                    Candidate B: {compare.name} (★ {compare.rating})
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Filmstrip & Metadata HUD */}
      <footer className="h-20 border-t border-zinc-800 bg-zinc-900/60 px-4 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto max-w-[60vw] py-2">
          {images.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIndex(idx)}
              className={`relative h-14 w-14 shrink-0 rounded overflow-hidden border ${
                idx === selectedIndex ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-zinc-700 opacity-60'
              }`}
            >
              <img src={img.src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {/* Keyboard Legend */}
        <div className="text-[11px] text-zinc-500 hidden sm:flex items-center gap-4">
          <span><strong className="text-zinc-300">Space</strong> Zoom</span>
          <span><strong className="text-zinc-300">1-5</strong> Star</span>
          <span><strong className="text-zinc-300">P</strong> Pick</span>
          <span><strong className="text-zinc-300">←/→</strong> Nav</span>
        </div>
      </footer>
    </div>
  );
}
