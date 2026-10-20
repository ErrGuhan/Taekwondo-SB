// playwright.config.js
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    // ── Desktop ──────────────────────────────────────────────────────────────
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    // Desktop Firefox can be enabled when firefox browser binary is installed
    // {
    //   name: 'Desktop Firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // ── Laptop ───────────────────────────────────────────────────────────────
    {
      name: 'Laptop 1280',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
      },
    },
    // ── Tablet ───────────────────────────────────────────────────────────────
    {
      name: 'iPad Pro',
      use: {
        ...devices['iPad Pro'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Tablet 768',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        isMobile: true,
      },
    },
    // ── Mobile ───────────────────────────────────────────────────────────────
    {
      name: 'iPhone 14',
      use: {
        ...devices['iPhone 14'],
        defaultBrowserType: 'chromium',
      },
    },
    {
      name: 'Galaxy S21',
      use: { ...devices['Galaxy S9+'] },
    },
    {
      name: 'Mobile 375',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
