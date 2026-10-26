import React, { useState } from 'react'

type PasswordFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

function EyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    )
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-2.7 3.3M6.3 6.9C3.9 8.5 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function PasswordField({ className, ...props }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-field">
      <input
        {...props}
        className={className}
        type={visible ? 'text' : 'password'}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(current => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
      >
        <EyeIcon visible={visible} />
      </button>
    </div>
  )
}
