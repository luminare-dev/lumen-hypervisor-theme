// Parity: the TypeScript modules (src/core.ts + src/pve.ts, run by node with types stripped) and
// the bundle embedded in customizer/index.html must write the same CSS bytes for every preset,
// every variant and a set of edge cases, and normalize every case to the same tokens.
//   node --experimental-strip-types --no-warnings tests/parity.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PRESETS, ROOT, bundle, loadBundle, preset, structure, version } from '../scripts/build.mjs';
import * as core from '../src/core.ts';
import * as pve from '../src/pve.ts';

const page = readFileSync(join(ROOT, 'customizer/index.html'), 'utf8');
const embedded = page.match(/<script id="lumen-bundle">\n([\s\S]*?)<\/script>/)[1].replace(/<\\\/script/gi, '</script');
let failed = 0;
const fail = (msg) => { failed++; console.error(`FAIL ${msg}`); };

if (embedded.trim() !== bundle().trim()) fail('customizer/index.html embeds an old bundle (run node scripts/build.mjs)');
const B = loadBundle(embedded);

const base = preset('luminare');
const cases = Object.fromEntries(PRESETS.map((p) => [p, preset(p)]));
cases['custom-css'] = { ...base, customCss: '.x-body { color: red; }\n</style><script>alert(1)</script>' };
cases['bad-values'] = { color: { dark: { accent: 'red', text: '#12345' } }, radius: { base: 99 }, density: 'huge', typography: { body: 'Comic<Sans' } };
cases['system-fonts'] = { ...base, typography: { ...base.typography, body: 'Inter, system-ui', display: 'Inter', stylesheet: 'https://fonts.example.invalid/inter.css' } };
cases['flat'] = { ...base, elevation: { shadow: 'none', borders: false }, layout: { ...base.layout, indicator: 'bar', backgroundGlow: false }, density: 'compact', spacing: { base: 3 }, radius: { base: 0 } };
cases['glow'] = { ...base, layout: { ...base.layout, indicator: 'glow' }, density: 'spacious', radius: { base: 28 }, typography: { ...base.typography, scale: 1.25 } };
cases['not-an-object'] = 'nope';

const opts = { version: version(), structure: structure() };
for (const [name, input] of Object.entries(cases)) {
    const a = core.normalize(input, base);
    const b = B.normalize(input, base);
    if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${name}: normalize differs`);
    for (const variant of pve.VARIANTS) {
        const x = pve.buildTheme(a.tokens, variant, opts);
        const y = B.buildTheme(b.tokens, variant, opts);
        if (x !== y) {
            const i = [...x].findIndex((c, k) => c !== y[k]);
            fail(`${name}/${variant}: CSS differs at offset ${i}: ${JSON.stringify(x.slice(i, i + 60))} vs ${JSON.stringify(y.slice(i, i + 60))}`);
        } else {
            console.log(`ok ${name}/${variant} (${x.length} bytes)`);
        }
        if (x.includes('<')) fail(`${name}/${variant}: "<" in the stylesheet`);
    }
}
if (failed) {
    console.error(`${failed} difference(s)`);
    process.exit(1);
}
