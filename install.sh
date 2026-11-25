#!/usr/bin/env bash
# Lumen theme for the Proxmox VE web interface: installer.
#
# Copies the Lumen theme files into the widget toolkit's themes directory, where the web
# interface loads /pwt/themes/theme-<name>.css for the theme named in the PVEThemeCookie cookie.
# It changes no Proxmox file unless you ask for --register.
#
#   ./install.sh                      show what would happen (dry run, changes nothing)
#   ./install.sh --yes                install the theme files
#   ./install.sh --yes --register     also add the Lumen themes to the "Color Theme" dialog
#                                     (patches proxmoxlib.js; see docs/install.md)
#   ./install.sh --yes --hook         also re-apply after every package update (apt hook)
#   ./install.sh --uninstall [--yes]  remove everything this script added
#
# Options:
#   --yes        make the changes (without it every run is a dry run)
#   --register   patch Proxmox.Utils.theme_map in proxmoxlib.js so the dialog lists the themes
#   --hook       install an apt DPkg::Post-Invoke hook that re-applies the files (and the
#                --register patch, if chosen) after package updates
#   --uninstall  remove the theme files, the patch, the hook and the saved copy
#   --reapply    used by the apt hook: re-apply from the saved copy with the saved options
#   --src DIR    where the theme files are (default: the script's directory, or its dist/)
#   --quiet      print only problems
#   -h, --help   this help
#
# MIT licence. Not affiliated with or endorsed by Proxmox Server Solutions GmbH.
set -euo pipefail

NAME="lumen-hypervisor-theme"
ROOT="${LUMEN_ROOT:-}"   # a prefix for every system path; only the tests set it
TOOLKIT="$ROOT/usr/share/javascript/proxmox-widget-toolkit"
THEMES="$TOOLKIT/themes"
LIB="$TOOLKIT/proxmoxlib.js"
STATE="$ROOT/usr/local/lib/$NAME"
BACKUPS="$ROOT/var/backups/$NAME"
HOOK="$ROOT/etc/apt/apt.conf.d/99$NAME"
MARK="/* $NAME */"
FILES=(theme-lumen-dark.css theme-lumen-light.css theme-lumen-auto.css lumen-sora.woff lumen-theme.html)
REQUIRED=(theme-lumen-dark.css theme-lumen-light.css)

yes=0 register=0 hook=0 uninstall=0 reapply=0 quiet=0 src=""

usage() { sed -n '2,/^set -euo/p' "$0" | sed -e '$d' -e 's/^# \{0,1\}//'; }
say() { [ "$quiet" = 1 ] || printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
    case "$1" in
        --yes) yes=1 ;;
        --register) register=1 ;;
        --hook) hook=1 ;;
        --uninstall) uninstall=1 ;;
        --reapply) reapply=1 ;;
        --quiet) quiet=1 ;;
        --src) [ $# -ge 2 ] || die "--src needs a directory"; src="$2"; shift ;;
        -h | --help) usage; exit 0 ;;
        *) die "unknown option: $1 (see --help)" ;;
    esac
    shift
done

# Dry run: print the action; with --yes: print and run it.
run() {
    if [ "$yes" = 1 ]; then
        say "  $*"
        "$@"
    else
        say "  would: $*"
    fi
}

need_root() {
    if [ "$yes" = 1 ] && [ -z "$ROOT" ] && [ "$(id -u)" != 0 ]; then
        die "run as root (or without --yes for a dry run)"
    fi
}

stamp=""
backup() { # backup FILE: keep a copy before it is replaced or removed
    local file="$1"
    [ -e "$file" ] || return 0
    [ -n "$stamp" ] || stamp="$(date +%Y%m%d-%H%M%S)-$$"
    run mkdir -p "$BACKUPS/$stamp"
    run cp -p "$file" "$BACKUPS/$stamp/"
}

is_patched() { [ -f "$LIB" ] && grep -qF "$MARK" "$LIB"; }

# Adds the Lumen themes as the last entries of Proxmox.Utils.theme_map. Every added line carries
# the marker comment, so unpatch() can remove exactly those lines again.
patch_lib() {
    [ -f "$LIB" ] || die "$LIB not found: is this a Proxmox VE node?"
    if is_patched; then
        say "  theme list already has the Lumen entries"
        return 0
    fi
    grep -Eq 'theme_map[[:space:]]*:[[:space:]]*\{' "$LIB" || die "no theme_map in $LIB: this toolkit version is not supported by --register"
    backup "$LIB"
    if [ "$yes" != 1 ]; then
        say "  would: add 'lumen-dark', 'lumen-light' and 'lumen-auto' to Proxmox.Utils.theme_map in $LIB"
        return 0
    fi
    say "  adding the Lumen themes to Proxmox.Utils.theme_map in $LIB"
    LUMEN_MARK="$MARK" perl -0pi -e '
        my $m = $ENV{LUMEN_MARK};
        my $n = s{(theme_map\s*:\s*\{)([^{}]*?)(,?)([ \t]*\n?[ \t]*\})}{
            my ($open, $body, $comma, $close) = ($1, $2, $3, $4);
            my ($indent) = $body =~ /\n([ \t]+)\S[^\n]*\z/;
            $indent //= "    ";
            my $add = $comma eq "," ? "" : "\n$indent, $m";
            $add .= "\n$indent\x27lumen-dark\x27: \x27Lumen Dark\x27, $m";
            $add .= "\n$indent\x27lumen-light\x27: \x27Lumen Light\x27, $m";
            $add .= "\n$indent\x27lumen-auto\x27: \x27Lumen (follow system)\x27, $m";
            "$open$body$comma$add$close";
        }se;
        die "theme_map not found\n" unless $n;
    ' "$LIB"
    is_patched || die "patching $LIB failed"
}

unpatch_lib() {
    if ! is_patched; then
        say "  theme list has no Lumen entries"
        return 0
    fi
    backup "$LIB"
    if [ "$yes" != 1 ]; then
        say "  would: remove the Lumen entries from Proxmox.Utils.theme_map in $LIB"
        return 0
    fi
    say "  removing the Lumen entries from Proxmox.Utils.theme_map in $LIB"
    LUMEN_MARK="$MARK" perl -0pi -e 'my $m = quotemeta $ENV{LUMEN_MARK}; s/\n[^\n]*?$m//g' "$LIB"
}

find_src() {
    local base
    if [ -n "$src" ]; then
        base="$src"
    else
        base="$(cd "$(dirname "$0")" && pwd)"
        [ -f "$base/theme-lumen-dark.css" ] || base="$base/dist"
    fi
    for f in "${REQUIRED[@]}"; do
        [ -f "$base/$f" ] || die "$base/$f not found (build with: node scripts/build.mjs, or use --src)"
    done
    printf '%s' "$base"
}

copy_files() { # copy_files FROM
    local from="$1" f
    run mkdir -p "$THEMES"
    for f in "${FILES[@]}"; do
        [ -f "$from/$f" ] || continue
        if [ -f "$THEMES/$f" ] && cmp -s "$from/$f" "$THEMES/$f"; then
            say "  $THEMES/$f is up to date"
            continue
        fi
        backup "$THEMES/$f"
        run install -m 0644 "$from/$f" "$THEMES/$f"
    done
}

save_state() { # keep a copy for the apt hook
    local from="$1" f
    run mkdir -p "$STATE"
    for f in "${FILES[@]}"; do
        [ -f "$from/$f" ] || continue
        [ "$from/$f" -ef "$STATE/$f" ] && continue
        run install -m 0644 "$from/$f" "$STATE/$f"
    done
    [ "$0" -ef "$STATE/install.sh" ] || run install -m 0755 "$0" "$STATE/install.sh"
    if [ "$yes" = 1 ]; then
        printf 'register=%s\n' "$register" >"$STATE/options"
    else
        say "  would: write register=$register to $STATE/options"
    fi
}

write_hook() {
    local content
    content="// $NAME: re-apply the Lumen theme files after package updates (see docs/install.md).
// Remove with: $STATE/install.sh --uninstall --yes
DPkg::Post-Invoke { \"if [ -x $STATE/install.sh ]; then $STATE/install.sh --reapply --yes --quiet || true; fi\"; };"
    if [ -f "$HOOK" ] && [ "$(cat "$HOOK")" = "$content" ]; then
        say "  $HOOK is up to date"
        return 0
    fi
    if [ "$yes" = 1 ]; then
        say "  writing $HOOK"
        mkdir -p "$(dirname "$HOOK")"
        printf '%s\n' "$content" >"$HOOK"
    else
        say "  would: write $HOOK (DPkg::Post-Invoke runs $STATE/install.sh --reapply)"
    fi
}

do_install() {
    local from
    from="$(find_src)"
    [ -d "$TOOLKIT" ] || die "$TOOLKIT not found: is this a Proxmox VE node?"
    say "Theme files from $from -> $THEMES"
    copy_files "$from"
    if [ "$register" = 1 ]; then
        say "Theme list:"
        patch_lib
    fi
    if [ "$hook" = 1 ]; then
        say "Re-apply after package updates:"
        save_state "$from"
        write_hook
    fi
    if [ "$yes" = 1 ]; then
        say ""
        say "Done. Pick the theme:"
        if [ "$register" = 1 ]; then
            say "  user menu (top right) -> Color Theme -> Lumen Dark / Lumen Light (reload with Ctrl+F5 once)"
        fi
        say "  or open https://<node>:8006/pwt/themes/lumen-theme.html and choose a theme"
    else
        say ""
        say "Dry run: nothing was changed. Add --yes to apply."
    fi
}

do_reapply() {
    [ -d "$STATE" ] || die "$STATE not found: nothing to re-apply"
    [ -d "$TOOLKIT" ] || exit 0  # toolkit removed: nothing to do
    if [ -f "$STATE/options" ] && grep -qx 'register=1' "$STATE/options"; then
        register=1
    fi
    copy_files "$STATE"
    if [ "$register" = 1 ]; then patch_lib; fi
}

do_uninstall() {
    local f
    say "Theme files in $THEMES:"
    for f in "${FILES[@]}"; do
        if [ -e "$THEMES/$f" ]; then
            run rm -f "$THEMES/$f"
        fi
    done
    say "Theme list:"
    unpatch_lib
    say "Apt hook and saved copy:"
    if [ -e "$HOOK" ]; then run rm -f "$HOOK"; fi
    if [ -d "$STATE" ]; then run rm -rf "$STATE"; fi
    if [ "$yes" = 1 ]; then
        say ""
        say "Removed. Browsers that still have PVEThemeCookie=lumen-* show the default look; pick"
        say "another theme in the Color Theme dialog. Backups stay in $BACKUPS."
    else
        say ""
        say "Dry run: nothing was changed. Add --yes to remove."
    fi
}

need_root
if [ "$uninstall" = 1 ]; then
    do_uninstall
elif [ "$reapply" = 1 ]; then
    do_reapply
else
    do_install
fi
