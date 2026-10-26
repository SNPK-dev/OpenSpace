import React from 'react'
import { Link } from 'react-router-dom'

export default function OnboardingPage() {
  return (
    <div className="onboarding-wrap">
      <div className="onboarding-card">
        <div className="onboarding-logo">
          <img src="assets/logo.png" alt="OpenSpace" />
        </div>
        <h1 className="onboarding-title">Welcome</h1>
        <p className="onboarding-subtitle">
          OpenSpace stores your profile locally.<br />
          There is no global account, only your vault.
        </p>
        <div className="onboarding-actions">
          <Link to="/onboarding/create-profile" className="btn btn-primary">
            Create local profile
          </Link>
          <Link to="/onboarding/pair-device" className="btn btn-secondary">
            Transfer from another device
          </Link>
        </div>
        <p className="onboarding-footer">
          Self-hosted · Your data stays on your server
        </p>
      </div>
    </div>
  )
}
