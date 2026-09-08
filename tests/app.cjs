const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve, extname, sep } = require('node:path');
const { chromium } = require('playwright');

const root = resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT_DIR || resolve(root, 'test-results');
mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const target = resolve(root, '.' + path);
  if (!target.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream' }); res.end(readFileSync(target)); }
  catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.TEST_BROWSER_CHANNEL ? { channel: process.env.TEST_BROWSER_CHANNEL } : {}) });
  const errors = [];
  const db = { prayer_months: {}, prayer_months_de: {} };
  const writes = [];
  let failLoads = false;
  let failSaves = false;
  const contexts = [];
  const session = { access_token: 'test-access-token', refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user: { id: 'test-user', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() } };
  async function open(lang, allowed = ['it', 'de'], loggedIn = true) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    contexts.push(context);
    await context.addInitScript(({ session, loggedIn }) => {
      if (loggedIn) localStorage.setItem('sb-zqhuctdwpdjdfrinlkcz-auth-token', JSON.stringify(session));
      localStorage.setItem('foglio-preghiera:2026-09', JSON.stringify({ days: { 1: { subject: 'LEGACY IT ONLY', reading: '' } } }));
    }, { session, loggedIn });
    // Intercept ALL requests to the real backend; this test never writes live data.
    await context.route('https://zqhuctdwpdjdfrinlkcz.supabase.co/**', async route => {
      const req = route.request(), url = new URL(req.url());
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname.includes('/auth/v1/logout')) return json({});
      if (url.pathname.includes('/auth/v1/token')) return json(session);
      if (url.pathname.includes('/auth/v1/user')) return json(session.user);
      const table = url.pathname.split('/').pop();
      if (table === 'prayer_group_members') {
        const language = url.searchParams.get('language')?.slice(3);
        return json(allowed.includes(language) ? { language } : null);
      }
      if (!db[table]) return json({ message: 'Unexpected API request' }, 500);
      if (req.method() === 'POST') {
        if (failSaves) return json({ message: 'Simulated save failure' }, 503);
        const payload = req.postDataJSON();
        writes.push({ table, payload });
        db[table][`${payload.year}-${payload.month}`] = JSON.parse(JSON.stringify(payload));
        return route.fulfill({ status: 201, body: '' });
      }
      if (failLoads) return json({ message: 'Simulated load failure' }, 503);
      const key = `${url.searchParams.get('year')?.slice(3)}-${url.searchParams.get('month')?.slice(3)}`;
      return json(db[table][key] || null);
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/${lang}/`);
    if (loggedIn) await page.waitForFunction(() => !document.querySelector('#appShell').hidden || (!document.querySelector('#accessNotice').hidden && document.querySelector('#accessMessage').textContent !== 'Wird geladen…' && document.querySelector('#accessMessage').textContent !== 'Caricamento…'));
    return page;
  }
  try {
    const landing = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await landing.goto(base);
    assert.equal(await landing.locator('.language-option').count(), 2);
    assert.equal(await landing.locator('a[lang="de"]').getAttribute('href'), 'de/');
    await landing.screenshot({ path: resolve(output, 'language-choice-mobile.png'), fullPage: true });

    const de = await open('de');
    await de.locator('#appShell').waitFor({ state: 'visible' });
    assert.equal(await de.title(), 'Gebetsplan');
    assert.equal(await de.locator('#monthSelect option').nth(2).textContent(), 'März');
    assert.equal(await de.locator('th').nth(2).textContent(), 'Gebetsanliegen');
    assert.equal(writes.length, 0, 'Opening a month must not save or populate the empty German DB');
    assert.equal(await de.locator('[data-key="subject"]').first().textContent(), '', 'German must not recover legacy Italian content');
    const germanText = 'Für die Familien – Größe, Hoffnung und Frieden.';
    await de.locator('[data-key="subject"]').first().fill(germanText);
    await de.locator('#saveButton').click();
    await de.waitForFunction(() => !dirty);
    assert(writes.every(w => w.table === 'prayer_months_de'));
    await de.reload();
    await de.locator('#appShell').waitFor({ state: 'visible' });
    assert.equal(await de.locator('[data-key="subject"]').first().textContent(), germanText);
    const current = await de.evaluate(() => ({ year: state.year, month: state.month }));
    const previous = current.month === 0 ? { year: current.year-1, month: 11 } : { year: current.year, month: current.month-1 };
    db.prayer_months_de[`${previous.year}-${previous.month+1}`] = { days: { 1: { subject: '<strong>Gemeinsam beten</strong>' }, 2: { subject: 'Für die Gemeinde' }, 3: { subject: 'Für die Kinder' } } };
    const sunday = await de.evaluate(() => Array.from({length:31}, (_,i)=>i+1).find(day=>isSunday(state.year,state.month,day)));
    await de.locator(`[data-day="${sunday}"][data-key="subject"]`).fill('Sonntag bleibt');
    await de.locator('#saveButton').click();
    de.once('dialog', d => { assert(d.message().includes('Sonntage')); d.accept(); });
    await de.locator('#previousMonthButton').click();
    await de.waitForFunction(() => !previousMonthButton.disabled && !dirty);
    assert.equal(await de.locator(`[data-day="${sunday}"][data-key="subject"]`).textContent(), 'Sonntag bleibt');
    assert(await de.locator('[data-key="subject"] strong').count() > 0);
    await de.screenshot({ path: resolve(output, 'german-desktop.png'), fullPage: true });
    await de.setViewportSize({ width: 390, height: 844 });
    await de.screenshot({ path: resolve(output, 'german-mobile.png'), fullPage: true });
    await de.setViewportSize({ width: 1440, height: 1000 });
    const pdfDownload = de.waitForEvent('download');
    await de.locator('#printButton').click();
    const pdf = await pdfDownload;
    assert(pdf.suggestedFilename().startsWith('gebetsplan-'));
    await pdf.saveAs(resolve(output, 'german.pdf'));
    await de.evaluate(() => {
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
    });
    let imageDownloads = 0;
    de.on('download', () => imageDownloads++);
    await de.locator('#imageButton').click();
    await de.locator('#imagePreviewActions').waitFor({ state: 'visible' });
    await de.waitForFunction(() => document.querySelector('#previewImage').naturalWidth > 0);
    assert.equal(imageDownloads, 0, 'Image export must open a preview instead of claiming an automatic download');
    assert(await de.locator('#shareImageButton').isHidden());
    assert(await de.evaluate(() => previewImage.naturalWidth * previewImage.naturalHeight <= 12000000));
    await de.setViewportSize({ width: 390, height: 844 });
    await de.screenshot({ path: resolve(output, 'image-preview-mobile.png') });
    const imageDownload = de.waitForEvent('download');
    await de.locator('#downloadImageLink').click();
    const png = await imageDownload;
    assert(png.suggestedFilename().startsWith('gebetsplan-'));
    await png.saveAs(resolve(output, 'german.png'));
    const popupPromise = de.waitForEvent('popup');
    await de.locator('#openImageLink').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert(popup.url().startsWith('blob:'));
    await popup.close();
    await de.locator('#closeImagePreview').click();
    await de.evaluate(() => {
      window.shareMode = 'success';
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.[0]?.type === 'image/png' });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async data => {
        window.sharedImage = { name: data.files[0].name, size: data.files[0].size, active: navigator.userActivation.isActive };
        if (window.shareMode === 'cancel') throw new DOMException('Cancelled', 'AbortError');
        if (window.shareMode === 'error') throw new DOMException('Unavailable', 'NotAllowedError');
      } });
    });
    await de.locator('#imageButton').click();
    await de.locator('#shareImageButton').waitFor({ state: 'visible' });
    await de.locator('#shareImageButton').click();
    assert(await de.evaluate(() => sharedImage.size > 0 && sharedImage.active && sharedImage.name.endsWith('.png')));
    await de.evaluate(() => { window.shareMode = 'cancel'; });
    await de.locator('#shareImageButton').click();
    assert.equal(await de.locator('#imagePreviewStatus').textContent(), '');
    await de.evaluate(() => { window.shareMode = 'error'; });
    await de.locator('#shareImageButton').click();
    assert((await de.locator('#imagePreviewStatus').textContent()).includes('nicht verfügbar'));
    await de.keyboard.press('Escape');
    assert(await de.locator('#imagePreview').isHidden());
    await de.evaluate(() => {
      window.originalToBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback) { callback(null); };
    });
    await de.locator('#imageButton').click();
    await de.waitForFunction(() => document.querySelector('#imagePreviewStatus').textContent.includes('nicht erstellt'));
    assert(await de.locator('#imagePreviewActions').isHidden());
    await de.locator('#closeImagePreview').click();
    await de.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.originalToBlob; });
    await de.setViewportSize({ width: 1440, height: 1000 });

    const it = await open('it');
    await it.locator('#appShell').waitFor({ state: 'visible' });
    assert.equal(await it.locator('th').nth(2).textContent(), 'Soggetto di preghiera');
    await it.locator('[data-key="subject"]').first().fill('Solo italiano');
    await it.locator('#saveButton').click();
    await it.waitForFunction(() => !dirty);
    assert.equal(writes.at(-1).table, 'prayer_months');
    assert(!JSON.stringify(db.prayer_months_de).includes('Solo italiano'));
    const italianMonth = await it.locator('#monthSelect').inputValue();
    const nextMonth = String((Number(italianMonth) + 1) % 12);
    await it.locator('#monthSelect').selectOption(nextMonth);
    await it.waitForFunction(month => !navigationBusy && String(state.month) === month, nextMonth);
    assert.equal(await it.locator('[data-key="subject"]').first().textContent(), '');
    await it.locator('#monthSelect').selectOption(italianMonth);
    await it.waitForFunction(month => !navigationBusy && String(state.month) === month, italianMonth);
    assert.equal(await it.locator('[data-key="subject"]').first().textContent(), 'Solo italiano');

    const beforeDenied = writes.length;
    const denied = await open('de', ['it']);
    await denied.locator('#accessNotice').waitFor({ state: 'visible' });
    assert((await denied.locator('#accessMessage').textContent()).includes('nicht freigeschaltet'));
    assert(await denied.locator('#appShell').isHidden());
    assert.equal(writes.length, beforeDenied);

    failSaves = true;
    await it.locator('[data-key="subject"]').first().fill('Da recuperare');
    await it.locator('#saveButton').click();
    await it.waitForFunction(() => !saveButton.disabled);
    assert(await it.evaluate(() => JSON.parse(localStorage.getItem(storageKey(state.year,state.month))).pending));
    failSaves = false;
    await it.reload();
    await it.locator('#appShell').waitFor({ state: 'visible' });
    assert.equal(await it.locator('[data-key="subject"]').first().textContent(), 'Da recuperare');
    await it.locator('#saveButton').click();
    await it.waitForFunction(() => !dirty);

    failLoads = true;
    const writesBeforeFailure = writes.length;
    const failed = await open('de');
    assert(await failed.locator('#appShell').isHidden());
    assert.equal(writes.length, writesBeforeFailure, 'Failed loads must never create an empty month');
    failLoads = false;
    await failed.locator('#retryAccessButton').click();
    await failed.locator('#appShell').waitFor({ state: 'visible' });

    const login = await open('de', ['de'], false);
    await login.locator('#loginCard').waitFor({ state: 'visible' });
    await login.locator('#emailInput').fill('test@example.invalid');
    await login.locator('#passwordInput').fill('Test-password-123!');
    await login.locator('button[type="submit"]').click();
    await login.locator('#appShell').waitFor({ state: 'visible' });
    await login.locator('#logoutButton').click();
    await login.locator('#loginCard').waitFor({ state: 'visible' });
    assert.equal(await login.locator('#daysBody tr').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: IT/DE routing, login/logout, translation, independent persistence, reload, import, Sunday preservation, PDF, image preview/download/open, file sharing on tap, sharing cancellation/failure, canvas failure, mobile bitmap limit, denied access, failed-save recovery, failed-load protection.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; server.close(); });
