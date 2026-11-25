// Builds the theme CSS and the customizer page. Node 22.13 or newer, no packages.
//
//   node scripts/build.mjs                       dist/ (Luminare preset) and customizer/index.html
//   node scripts/build.mjs --check               exit 1 if dist/ or the page is out of date (CI)
//   node scripts/build.mjs --all DIR             every preset into DIR/<preset>/
//   node scripts/build.mjs --tokens FILE --out DIR   your own token file into DIR
//
// src/core.ts (shared Lumen token code) and src/pve.ts lose their type annotations
// (node:module stripTypeScriptTypes) and are joined into one classic script, the bundle. The CSS
// files are written by running that same bundle, and the page embeds it, so the command line and
// the customizer cannot drift (tests/parity.mjs checks the bundle against the modules too).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PRESETS = ['luminare', 'graphite', 'aurora', 'contrast'];
const EXPORTS = [
    'SCHEMA_VERSION', 'COLOR_KEYS', 'ENUMS', 'RANGES', 'LIMITS', 'CONTRAST_PAIRS', 'normalize', 'contrast',
    'contrastReport', 'VARIANTS', 'THEME_NAMES', 'THEME_LABELS', 'FONT_FILE', 'fileName', 'buildTheme',
    'buildAll', 'usesBundledFont', 'mixHex',
];

const read = (rel, enc = 'utf8') => readFileSync(join(ROOT, rel), enc);

function strip(rel) {
    return stripTypeScriptTypes(read(rel), { mode: 'strip' })
        .replace(/^import[^;]*;\n/gm, '')
        .replace(/^export (?=(const|function|let|class) )/gm, '');
}

/** The browser bundle: one classic script that defines `LumenPVE`. */
export function bundle() {
    const body = [strip('src/core.ts'), strip('src/pve.ts')].join('\n');
    return (
        '// Built by scripts/build.mjs from src/core.ts and src/pve.ts (types removed). Do not edit.\n' +
        'var LumenPVE = (function () {\n"use strict";\n' +
        body.replace(/\s+$/, '') +
        `\nreturn { ${EXPORTS.join(', ')} };\n})();\n`
    );
}

export function loadBundle(code = bundle()) {
    const sandbox = {};
    vm.runInNewContext(`${code}\nthis.LumenPVE = LumenPVE;`, sandbox);
    return sandbox.LumenPVE;
}

export const version = () => read('version.txt').trim();
export const structure = () => read('src/structure.css');
export const preset = (name) => JSON.parse(read(`src/presets/${name}.json`));

/** Every file of one build: the three CSS files, the font, the theme picker page. */
export function buildFiles(L, tokensInput) {
    const { tokens, errors } = L.normalize(tokensInput, preset('luminare'));
    const files = L.buildAll(tokens, { version: version(), structure: structure() });
    files[L.FONT_FILE] = readFileSync(join(ROOT, 'src/fonts/lumen-sora.woff'));
    files['lumen-theme.html'] = read('src/lumen-theme.html');
    return { files, errors };
}

function writeFiles(dir, files) {
    mkdirSync(dir, { recursive: true });
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
}

/** The data block the page reads: version, presets, structure, installer, picker, font. */
function pageData() {
    const data = {
        version: version(),
        presets: Object.fromEntries(PRESETS.map((p) => [p, preset(p)])),
        structure: structure(),
        install: read('install.sh'),
        picker: read('src/lumen-theme.html'),
        font: readFileSync(join(ROOT, 'src/fonts/lumen-sora.woff')).toString('base64'),
        ofl: read('src/fonts/Sora-OFL.txt'),
    };
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function renderPage() {
    const page = read('customizer/template.html');
    const parts = page.split('/*@bundle@*/');
    const parts2 = page.split('"@data@"');
    if (parts.length !== 2 || parts2.length !== 2) throw new Error('customizer/template.html: markers missing');
    return page
        .replace('/*@bundle@*/', () => bundle().replace(/<\/script/gi, '<\\/script'))
        .replace('"@data@"', () => pageData())
        .replace('<!--@generated@-->', '<!-- Generated from customizer/template.html by scripts/build.mjs. Do not edit. -->');
}

function main(argv) {
    const L = loadBundle();
    const arg = (flag) => {
        const i = argv.indexOf(flag);
        return i >= 0 ? argv[i + 1] : undefined;
    };
    if (argv.includes('--all')) {
        const out = arg('--all');
        for (const name of PRESETS) {
            writeFiles(join(out, name), buildFiles(L, preset(name)).files);
            console.log(`${out}/${name}/`);
        }
        return 0;
    }
    if (argv.includes('--tokens')) {
        const out = arg('--out') ?? 'dist/custom';
        const { files, errors } = buildFiles(L, JSON.parse(readFileSync(arg('--tokens'), 'utf8')));
        for (const e of errors) console.error(`replaced invalid value: ${e}`);
        writeFiles(out, files);
        console.log(`${out}/`);
        return 0;
    }
    const dist = buildFiles(L, preset('luminare')).files;
    const page = renderPage();
    if (argv.includes('--check')) {
        const stale = [];
        for (const [name, data] of Object.entries(dist)) {
            const path = join(ROOT, 'dist', name);
            if (!existsSync(path) || !readFileSync(path).equals(Buffer.from(data))) stale.push(`dist/${name}`);
        }
        const pagePath = join(ROOT, 'customizer/index.html');
        if (!existsSync(pagePath) || readFileSync(pagePath, 'utf8') !== page) stale.push('customizer/index.html');
        if (stale.length) {
            console.error(`out of date (run node scripts/build.mjs): ${stale.join(', ')}`);
            return 1;
        }
        console.log('dist/ and customizer/index.html are up to date');
        return 0;
    }
    writeFiles(join(ROOT, 'dist'), dist);
    writeFileSync(join(ROOT, 'customizer/index.html'), page);
    console.log('dist/ and customizer/index.html written');
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
