# Installing

The theme is three CSS files, a font and a small picker page in the widget toolkit's themes
directory, `/usr/share/javascript/proxmox-widget-toolkit/themes/`. The web interface serves that
directory as `/pwt/themes/` and loads `theme-<name>.css` for the theme named in the
`PVEThemeCookie` cookie. pveproxy accepts any kebab-case name there, so no Proxmox file has to
change. Tested against the sources of Proxmox VE 9.2 (proxmox-widget-toolkit, pve-manager).

Back up first if you are unsure; the installer keeps its own backups in
`/var/backups/lumen-hypervisor-theme/`.

## 1. Get the files

Either clone the repository on the node (the Luminare preset is prebuilt in `dist/`):

```bash
git clone https://github.com/luminare-dev/lumen-hypervisor-theme.git
cd lumen-hypervisor-theme
```

or build your own look in the [customizer](customize.md), download the ZIP, copy it to the node
and unzip it:

```bash
unzip lumen-hypervisor-theme-*.zip
cd lumen-hypervisor-theme
```

## 2. Run the installer

```bash
./install.sh            # dry run: prints every step, changes nothing
./install.sh --yes      # copies the files (as root)
```

Without `--yes` the installer never changes anything. Existing files it would replace are copied
to `/var/backups/lumen-hypervisor-theme/<date>-<pid>/` first. No service restart is needed.

## 3. Choose the theme

The choice is per browser, like the built-in themes.

- Open `https://<node>:8006/pwt/themes/lumen-theme.html` and click **Lumen Dark**, **Lumen
  Light**, **Lumen, following the system setting** or **Default theme**. The page sets the cookie
  and opens the interface.
- Or, in the browser console on the interface:
  `document.cookie = "PVEThemeCookie=lumen-dark; path=/; max-age=315360000; SameSite=Lax; Secure"; location.reload()`

The built-in **Color Theme** dialog does not know the Lumen names unless you register them
(next step); after picking Lumen through the page it shows "Default (auto)", and pressing
**Apply** there switches back to a built-in theme.

## 4. Optional: list the themes in the Color Theme dialog

The dialog's list is hardcoded in the widget toolkit (`Proxmox.Utils.theme_map` in
`proxmoxlib.js`). `--register` adds three entries there; every added line ends with the comment
`/* lumen-hypervisor-theme */`, so they can be removed exactly:

```bash
./install.sh --register            # dry run
./install.sh --yes --register
```

Reload the interface once with Ctrl+F5 (the browser caches `proxmoxlib.js`), then pick the theme
under **user menu → Color Theme**.

This edits a file of the `proxmox-widget-toolkit` package (AGPL-3.0) on your node, and the next
update of that package replaces the file, which removes the entries again. The theme files
themselves are not touched by updates.

## 5. Optional: re-apply after package updates

```bash
./install.sh --yes --register --hook
```

`--hook` keeps a copy of the theme files and the installer in
`/usr/local/lib/lumen-hypervisor-theme/` and writes
`/etc/apt/apt.conf.d/99lumen-hypervisor-theme`:

```text
DPkg::Post-Invoke { "if [ -x /usr/local/lib/lumen-hypervisor-theme/install.sh ]; then /usr/local/lib/lumen-hypervisor-theme/install.sh --reapply --yes --quiet || true; fi"; };
```

After every `apt` or `dpkg` run it copies the theme files back if they are missing or changed
and, if you chose `--register`, adds the dialog entries again. It never fails the package run.
`--hook` without `--register` only keeps the files in place.

## Updating the theme

Run the installer again with the new files (from `git pull` or a new customizer ZIP), with the
same options. Changed files are backed up and replaced; unchanged ones are skipped.

## Uninstall

```bash
./install.sh --uninstall           # dry run
./install.sh --uninstall --yes
```

This removes the theme files, the dialog entries, the apt hook and the saved copy. Backups stay in
`/var/backups/lumen-hypervisor-theme/`. Browsers that still have a `lumen-*` cookie get the
default look; choose a theme in the Color Theme dialog to clear it.

## Notes

- A cluster: install on every node you open the interface on; files in `/usr/share` are not
  synchronised by the cluster file system.
- Proxmox Backup Server and Proxmox Mail Gateway use the same widget toolkit and themes directory
  with their own cookie names; the theme is written for Proxmox VE and not tested there.
- Options: `./install.sh --help`.
