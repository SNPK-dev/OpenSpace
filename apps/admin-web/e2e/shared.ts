import path from 'node:path'

export const ADMIN_TEST_USERNAME = 'pw_admin_e2e'
export const ADMIN_TEST_PASSWORD = 'PwAdminE2e123!'
export const AUTH_STATE_PATH = path.join(import.meta.dirname, '.auth/admin.json')
export const API_URL = process.env.API_URL ?? 'http://localhost:8080'
export const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? ''
