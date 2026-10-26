import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 60_000,
  },

  projects: [
    {
      name: 'setup',
      testMatch: '**/global.setup.ts',
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Provide a fake audio/video device so getUserMedia succeeds in headless mode.
          // Without these flags, setMicrophoneEnabled() fails silently and LocalTrackPublished
          // never fires, making it impossible to test real media-layer mute state.
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
      dependencies: ['setup'],
    },
  ],
})
