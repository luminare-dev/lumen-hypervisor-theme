"""Theme checks that need only python3, node (22.13+), bash and perl."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
NODE = ["node", "--experimental-strip-types", "--no-warnings"]
# pveproxy's check for PVEThemeCookie (PVE/Service/pveproxy.pm).
PVEPROXY_THEME = re.compile(r"^[a-z]{1,10}(-[a-z]{1,10}){0,5}$")


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=False, **kw)


def node_ok() -> bool:
    if not shutil.which("node"):
        return False
    m = re.match(r"v(\d+)\.(\d+)", run(["node", "--version"]).stdout)
    return bool(m) and (int(m.group(1)), int(m.group(2))) >= (22, 13)


HAS_NODE = node_ok()


class Shared(unittest.TestCase):
    def test_shared_code_matches_the_lock(self):
        result = run(["python3", "scripts/check_shared.py", "verify"])
        self.assertEqual(result.returncode, 0, result.stderr)


@unittest.skipUnless(HAS_NODE, "needs node >= 22.13")
class Build(unittest.TestCase):
    def test_dist_and_customizer_are_up_to_date(self):
        result = run(["node", "--no-warnings", "scripts/build.mjs", "--check"])
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_modules_and_page_bundle_write_the_same_css(self):
        result = run(NODE + ["tests/parity.mjs"])
        self.assertEqual(result.returncode, 0, result.stdout[-2000:] + result.stderr)

    def test_all_presets_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = run(["node", "--no-warnings", "scripts/build.mjs", "--all", tmp])
            self.assertEqual(result.returncode, 0, result.stderr)
            for preset in ["luminare", "graphite", "aurora", "contrast"]:
                for variant in ["dark", "light", "auto"]:
                    self.assertTrue((Path(tmp) / preset / f"theme-lumen-{variant}.css").is_file())


class Css(unittest.TestCase):
    def css(self, variant: str) -> str:
        return (DIST / f"theme-lumen-{variant}.css").read_text(encoding="utf-8")

    def test_theme_names_pass_pveproxy(self):
        for path in DIST.glob("theme-*.css"):
            self.assertRegex(path.stem.removeprefix("theme-"), PVEPROXY_THEME)

    def test_braces_balance_and_no_markup(self):
        for variant in ["dark", "light", "auto"]:
            text = re.sub(r"/\*.*?\*/", "", self.css(variant), flags=re.S)
            self.assertEqual(text.count("{"), text.count("}"), variant)
            self.assertNotIn("<", text, variant)

    def test_every_variable_is_defined(self):
        structure = (ROOT / "src" / "structure.css").read_text(encoding="utf-8")
        used = set(re.findall(r"var\((--[\w-]+)", structure))
        for variant in ["dark", "light", "auto"]:
            defined = set(re.findall(r"^\s*(--[\w-]+):", self.css(variant), flags=re.M))
            self.assertEqual(sorted(used - defined), [], variant)

    def test_chart_colours_are_plain_values(self):
        """The toolkit's charts read --pwt-* through getComputedStyle: no var() or color-mix()."""
        for variant in ["dark", "light", "auto"]:
            for name, value in re.findall(r"(--pwt-[\w-]+):\s*([^;]+);", self.css(variant)):
                self.assertRegex(value.strip(), r"^#[0-9A-F]{6}$", f"{variant} {name}")

    def test_structure_has_no_colour_values(self):
        structure = (ROOT / "src" / "structure.css").read_text(encoding="utf-8")
        body = re.sub(r"/\*.*?\*/", "", structure, flags=re.S)
        # The console frame is black in every theme, like the terminal page inside it.
        hexes = set(re.findall(r"#[0-9A-Fa-f]{3,8}\b", body)) - {"#000000"}
        self.assertEqual(hexes, set())

    def test_auto_switches_with_the_system(self):
        self.assertIn("@media (prefers-color-scheme: dark)", self.css("auto"))
        self.assertIn("color-scheme: dark;", self.css("dark"))
        self.assertIn("color-scheme: light;", self.css("light"))


TOOLKIT = "usr/share/javascript/proxmox-widget-toolkit"
LIB_PRETTIER = """Ext.ns('Proxmox');
Proxmox.Utils = {
    // test fixture in the shape of the toolkit's Utils.js
    utilities: {
        theme_map: {
            crisp: 'Light theme',
            'proxmox-dark': 'Proxmox Dark',
        },

        render_theme: function (value) {
            return Proxmox.Utils.theme_map[value] || value;
        },
    },
};
"""
LIB_ONE_LINE = "var Proxmox = { Utils: { theme_map: { crisp: 'Light theme', 'proxmox-dark': 'Proxmox Dark' } } };\n"


class Installer(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="lumen-root-"))
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        (self.root / TOOLKIT / "themes").mkdir(parents=True)
        self.lib = self.root / TOOLKIT / "proxmoxlib.js"
        self.lib.write_text(LIB_PRETTIER, encoding="utf-8")
        self.themes = self.root / TOOLKIT / "themes"

    def sh(self, *args):
        env = dict(os.environ, LUMEN_ROOT=str(self.root))
        return subprocess.run(["bash", str(ROOT / "install.sh"), "--src", str(DIST), *args],
                              cwd=ROOT, capture_output=True, text=True, env=env, check=False)

    def snapshot(self):
        return {p.relative_to(self.root).as_posix(): p.read_bytes() for p in self.root.rglob("*") if p.is_file()}

    def test_dry_run_changes_nothing(self):
        before = self.snapshot()
        result = self.sh("--register", "--hook")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Dry run", result.stdout)
        self.assertEqual(self.snapshot(), before)
        result = self.sh("--uninstall")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_install_copies_files_only(self):
        result = self.sh("--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        for name in ["theme-lumen-dark.css", "theme-lumen-light.css", "theme-lumen-auto.css", "lumen-sora.woff",
                     "lumen-theme.html"]:
            self.assertEqual((self.themes / name).read_bytes(), (DIST / name).read_bytes(), name)
        self.assertEqual(self.lib.read_text(encoding="utf-8"), LIB_PRETTIER)
        self.assertFalse((self.root / "etc").exists())

    def test_register_hook_reapply_and_uninstall(self):
        result = self.sh("--yes", "--register", "--hook")
        self.assertEqual(result.returncode, 0, result.stderr)
        patched = self.lib.read_text(encoding="utf-8")
        for name in ["lumen-dark", "lumen-light", "lumen-auto"]:
            self.assertIn(f"'{name}':", patched)
        self.assertIn("'proxmox-dark': 'Proxmox Dark',", patched)
        if shutil.which("node"):
            self.assertEqual(run(["node", "--check", str(self.lib)]).returncode, 0)
        hook = (self.root / "etc/apt/apt.conf.d/99lumen-hypervisor-theme").read_text(encoding="utf-8")
        self.assertIn("DPkg::Post-Invoke", hook)
        self.assertIn("--reapply --yes --quiet", hook)

        # Idempotent.
        self.assertEqual(self.sh("--yes", "--register").returncode, 0)
        self.assertEqual(self.lib.read_text(encoding="utf-8"), patched)

        # A package update replaces the library and (in the worst case) loses the files.
        self.lib.write_text(LIB_PRETTIER, encoding="utf-8")
        (self.themes / "theme-lumen-dark.css").unlink()
        env = dict(os.environ, LUMEN_ROOT=str(self.root))
        saved = self.root / "usr/local/lib/lumen-hypervisor-theme/install.sh"
        result = subprocess.run(["bash", str(saved), "--reapply", "--yes", "--quiet"], capture_output=True, text=True,
                                env=env, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lib.read_text(encoding="utf-8"), patched)
        self.assertTrue((self.themes / "theme-lumen-dark.css").is_file())

        result = self.sh("--uninstall", "--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.lib.read_text(encoding="utf-8"), LIB_PRETTIER)
        self.assertEqual(sorted(p.name for p in self.themes.iterdir()), [])
        self.assertFalse((self.root / "etc/apt/apt.conf.d/99lumen-hypervisor-theme").exists())
        self.assertFalse((self.root / "usr/local/lib/lumen-hypervisor-theme").exists())
        self.assertTrue(any((self.root / "var/backups/lumen-hypervisor-theme").rglob("proxmoxlib.js")))

    def test_one_line_map_without_trailing_comma(self):
        self.lib.write_text(LIB_ONE_LINE, encoding="utf-8")
        self.assertEqual(self.sh("--yes", "--register").returncode, 0)
        if shutil.which("node"):
            check = run(["node", "-e", f"eval(require('fs').readFileSync({str(self.lib)!r},'utf8'));"
                                       "const m=Proxmox.Utils.theme_map;"
                                       "if(m['lumen-dark']!=='Lumen Dark'||m.crisp!=='Light theme')process.exit(1)"])
            self.assertEqual(check.returncode, 0, check.stderr)
        self.assertEqual(self.sh("--uninstall", "--yes").returncode, 0)
        self.assertEqual(self.lib.read_text(encoding="utf-8"), LIB_ONE_LINE)

    def test_refuses_without_toolkit(self):
        shutil.rmtree(self.root / "usr")
        result = self.sh("--yes")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("is this a Proxmox VE node", result.stderr)

    def test_unknown_option(self):
        self.assertNotEqual(self.sh("--force").returncode, 0)


if __name__ == "__main__":
    unittest.main()
