import React, { ChangeEvent, useRef, useState } from 'react'

const MAX_AVATAR_FILE_BYTES = 256 * 1024
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

interface Props {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function ServerAvatarField({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setError('avatar_file_type')
      event.target.value = ''
      return
    }
    if (file.size > MAX_AVATAR_FILE_BYTES) {
      setError('avatar_file_size')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChange(reader.result)
      }
    }
    reader.onerror = () => setError('avatar_read_failed')
    reader.readAsDataURL(file)
  }

  return (
    <div className="avatar-field">
      <div className="avatar-preview" aria-hidden="true">
        {value ? <img src={value} alt="" /> : <span>OS</span>}
      </div>
      <div className="avatar-controls">
        <input
          id="server_avatar_url"
          type="text"
          value={value}
          onChange={e => {
            setError(null)
            onChange(e.target.value)
          }}
          placeholder="https://example.com/avatar.png"
          disabled={disabled}
        />
        <div className="avatar-actions">
          <input
            ref={inputRef}
            className="file-input-hidden"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileChange}
            disabled={disabled}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            Choose image
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('')} disabled={disabled || !value}>
            Clear
          </button>
        </div>
        {error && <div className="field-error">{error}</div>}
      </div>
    </div>
  )
}
