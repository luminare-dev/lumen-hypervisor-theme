# Customizing

## The customizer

Open [`customizer/index.html`](../customizer/index.html) in a browser (download it, or use the
GitHub Pages copy of this repository). It is one file with everything inline and a strict content
security policy: no network requests, nothing is uploaded.

- **Presets:** Luminare (default), Graphite, Aurora and High contrast.
- **Import / Export tokens:** the Lumen token JSON, the same format as the Lumen themes for
  Hydrodactyl, Pterodactyl and Chrome. Import checks every value and lists the ones it replaced.
- **Colours:** 16 roles per mode, with colour picker and hex field; pairs below WCAG 2.2 AA are
  listed. Switch Dark/Light above the preview to edit the other palette.
- **Typography:** text, title and code font, text size, title weight. Sora ships with the theme;
  any other font must be installed on the computers that open the interface, or loaded with
  `typography.stylesheet` (an https URL in the token file; the preview cannot load it).
- **Shape and layout:** corner radius (controls, panels and windows get a share of it), spacing
  unit and row density (grid row padding), shadows, borders, active-item style (pill, bar, glow),
  background glow, custom CSS.
- **Preview:** a mock-up of the interface (summary, hardware, create wizard, console, login),
  built from the interface's own ExtJS class names, styled by exactly the theme file you would
  download.
- **Files:** the ZIP holds `theme-lumen-dark.css`, `theme-lumen-light.css`,
  `theme-lumen-auto.css`, `lumen-sora.woff` with its licence, the picker page `lumen-theme.html`,
  `install.sh` and your token file. Install it as in [install.md](install.md).

## Token mapping

| Token | In the interface |
|---|---|
| `color.<mode>.canvas` | page background, header, splitters |
| `surface`, `surfaceSunken`, `surfaceRaised` | panels and grids; group headers and fields (dark); menus, tooltips, column headers (dark) |
| `border` | panel, field and row lines (`elevation.borders: false` hides them) |
| `text`, `textMuted` | text; labels, column headers, inactive tabs |
| `accent`, `accentSecondary`, `accentContrast` | primary buttons (gradient), selection tint, active tab bar, progress bars, charts |
| `accentText` | links, active tab and navigation text |
| `success`, `warning`, `danger`, `info` | guest status badges, gauges, invalid rows and fields, task log colours |
| `focus` | keyboard focus rings |
| `typography.*` | fonts, `scale` on the 13 px base, title weight |
| `radius.base`, `spacing.base`, `density` | corners; grid row padding |
| `elevation.shadow`, `layout.indicator`, `layout.backgroundGlow` | window and menu shadows; active item style; page glow |
| `customCss` | appended to every theme file (`<` is escaped) |

Not used by this theme: `mode.*` (each file is one mode, `lumen-auto` follows the system),
`layout.sidebar`, `layout.sidebarWidth`, `layout.contentWidth` (ExtJS sizes its regions itself)
and `branding.*` (the header keeps the product's own logo).

## Building from the command line

Node 22.13 or newer, no packages:

```bash
node scripts/build.mjs                              # dist/ (Luminare) and customizer/index.html
node scripts/build.mjs --tokens my.json --out out/  # your own token file
node scripts/build.mjs --all out/                   # every preset
./install.sh --src out/ --yes
```

## Custom CSS tips

Use the variables, so your rules follow the mode and later token changes:

```css
.x-panel-header-default { border-bottom: 2px solid var(--lumen-accent); }
.x-grid-item-selected { background-color: var(--lumen-selected-strong); }
```

The variables are listed at the top of every theme file (`--lumen-*`, plus the `--pwt-*` chart
colours the toolkit reads).
