import React, { useEffect } from 'react'

interface Props {
  sources: ScreenSource[]
  onSelect: (id: string) => void
  onCancel: () => void
}

export default function ScreenSourcePicker({ sources, onSelect, onCancel }: Props) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  return (
    <div className="screen-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="screen-picker-modal">
        <div className="screen-picker-header">
          <span className="screen-picker-title">Select a screen or window to share</span>
          <button className="screen-picker-close" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>
        <div className="screen-picker-grid">
          {sources.map(src => (
            <button
              key={src.id}
              className="screen-picker-tile"
              onClick={() => onSelect(src.id)}
              title={src.name}
            >
              {src.thumbnail
                ? <img src={src.thumbnail} alt={src.name} className="screen-picker-thumb" />
                : <div className="screen-picker-thumb screen-picker-thumb--empty">🖥</div>
              }
              <span className="screen-picker-label">{src.name}</span>
            </button>
          ))}
          {sources.length === 0 && (
            <div className="screen-picker-empty">No screens or windows found.</div>
          )}
        </div>
        <div className="screen-picker-footer">
          <button className="voice-btn voice-btn-leave" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
