import React, { ChangeEvent, useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'

const MAX_AVATAR_BYTES = 256 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export default function AvatarImageField({ value, onChange, label = 'Avatar', disabled = false }: {
  value: string
  onChange: (value: string) => void
  label?: string
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState('')

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ALLOWED_TYPES.has(file.type)) {
      setError('Choose a PNG, JPEG, GIF, or WebP image.')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('Image must be 256 KiB or smaller.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setError('')
        onChange(reader.result)
      }
    }
    reader.onerror = () => setError('Could not read this image.')
    reader.readAsDataURL(file)
  }

  return (
    <div className="avatar-image-field">
      <div className="avatar-image-preview" aria-label={`${label} preview`}>
        {value ? <img src={value} alt="" /> : <span>{label.slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="avatar-image-controls">
        <strong>{label}</strong>
        <span>PNG, JPEG, GIF or WebP. Up to 256 KiB.</span>
        <input ref={inputRef} className="file-input-hidden" type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={handleFile} disabled={disabled} />
        <div className="avatar-image-actions">
          <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <ImagePlus size={16} aria-hidden="true" /> {value ? 'Replace' : 'Choose image'}
          </button>
          <button type="button" className="btn-icon" title="Remove avatar" aria-label="Remove avatar" onClick={() => onChange('')} disabled={disabled || !value}>
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="form-error avatar-image-error">{error}</div>}
      </div>
    </div>
  )
}
