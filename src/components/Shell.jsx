// Shell.jsx — top bar + safe-area wrapper for all inspection screens

export default function Shell({ title, subtitle, onBack, children, footer }) {
  return (
    <div className="flex flex-col min-h-screen bg-[#0d0f14]">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 bg-[#111318] border-b border-white/[0.06] safe-top flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-[#2B7FC1] flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[11px] font-semibold">NV</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{title}</div>
          {subtitle && (
            <div className="text-[11px] text-gray-400 truncate">{subtitle}</div>
          )}
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-[11px] text-[#5AAEE8] bg-[#2B7FC1]/10 px-3 py-1.5 rounded-lg flex-shrink-0"
          >
            Exit
          </button>
        )}
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 py-5">
          {children}
        </div>
      </main>

      {/* Optional sticky footer (e.g. nav buttons) */}
      {footer && (
        <footer className="flex-shrink-0 bg-[#111318] border-t border-white/[0.06] px-4 py-3 safe-bottom">
          {footer}
        </footer>
      )}
    </div>
  )
}
