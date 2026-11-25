// CI only. Opens customizer/index.html in Chromium and
//  1. checks that the page writes the same CSS as the command-line build (DIST/<preset>/), for
//     every preset and variant (browser parity);
//  2. screenshots the mock-up with the real theme file for every screen in both modes, every preset
//     on the summary screen, and the customizer page itself in both colour schemes.
//   node screenshots.mjs <repo root> <dist-all dir> <out dir>
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [root, distAll, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const url = pathToFileURL(join(root, 'customizer/index.html')).href;
const PRESETS = ['luminare', 'graphite', 'aurora', 'contrast'];
const SCENES = ['summary', 'hardware', 'create', 'console', 'login'];
const errors = [];

const browser = await chromium.launch();
async function open(viewport, scheme) {
    const page = await browser.newPage({ viewport, colorScheme: scheme, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.goto(url);
    await page.waitForFunction(() => window.lumenReady === true);
    return page;
}

// 1. Parity.
const page = await open({ width: 2000, height: 1300 }, 'dark');
let mismatches = 0;
for (const preset of PRESETS) {
    const files = await page.evaluate((p) => window.lumenCustomizer.files(p), preset);
    for (const [name, css] of Object.entries(files)) {
        const want = readFileSync(join(distAll, preset, name), 'utf8');
        if (css !== want) { mismatches++; console.error(`parity: ${preset}/${name} differs`); }
        else console.log(`parity ok ${preset}/${name}`);
    }
}

// 2. Mock-up screenshots.
await page.evaluate(() => window.lumenCustomizer.full());
const frame = page.locator('#mock');
async function shot(name) {
    await page.waitForTimeout(250);
    await frame.screenshot({ path: join(out, `${name}.png`) });
    console.log(`${name}.png`);
}
await page.evaluate(() => window.lumenCustomizer.preset('luminare'));
for (const mode of ['dark', 'light']) {
    await page.evaluate((m) => window.lumenCustomizer.mode(m), mode);
    for (const scene of SCENES) {
        await page.evaluate((s) => window.lumenCustomizer.scene(s), scene);
        await shot(`${scene}-${mode}`);
    }
}
await page.evaluate(() => window.lumenCustomizer.scene('summary'));
for (const preset of PRESETS.slice(1)) {
    await page.evaluate((p) => window.lumenCustomizer.preset(p), preset);
    for (const mode of ['dark', 'light']) {
        await page.evaluate((m) => window.lumenCustomizer.mode(m), mode);
        await shot(`preset-${preset}-${mode}`);
    }
}
await page.close();

// The customizer page itself.
for (const mode of ['dark', 'light']) {
    const p = await open({ width: 1440, height: 1000 }, mode);
    await p.evaluate((m) => { window.lumenCustomizer.pageTheme(m); window.lumenCustomizer.mode(m); }, mode);
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(out, `customizer-${mode}.png`) });
    console.log(`customizer-${mode}.png`);
    await p.close();
}
// Phone width: no horizontal scroll.
const phone = await open({ width: 390, height: 844 }, 'dark');
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 0) errors.push(`customizer scrolls sideways at 390 px (${overflow} px)`);
await phone.screenshot({ path: join(out, 'customizer-phone-dark.png'), fullPage: false });
await browser.close();

for (const e of errors) console.error(e);
if (mismatches || errors.length) process.exit(1);
