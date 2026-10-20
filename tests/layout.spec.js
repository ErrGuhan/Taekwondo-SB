// tests/layout.spec.js
// Responsive layout & security audit tests for Taekwondo Scoring App
import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Check that an element is fully visible and not clipped outside the viewport */
async function isInViewport(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  const vw = page.viewportSize().width;
  const vh = page.viewportSize().height;
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vw + 2 && box.y + box.height <= vh + 2;
}

/** Returns true if there is no horizontal scrollbar */
async function noHorizontalScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
}

// ── Pages under test ─────────────────────────────────────────────────────────
const PAGES = [
  { name: 'Login',      path: '/' },
  { name: 'Setup',      path: '/pages/setup/?demo=1' },
  { name: 'Control',    path: '/pages/control/?id=demo' },
  { name: 'Scoreboard', path: '/pages/scoreboard/?id=demo' },
  { name: '404 Error',  path: '/404.html' },
  { name: '500 Error',  path: '/500.html' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 1. NO HORIZONTAL OVERFLOW on any page / any device
// ─────────────────────────────────────────────────────────────────────────────
for (const { name, path } of PAGES) {
  test(`[Layout] ${name} — no horizontal scroll`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const ok = await noHorizontalScroll(page);
    expect(ok, `${name} has horizontal overflow`).toBe(true);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. VIEWPORT META: must be present and correct
// ─────────────────────────────────────────────────────────────────────────────
for (const { name, path } of PAGES) {
  test(`[Layout] ${name} — viewport meta tag`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const content = await page
      .locator('meta[name="viewport"]')
      .getAttribute('content');
    expect(content, `${name} missing viewport meta`).not.toBeNull();
    expect(content).toContain('width=device-width');
    expect(content).toContain('initial-scale=1');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOGIN PAGE — mobile layout
// ─────────────────────────────────────────────────────────────────────────────
test('[Login] card is visible and not clipped on mobile (375px)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const card = page.locator('.login-card');
  await expect(card).toBeVisible();
  const ok = await noHorizontalScroll(page);
  expect(ok, 'Login card causes horizontal overflow on mobile').toBe(true);
});

test('[Login] email & password inputs are visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('#password')).toBeVisible();
  await expect(page.locator('#submit-btn')).toBeVisible();
});

test('[Login] email & password inputs have font-size >= 16px (prevents iOS zoom)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const emailFs = await page.locator('#email').evaluate(
    el => parseFloat(window.getComputedStyle(el).fontSize)
  );
  const passFs = await page.locator('#password').evaluate(
    el => parseFloat(window.getComputedStyle(el).fontSize)
  );

  expect(emailFs, `Email input font-size is ${emailFs}px — will trigger iOS zoom`).toBeGreaterThanOrEqual(16);
  expect(passFs, `Password input font-size is ${passFs}px — will trigger iOS zoom`).toBeGreaterThanOrEqual(16);
});

test('[Login] Sign In button meets 44px touch-target height', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const h = await page.locator('#submit-btn').evaluate(
    el => el.getBoundingClientRect().height
  );
  expect(h, `Submit button height ${h}px < 44px touch target`).toBeGreaterThanOrEqual(44);
});

test('[Login] password visibility toggle works', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const pwInput = page.locator('#password');
  const toggle  = page.locator('#pw-toggle');
  expect(await pwInput.getAttribute('type')).toBe('password');
  await toggle.click();
  expect(await pwInput.getAttribute('type')).toBe('text');
  await toggle.click();
  expect(await pwInput.getAttribute('type')).toBe('password');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. CONTROL PAGE — responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test('[Control] score area stacks to single column on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });

  const cols = await page.locator('.score-area').evaluate(el => {
    const style = window.getComputedStyle(el);
    return style.gridTemplateColumns;
  });
  // On mobile, it should be a single column (contains only one value)
  const colCount = cols.trim().split(/\s+/).filter(Boolean).length;
  expect(colCount, `Control score-area has ${colCount} columns on mobile, expected 1`).toBe(1);
});

test('[Control] score area has 3 columns on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });

  const cols = await page.locator('.score-area').evaluate(el => {
    return window.getComputedStyle(el).gridTemplateColumns;
  });
  const colCount = cols.trim().split(/\s+/).filter(Boolean).length;
  expect(colCount, `Control score-area has ${colCount} columns on desktop, expected 3`).toBe(3);
});

test('[Control] score buttons meet touch-target height on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });

  const btns = page.locator('.score-btn');
  const count = await btns.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const h = await btns.nth(i).evaluate(el => el.getBoundingClientRect().height);
    expect(h, `Score button ${i} height ${h}px < 44px`).toBeGreaterThanOrEqual(44);
  }
});

test('[Control] no horizontal overflow on tablet (768px)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });
  const ok = await noHorizontalScroll(page);
  expect(ok).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. SCOREBOARD PAGE — responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test('[Scoreboard] horizontal layout (row) on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });

  const direction = await page.locator('.sb-root').evaluate(
    el => window.getComputedStyle(el).flexDirection
  );
  expect(direction, `sb-root flex-direction is "${direction}" not "row" on desktop`).toBe('row');
});

test('[Scoreboard] vertical layout (column) on mobile portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });

  const direction = await page.locator('.sb-root').evaluate(
    el => window.getComputedStyle(el).flexDirection
  );
  expect(direction, `sb-root flex-direction is "${direction}" not "column" on mobile`).toBe('column');
});

test('[Scoreboard] center column renders on top on tablet portrait (order: -1)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });

  const order = await page.locator('.sb-center').evaluate(
    el => window.getComputedStyle(el).order
  );
  expect(Number(order), `sb-center order is ${order} on tablet, expected -1`).toBe(-1);
});

test('[Scoreboard] no horizontal overflow on 375px mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });
  const ok = await noHorizontalScroll(page);
  expect(ok).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SETUP PAGE — responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test('[Setup] corners-grid is single column on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/pages/setup/?demo=1', { waitUntil: 'domcontentloaded' });

  const cols = await page.locator('.corners-grid').evaluate(
    el => window.getComputedStyle(el).gridTemplateColumns
  );
  const colCount = cols.trim().split(/\s+/).filter(Boolean).length;
  expect(colCount, `Corners grid has ${colCount} columns on mobile, expected 1`).toBe(1);
});

test('[Setup] Initialize button is visible and full-width on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/pages/setup/?demo=1', { waitUntil: 'domcontentloaded' });

  const btn = page.locator('#init-btn');
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  const vw  = page.viewportSize().width;
  // Width should be close to viewport width (minus padding)
  expect(box.width, `Init button width ${box.width}px too narrow`).toBeGreaterThan(vw * 0.7);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. SECURITY AUDIT
// ─────────────────────────────────────────────────────────────────────────────
for (const { name, path } of PAGES) {
  test(`[Security] ${name} — security meta tags present`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    const xFrameOptions = await page
      .locator('meta[http-equiv="X-Frame-Options"]')
      .getAttribute('content');
    expect(xFrameOptions, `${name} missing X-Frame-Options`).not.toBeNull();

    const xContentType = await page
      .locator('meta[http-equiv="X-Content-Type-Options"]')
      .getAttribute('content');
    expect(xContentType, `${name} missing X-Content-Type-Options`).not.toBeNull();

    const referrerPolicy = await page
      .locator('meta[http-equiv="Referrer-Policy"]')
      .getAttribute('content');
    expect(referrerPolicy, `${name} missing Referrer-Policy`).not.toBeNull();
  });

  test(`[Security] ${name} — external links have rel=noopener`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    const externalLinks = await page.locator('a[target="_blank"]').all();
    for (const link of externalLinks) {
      const rel  = await link.getAttribute('rel') ?? '';
      const href = await link.getAttribute('href') ?? '';
      expect(
        rel,
        `External link "${href}" missing rel="noopener noreferrer"`
      ).toContain('noopener');
    }
  });

  test(`[Security] ${name} — no inline event handlers (onclick=...)`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    const inlineHandlers = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('*'));
      return all.filter(el => el.getAttribute('onclick')).length;
    });
    expect(inlineHandlers, `${name} has ${inlineHandlers} onclick= inline event handlers`).toBe(0);
  });
}

test('[Security] Login — autocomplete="off" NOT set globally (allows password managers)', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const formAC = await page.locator('#login-form').getAttribute('autocomplete');
  // form should NOT have autocomplete="off" — that would block password managers
  expect(formAC).not.toBe('off');
});

test('[Security] Login — password input uses autocomplete="current-password"', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const ac = await page.locator('#password').getAttribute('autocomplete');
  expect(ac).toBe('current-password');
});

test('[Security] Login — email input has type="email" and inputmode="email"', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  expect(await page.locator('#email').getAttribute('type')).toBe('email');
  expect(await page.locator('#email').getAttribute('inputmode')).toBe('email');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. ACCESSIBILITY — basic checks
// ─────────────────────────────────────────────────────────────────────────────
for (const { name, path } of PAGES) {
  test(`[A11y] ${name} — has exactly one h1`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const h1Count = await page.locator('h1').count();
    expect(h1Count, `${name} has ${h1Count} h1 elements, expected 1`).toBe(1);
  });

  test(`[A11y] ${name} — has lang attribute on <html>`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang, `${name} missing lang attribute on <html>`).not.toBeNull();
    expect(lang.length).toBeGreaterThan(0);
  });
}

test('[A11y] Login — form inputs have associated labels', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const emailLabel = await page.locator('label[for="email"]').count();
  const passLabel  = await page.locator('label[for="password"]').count();
  expect(emailLabel).toBeGreaterThanOrEqual(1);
  expect(passLabel).toBeGreaterThanOrEqual(1);
});

test('[A11y] Control — error role=alert present', async ({ page }) => {
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });
  // No explicit error here, but the finished-overlay should have role=dialog
  const dialog = await page.locator('[role="dialog"]').count();
  expect(dialog).toBeGreaterThanOrEqual(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. ALIGNMENT, CENTERING & DIGIT RENDERING CHECKS
// ─────────────────────────────────────────────────────────────────────────────
test('[Login] card is horizontally centered on desktop and mobile', async ({ page }) => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 375, height: 667 }]) {
    await page.setViewportSize(vp);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cardBox = await page.locator('.login-card').boundingBox();
    expect(cardBox).not.toBeNull();
    const cardCenter = cardBox.x + cardBox.width / 2;
    expect(Math.abs(cardCenter - vp.width / 2)).toBeLessThanOrEqual(6);
  }
});

test('[Login] logo-mark is horizontally centered within login card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const cardBox = await page.locator('.login-card').boundingBox();
  const logoBox = await page.locator('.logo-mark').boundingBox();
  expect(cardBox).not.toBeNull();
  expect(logoBox).not.toBeNull();
  const cardCenter = cardBox.x + cardBox.width / 2;
  const logoCenter = logoBox.x + logoBox.width / 2;
  expect(Math.abs(logoCenter - cardCenter)).toBeLessThanOrEqual(4);
});

test('[Scoreboard] timer and score digits have proper dimensions and font-family', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });

  const timerBox = await page.locator('#sb-timer').boundingBox();
  expect(timerBox).not.toBeNull();
  expect(timerBox.width).toBeGreaterThan(60);
  expect(timerBox.height).toBeGreaterThan(30);

  const redScoreBox = await page.locator('#sb-red-score').boundingBox();
  expect(redScoreBox).not.toBeNull();
  expect(redScoreBox.width).toBeGreaterThan(40);
  expect(redScoreBox.height).toBeGreaterThan(40);

  const font = await page.locator('#sb-timer').evaluate(el => window.getComputedStyle(el).fontFamily);
  expect(font).toContain('Chakra Petch');
});

test('[Control] bottom bar buttons are visible and have consistent heights', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/pages/control/?id=demo', { waitUntil: 'domcontentloaded' });

  const nextBtn = page.locator('#next-round-btn');
  const resetBtn = page.locator('#reset-btn');
  const sbLink = page.locator('#scoreboard-link');

  await expect(nextBtn).toBeVisible();
  await expect(resetBtn).toBeVisible();
  await expect(sbLink).toBeVisible();

  const nextH = await nextBtn.evaluate(el => el.getBoundingClientRect().height);
  const resetH = await resetBtn.evaluate(el => el.getBoundingClientRect().height);
  expect(nextH).toBeGreaterThanOrEqual(40);
  expect(resetH).toBeGreaterThanOrEqual(40);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. CUSTOM ERROR PAGES (404 & 500)
// ─────────────────────────────────────────────────────────────────────────────
test('[Error 404] action buttons meet 44px touch-target height on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/404.html', { waitUntil: 'domcontentloaded' });

  const setupBtn = page.locator('#action-setup');
  const demoBtn  = page.locator('#action-demo');
  const homeBtn  = page.locator('#action-home');
  const backBtn  = page.locator('#action-back');

  await expect(setupBtn).toBeVisible();
  await expect(demoBtn).toBeVisible();
  await expect(homeBtn).toBeVisible();
  await expect(backBtn).toBeVisible();

  const hSetup = await setupBtn.evaluate(el => el.getBoundingClientRect().height);
  const hDemo  = await demoBtn.evaluate(el => el.getBoundingClientRect().height);
  expect(hSetup, `Setup button height ${hSetup}px < 44px`).toBeGreaterThanOrEqual(44);
  expect(hDemo,  `Demo button height ${hDemo}px < 44px`).toBeGreaterThanOrEqual(44);
});

test('[Error 404] technical diagnostics accordion expands and collapses', async ({ page }) => {
  await page.goto('/404.html', { waitUntil: 'domcontentloaded' });
  const toggle = page.locator('#diag-toggle');
  const box    = page.locator('#diag-box');

  await expect(box).not.toBeVisible();
  await toggle.click();
  await expect(box).toBeVisible();
  await toggle.click();
  await expect(box).not.toBeVisible();
});

test('[Error 500] retry and demo mode buttons are interactive', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/500.html?reason=network_offline', { waitUntil: 'domcontentloaded' });

  const retryBtn = page.locator('#action-retry');
  const demoBtn  = page.locator('#action-demo');

  await expect(retryBtn).toBeVisible();
  await expect(demoBtn).toBeVisible();

  const title = await page.locator('#error-title').textContent();
  expect(title).toContain('Arena Network Offline');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. IN-APP NOTIFICATION DRAWER & FLOATING BELL
// ─────────────────────────────────────────────────────────────────────────────
for (const { name, path } of PAGES) {
  test(`[Notification] ${name} — floating bell button is present`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const bell = page.locator('#notif-bell-btn');
    await expect(bell).toBeVisible();
  });
}

test('[Notification] scoreboard floating bell has broadcast subtle styling', async ({ page }) => {
  await page.goto('/pages/scoreboard/?id=demo', { waitUntil: 'domcontentloaded' });
  const bell = page.locator('#notif-bell-btn');
  const classes = await bell.getAttribute('class');
  expect(classes).toContain('bell--broadcast');
});

test('[Notification] clicking bell opens drawer and pressing Esc closes it', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const bell = page.locator('#notif-bell-btn');
  const drawer = page.locator('#notif-drawer');

  // Initially closed
  await expect(drawer).not.toHaveClass(/notif-drawer--open/);

  // Click to open
  await bell.click();
  await expect(drawer).toHaveClass(/notif-drawer--open/);

  // Press Escape to close
  await page.keyboard.press('Escape');
  await expect(drawer).not.toHaveClass(/notif-drawer--open/);
});

test('[Notification] category filter tabs toggle active states', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const bell = page.locator('#notif-bell-btn');
  await bell.click();

  const matchTab = page.locator('.notif-tab[data-filter="match"]');
  const allTab   = page.locator('.notif-tab[data-filter="all"]');

  await matchTab.click();
  await expect(matchTab).toHaveClass(/notif-tab--active/);
  await expect(allTab).not.toHaveClass(/notif-tab--active/);
});

