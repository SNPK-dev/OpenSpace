import path from 'node:path'

export const TEST_USERNAME = 'pw_desktop_e2e'
export const TEST_PASSWORD = 'PwDesktopE2e123!'
export const AUTH_STATE_PATH = path.join(__dirname, '.auth/user.json')
export const API_URL = process.env.API_URL ?? 'http://localhost:8080'
export const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? ''
