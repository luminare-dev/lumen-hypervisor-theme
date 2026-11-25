// Lumen tokens -> theme CSS for the Proxmox VE web interface (ExtJS "crisp" with the widget
// toolkit's theme slot).
//
// The token schema, validation and contrast checks come from core.ts, a copy of the Hydrodactyl
// theme's file (shared.lock). This file maps the tokens onto the variables that structure.css
// reads, so structure.css itself contains no colour values. Colours that the toolkit's charts
// read through getComputedStyle (--pwt-*) must be plain colour values, so every colour here is
// mixed to a hex value instead of a CSS color-mix().
//
// One file, two consumers: scripts/build.mjs imports it (node, types stripped) to write the CSS
// files, and bundles the same code into customizer/index.html. tests/parity.mjs checks both give
// the same bytes.

import { COLOR_KEYS, SCHEMA_VERSION, fontStack, kebab, sanitizeCustomCss } from './core.ts';
import type { ModeColors, ThemeMode, Tokens } from './core.ts';

export type Variant = 'dark' | 'light' | 'auto';
export const VARIANTS: Variant[] = ['dark', 'light', 'auto'];

/** Theme names as pveproxy accepts them in PVEThemeCookie (kebab case, segments of 1-10 letters). */
export const THEME_NAMES: Record<Variant, string> = {
    dark: 'lumen-dark',
    light: 'lumen-light',
    auto: 'lumen-auto',
};

export const THEME_LABELS: Record<Variant, string> = {
    dark: 'Lumen Dark',
    light: 'Lumen Light',
    auto: 'Lumen (follow system)',
};

/** File name in the toolkit's themes directory (the UI loads /pwt/themes/theme-<name>.css). */
export function fileName(variant: Variant): string {
    return `theme-${THEME_NAMES[variant]}.css`;
}

/** The bundled font file, next to the CSS files in the themes directory. */
export const FONT_FILE = 'lumen-sora.woff';
export const BUNDLED_FAMILY = 'Sora';

export interface BuildOptions {
    /** Version string printed in the header comment. */
    version?: string;
    /** Leave out the custom CSS of the tokens. */
    withCustomCss?: boolean;
    /** The structural stylesheet (src/structure.css). */
    structure: string;
}

// ---------------------------------------------------------------------------------------------
// Colour helpers (hex in, hex out, integer rounding so every consumer prints the same bytes).
// ---------------------------------------------------------------------------------------------

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
    return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** `percentOfA` % of a, the rest b (like color-mix(in srgb, a p%, b)). */
export function mixHex(a: string, b: string, percentOfA: number): string {
    const x = toRgb(a);
    const y = toRgb(b);
    const p = percentOfA / 100;
    return toHex([x[0] * p + y[0] * (1 - p), x[1] * p + y[1] * (1 - p), x[2] * p + y[2] * (1 - p)]);
}

function rgba(hex: string, alpha: string): string {
    const [r, g, b] = toRgb(hex);
    return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** An SVG data URI for the checkbox tick, drawn in `color`. */
function tickImage(color: string): string {
    const c = color.replace('#', '%23');
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 8.5l3 3 6-7' fill='none' stroke='${c}' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
}

/** The small arrow of combo box triggers, drawn in `color`. */
function arrowImage(color: string): string {
    const c = color.replace('#', '%23');
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4.5 6.5l3.5 3.5 3.5-3.5' fill='none' stroke='${c}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
}

/** Up and down arrows of number field spinners. */
function spinnerImage(color: string): string {
    const c = color.replace('#', '%23');
    return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 24'%3E%3Cpath d='M5 10l3-3 3 3M5 14l3 3 3-3' fill='none' stroke='${c}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
}

// ---------------------------------------------------------------------------------------------
// Token -> variable mapping.
// ---------------------------------------------------------------------------------------------

// Same strengths as core.ts uses for the panel themes.
const PVE_SHADOW_ALPHA: Record<ThemeMode, Record<Tokens['elevation']['shadow'], number>> = {
    dark: { none: 0, soft: 0.22, medium: 0.34, strong: 0.5 },
    light: { none: 0, soft: 0.06, medium: 0.1, strong: 0.16 },
};
const PVE_SHADOW_RGB: Record<ThemeMode, string> = { dark: '0 0 0', light: '15 23 42' };
const CELL_PADDING: Record<Tokens['density'], number> = { compact: 3, comfortable: 5, spacious: 7 };

function round2(value: number): string {
    return String(Math.round(value * 100) / 100);
}

function px(value: number): string {
    return `${round2(value)}px`;
}

/** Variables that do not depend on the mode. */
export function sharedVars(tokens: Tokens): string[] {
    const t = tokens.typography;
    const r = tokens.radius.base;
    const unit = tokens.spacing.base / 4;
    return [
        `--lumen-font-display: ${fontStack(t.display, 'ui-sans-serif, system-ui, sans-serif')};`,
        `--lumen-font-body: ${fontStack(t.body, 'ui-sans-serif, system-ui, sans-serif')};`,
        `--lumen-font-mono: ${fontStack(t.mono, 'monospace')};`,
        `--lumen-heading-weight: ${t.headingWeight};`,
        `--lumen-font-scale: ${t.scale};`,
        `--lumen-font-size: calc(13px * ${t.scale});`,
        `--lumen-font-size-sm: calc(12px * ${t.scale});`,
        `--lumen-font-size-title: calc(14px * ${t.scale});`,
        `--lumen-radius: ${r}px;`,
        // ExtJS controls are small (22-28 px high), so they get a share of the radius.
        `--lumen-radius-control: ${px(Math.min(r * 0.45, 10))};`,
        `--lumen-radius-panel: ${px(Math.min(r * 0.7, 16))};`,
        `--lumen-radius-window: ${px(Math.min(r, 20))};`,
        `--lumen-radius-pill: ${px(Math.min(r * 0.45, 10) + 2)};`,
        `--lumen-cell-py: ${px(CELL_PADDING[tokens.density] * unit)};`,
        `--lumen-gap: ${px(tokens.spacing.base * 2)};`,
    ];
}

/** Colour variables for one mode, all plain values. */
export function modeVars(tokens: Tokens, mode: ThemeMode): string[] {
    const c: ModeColors = tokens.color[mode];
    const dark = mode === 'dark';
    const lines: string[] = [`color-scheme: ${mode};`];
    for (const key of COLOR_KEYS) lines.push(`--lumen-${kebab(key)}: ${c[key]};`);

    const line = tokens.elevation.borders ? c.border : 'transparent';
    const lineSoft = tokens.elevation.borders ? mixHex(c.border, c.surface, dark ? 70 : 60) : 'transparent';
    const field = dark ? c.surfaceSunken : c.surface;
    const button = dark ? c.surfaceRaised : c.surface;
    const alpha = PVE_SHADOW_ALPHA[mode][tokens.elevation.shadow];
    const shadow = (y: number, blur: number, spread: number, factor: number) =>
        alpha === 0 ? 'none' : `0 ${y}px ${blur}px ${spread}px rgb(${PVE_SHADOW_RGB[mode]} / ${round2(alpha * factor)})`;

    const vars: [string, string][] = [
        ['line', line],
        ['line-soft', lineSoft],
        ['line-strong', mixHex(c.border, c.textMuted, dark ? 75 : 70)],
        ['field', field],
        ['field-line', mixHex(c.border, c.textMuted, dark ? 85 : 80)],
        ['button', button],
        ['button-hover', mixHex(c.text, button, dark ? 9 : 6)],
        ['hover', mixHex(c.text, c.surface, dark ? 7 : 5)],
        ['hover-sunken', mixHex(c.text, c.surfaceSunken, dark ? 7 : 5)],
        ['selected', mixHex(c.accent, c.surface, dark ? 22 : 12)],
        ['selected-strong', mixHex(c.accent, c.surface, dark ? 34 : 20)],
        ['row-alt', mixHex(c.text, c.surface, dark ? 2.5 : 2)],
        ['header-row', dark ? c.surfaceRaised : c.surfaceSunken],
        ['accent-hover', mixHex(c.accent, c.text, 88)],
        ['accent-soft', mixHex(c.accent, c.surface, dark ? 16 : 10)],
        ['invalid-bg', mixHex(c.danger, c.surface, dark ? 20 : 10)],
        ['warning-bg', mixHex(c.warning, c.surface, dark ? 18 : 12)],
        ['success-bg', mixHex(c.success, c.surface, dark ? 16 : 10)],
        ['icon', mixHex(c.text, c.textMuted, 55)],
        ['icon-muted', mixHex(c.textMuted, c.surface, 70)],
        ['mask', rgba(c.canvas, dark ? '0.62' : '0.5')],
        ['shadow-sm', shadow(1, 3, 0, 1.2)],
        ['shadow-md', shadow(8, 24, -6, 1.6)],
        ['shadow-lg', shadow(24, 56, -12, 2.2)],
        ['focus-ring', `0 0 0 2px ${rgba(c.focus, dark ? '0.55' : '0.45')}`],
        // Some ExtJS icons are black images that ignore `color`; dark mode inverts them.
        ['img-filter', dark ? 'invert(88%) hue-rotate(180deg)' : 'none'],
        ['filtered-text', dark ? '#000000' : 'inherit'],
        ['tick', tickImage(c.accentContrast)],
        ['arrow', arrowImage(c.textMuted)],
        ['spinner', spinnerImage(c.textMuted)],
        [
            'glow',
            tokens.layout.backgroundGlow
                ? `radial-gradient(1200px 520px at 8% -10%, ${rgba(c.accent, dark ? '0.12' : '0.08')}, transparent 70%), radial-gradient(900px 480px at 100% 0%, ${rgba(c.accentSecondary, dark ? '0.1' : '0.06')}, transparent 70%)`
                : 'none',
        ],
        ['primary', `linear-gradient(135deg, ${c.accent}, ${c.accentSecondary})`],
        ['primary-flat', c.accent],
    ];
    for (const [name, value] of vars) lines.push(`--lumen-${name}: ${value};`);

    // Read by the widget toolkit's charts and gauges through getComputedStyle: plain values only.
    const grid = mixHex(c.border, c.surface, 60);
    lines.push(
        `--pwt-panel-background: ${c.surface};`,
        `--pwt-text-color: ${c.text};`,
        `--pwt-gauge-default: ${c.accent};`,
        `--pwt-gauge-back: ${grid};`,
        `--pwt-gauge-warn: ${c.warning};`,
        `--pwt-gauge-crit: ${c.danger};`,
        `--pwt-chart-primary: ${c.accent};`,
        `--pwt-chart-grid-stroke: ${grid};`,
    );
    return lines;
}

function block(selector: string, lines: string[], indent = ''): string {
    return `${indent}${selector} {\n${indent}    ${lines.join(`\n${indent}    `)}\n${indent}}\n`;
}

/** True when the token fonts use the bundled family, so the CSS needs its @font-face. */
export function usesBundledFont(tokens: Tokens): boolean {
    const families = `${tokens.typography.display},${tokens.typography.body}`
        .split(',')
        .map((f) => f.trim().replace(/["']/g, '').toLowerCase());
    return families.includes(BUNDLED_FAMILY.toLowerCase());
}

function comment(text: string): string {
    return text.replace(/\*\//g, '');
}

/** Selector sets of the indicator option: how the active item in lists and tabs is marked. */
function indicatorVars(tokens: Tokens): string[] {
    switch (tokens.layout.indicator) {
        case 'bar':
            return ['--lumen-indicator-shadow: inset 3px 0 0 var(--lumen-accent);', '--lumen-indicator-radius: 0;'];
        case 'glow':
            return [
                '--lumen-indicator-shadow: inset 0 0 0 1px var(--lumen-accent), 0 0 14px -2px var(--lumen-accent);',
                '--lumen-indicator-radius: var(--lumen-radius-pill);',
            ];
        default:
            return ['--lumen-indicator-shadow: none;', '--lumen-indicator-radius: var(--lumen-radius-pill);'];
    }
}

/**
 * The complete theme file for one variant. `dark` and `light` hold one palette; `auto` holds the
 * light palette and switches to the dark one with prefers-color-scheme.
 */
export function buildTheme(tokens: Tokens, variant: Variant, options: BuildOptions): string {
    const version = options.version ?? 'dev';
    let css = '@charset "utf-8";\n';
    css +=
        `/* ${THEME_LABELS[variant]} (${THEME_NAMES[variant]}): Lumen theme for the Proxmox VE web interface.\n` +
        ` * Preset: ${comment(tokens.meta.name)}. Built by lumen-hypervisor-theme ${comment(version)} from Lumen tokens v${SCHEMA_VERSION}.\n` +
        ' * MIT licence. Not affiliated with or endorsed by Proxmox Server Solutions GmbH. */\n';
    if (tokens.typography.stylesheet !== '') css += `@import url("${tokens.typography.stylesheet}");\n`;
    if (usesBundledFont(tokens)) {
        css +=
            `@font-face {\n    font-family: "${BUNDLED_FAMILY}";\n    src: url("${FONT_FILE}") format("woff");\n` +
            '    font-weight: 100 800;\n    font-style: normal;\n    font-display: block;\n}\n';
    }
    const shared = [...sharedVars(tokens), ...indicatorVars(tokens)];
    if (variant === 'auto') {
        css += block(':root', [...shared, ...modeVars(tokens, 'light')]);
        css += '@media (prefers-color-scheme: dark) {\n';
        css += block(':root', modeVars(tokens, 'dark'), '    ');
        css += '}\n';
    } else {
        css += block(':root', [...shared, ...modeVars(tokens, variant)]);
    }
    css += options.structure.replace(/^﻿/, '');
    if (!css.endsWith('\n')) css += '\n';
    if ((options.withCustomCss ?? true) && tokens.customCss.trim() !== '') {
        css += `/* custom CSS */\n${sanitizeCustomCss(tokens.customCss)}\n`;
    }
    return css;
}

/** All three files for a token document, keyed by file name. */
export function buildAll(tokens: Tokens, options: BuildOptions): Record<string, string> {
    const out: Record<string, string> = {};
    for (const variant of VARIANTS) out[fileName(variant)] = buildTheme(tokens, variant, options);
    return out;
}
