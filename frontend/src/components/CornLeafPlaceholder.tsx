import React from 'react';

interface CornLeafPlaceholderProps {
  className?: string;
  showAnnotations?: boolean;
}

export const CornLeafPlaceholder: React.FC<CornLeafPlaceholderProps> = ({
  className = '',
  showAnnotations = true,
}) => {
  return (
    <div
      className={`relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shadow-inner flex flex-col justify-between ${className}`}
    >
      {/* SVG Corn Leaf Graphic with Chlorosis Pattern */}
      <svg
        className="absolute inset-0 w-full h-full object-cover"
        viewBox="0 0 600 450"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Soil & background blur */}
          <linearGradient id="soilBg" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c3a2f" />
            <stop offset="60%" stopColor="#1e2820" />
            <stop offset="100%" stopColor="#121813" />
          </linearGradient>

          {/* Leaf gradient with interveinal yellowing (chlorosis) */}
          <linearGradient id="leafGreen" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#15803d" />
            <stop offset="25%" stopColor="#eab308" /> {/* Interveinal chlorosis yellow */}
            <stop offset="50%" stopColor="#166534" /> {/* Midrib vein green */}
            <stop offset="75%" stopColor="#facc15" /> {/* Interveinal chlorosis yellow */}
            <stop offset="100%" stopColor="#15803d" />
          </linearGradient>

          <filter id="subtleGlow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Ambient background */}
        <rect width="600" height="450" fill="url(#soilBg)" />

        {/* Corn Stalk & Secondary leaves */}
        <path
          d="M300 450 Q310 280 290 80"
          stroke="#14532d"
          strokeWidth="18"
          strokeLinecap="round"
          fill="none"
        />

        {/* Lower Left Leaf (Showing Chlorosis) */}
        <path
          d="M295 320 C180 300 80 340 30 420 C70 340 180 260 295 290 Z"
          fill="url(#leafGreen)"
          opacity="0.95"
          filter="url(#subtleGlow)"
        />

        {/* Lower Right Leaf (V-shaped deficiency) */}
        <path
          d="M305 310 C420 290 520 330 570 410 C530 330 420 250 305 280 Z"
          fill="url(#leafGreen)"
          opacity="0.95"
          filter="url(#subtleGlow)"
        />

        {/* Upper Active Leaf Blade */}
        <path
          d="M290 200 C210 140 130 110 50 120 C120 90 220 120 295 180 Z"
          fill="#16a34a"
          opacity="0.9"
        />

        {/* Upper Right Whorl Leaf */}
        <path
          d="M305 180 C390 120 480 90 560 100 C490 80 380 110 300 160 Z"
          fill="#22c55e"
          opacity="0.9"
        />

        {/* Top Leaf Sprout */}
        <path
          d="M290 80 Q300 30 310 10 Q320 40 305 80 Z"
          fill="#4ade80"
        />

        {/* Chlorosis Inspection Overlay Box */}
        <rect
          x="70"
          y="280"
          width="180"
          height="90"
          fill="none"
          stroke="#eab308"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />

        {/* Midrib Inspection Overlay Box */}
        <rect
          x="260"
          y="240"
          width="90"
          height="110"
          fill="none"
          stroke="#10b981"
          strokeWidth="1.5"
          strokeDasharray="4 2"
        />
      </svg>

      {/* Top Overlays: Camera metadata */}
      <div className="relative z-10 p-3 flex items-center justify-between text-xs text-white/80 bg-gradient-to-b from-black/60 to-transparent">
        <span className="font-mono bg-black/40 px-2 py-0.5 rounded border border-white/10 backdrop-blur-sm">
          Field Sensor: North 40 · V8 Dent Corn
        </span>
        <span className="bg-emerald-500/20 text-emerald-300 font-mono text-[11px] px-2 py-0.5 rounded border border-emerald-500/30">
          RAW Image (24.2 MP)
        </span>
      </div>

      {/* Bottom Overlays: Annotations if enabled */}
      {showAnnotations && (
        <div className="relative z-10 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="bg-amber-950/80 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Interveinal chlorosis (lower leaves)
            </span>
            <span className="bg-emerald-950/80 text-emerald-300 border border-emerald-600/50 px-2 py-0.5 rounded backdrop-blur-sm">
              Canopy architecture: Normal
            </span>
            <span className="bg-slate-900/80 text-slate-300 border border-slate-700 px-2 py-0.5 rounded backdrop-blur-sm">
              No lesion spotting detected
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
