# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

set lazy
set lists
set unstable
set dotenv-load # custom envs with ./.env

minify := env('_GSED_MESON_D_MINIFY', 'false')
version := env('_GSED_MESON_D_VERSION', 'true')

alias i := install
# install the extension locally
install: _setup _install

# uninstall the extension
uninstall:
    ninja -C {{ _builddir }} uninstall

alias t := translate
# initialize or update the po file from sources
[group('upsert')]
[script]
translate po=`echo "${LANG%%.*}"`: (_setup '-Dversion=false -Dminify=false')
    out="po/{{ po }}.po"
    pot=$({{ whoami() }})

    meson compile "${pot}-pot" -C "{{ _builddir }}"
    grep -Fqx "{{ po }}" po/LINGUAS || (echo "{{ po }}" >>po/LINGUAS && sort -o po/LINGUAS po/LINGUAS)

    msgmerge --backup=off -q -U "$out" "po/${pot}.pot" 2>/dev/null ||
        msginit --no-translator -l "{{ po }}.UTF-8" -i "po/${pot}.pot" -o "$out" 2>/dev/null

    stt=$(msgfmt "$out" --statistics -o /dev/null 2>&1)
    printf "\n\e[1;3%sm%s:\e[0m %s\n" "$([ "$(echo "$stt" | grep -oE '[0-9]+' | wc -l)" -gt 1 ] && echo "3" || echo "2")" "$out" "$stt"

# run the linters to format sources
lint:
    {{ env('_GSED_JS_PACKAGE_MANAGER', 'npx') }} eslint --fix src
    # just --fmt

# run the static analyzer for EGO review guidelines
[group('debug')]
audit: zip
    uvx shexli --format json "{{ _builddir }}/$({{ whoami() }}).zip"

alias debug := debug-local
# debug extension with a local session
[group('debug')]
debug-local *args: _debug-install
    dbus-run-session -- gnome-shell --devkit {{ args }}

# debug prefs with the local session
[group('debug')]
debug-prefs: _debug-install _prefs
    journalctl _CMDLINE="$(journalctl -F _CMDLINE | grep 'gjs.* -m .*org.gnome.Shell.Extensions')" --since=now -fo cat

alias d := debug-temp
# debug all with a temporary session
[group('debug')]
debug-temp *args: zip
    {{ debug-gse(args) }}

alias db := debug-toolbox
# debug all with a toolbox session
[group('debug')]
debug-toolbox *args: zip
    toolbox -c "{{ _toolbox }}" run {{ debug-gse(args) }}

# setup or update the common development environment
[group('upsert')]
devdep:
    {{ env('_GSED_JS_PACKAGE_MANAGER', 'npm') }} add -D @girs/gnome-shell eslint @stylistic/eslint-plugin

# setup or update the latest GNOME Shell Fedora toolbox
[confirm]
[group('upsert')]
[script]
toolbox: && _toolbox-update-gnome-shell
    podman pull "{{ _toolimg }}"
    [ "$(podman inspect "{{ _toolbox }}" -f '{{{{.Image}}' 2>/dev/null)" = "$(podman inspect "{{ _toolimg }}" -f '{{{{.Id}}')" ] && exit 0

    if podman container exists "{{ _toolbox }}"; then
        cid=$(podman inspect "{{ _toolbox }}" -f '{{{{.Id}}') # HACK: workaround for https://gitlab.gnome.org/chergert/ptyxis/-/work_items/56
        podman stop "{{ _toolbox }}" && toolbox rm -f "{{ _toolbox }}"
    fi

    toolbox create "{{ _toolbox }}" --image "{{ _toolimg }}"

    if [ -n "${cid:-}" ] && pids=$(flatpak run --command=gsettings app.devsuite.Ptyxis get org.gnome.Ptyxis profile-uuids 2>/dev/null); then
        for pid in $(echo "$pids" | tr -d "],'["); do
            pid="org.gnome.Ptyxis.Profile:/org/gnome/Ptyxis/Profiles/${pid}/"
            if [ "$cid" = "$(flatpak run --command=gsettings app.devsuite.Ptyxis get "$pid" default-container 2>/dev/null | tr -d "'")" ]; then
                flatpak run --command=gsettings app.devsuite.Ptyxis set "$pid" default-container "$(podman inspect "{{ _toolbox }}" -f '{{{{.Id}}')"
            fi
        done
    fi

    toolbox run -c "{{ _toolbox }}" su -c "dnf install -y --skip-unavailable glibc-langpack-${LANG%%[_.]*} {{ env('_GSED_TOOLBOX_EXTRA_PACKAGES') }}"
    toolbox run -c "{{ _toolbox }}" sh -c 'cat $(which update-mutter) | sed "\$c\  https://github.com/ptomato/jasmine-gjs.git master" | sh' # gnome shell build dep

# remove development dependencies and buliddir
[group('clean')]
clean-devdep:
    -rm -rf node_modules "{{ _builddir }}"

# remove toolbox container and image
[confirm]
[group('clean')]
clean-toolbox:
    -toolbox rm -f {{ _toolbox }}
    -toolbox rmi {{ _toolimg }}

# remove devdep and toolbox
[group('clean')]
clean: clean-devdep clean-toolbox

[default]
[private]
default:
    @just --choose

[private]
zip: (_setup '-Dtarget=zip -Dminify=false') _install

[private]
bump ver:
    sed -i "0,/version[[:space:]]*:[[:space:]]*'[^']*'/s//version: '{{ ver }}'/" meson.build
    # meson rewrite kwargs set project / version {{ ver }} # HACK: workaround for https://mesonbuild.com/Rewriter.html#limitations

[private]
_prefs:
    @gnome-extensions prefs $({{ _uuid() }})

[private]
_debug-install: (_setup "-Dversion=false") _install

[private]
compile:
    meson compile -C "{{ _builddir }}"

[private]
_install: compile
    meson install -C "{{ _builddir }}"

[private]
_setup *options:
    @meson setup "{{ _builddir }}" --reconfigure -Dtarget=local -Dversion="{{ version }}" -Dminify="{{ minify }}" {{ options }}

[private]
_toolbox-update-gnome-shell:
    @toolbox run -c "{{ _toolbox }}" sh -c 'update-mutter && cat $(which update-mutter) | sed "s#mutter#gnome-shell#g" | sh'

[private]
uuid:
    @{{ _uuid() }}

[private]
_builddir := 'build'
[private]
_toolbox := env('_GSED_TOOLBOX_CONTAINER_NAME', 'gnome-shell-devel') # the same name as the upstream to reuse some scripts easier
[private]
_toolimg := 'registry.gitlab.gnome.org/gnome/gnome-shell/toolbox:main' # https://gitlab.gnome.org/GNOME/gnome-shell/container_registry/2626
[private]
_toolenv := ['env', 'GTK_A11Y=none', 'GDK_DEBUG=no-portals', 'ADW_DISABLE_PORTAL=1', f'_GSED_DEVKIT_DCONF_PATH={{ env('_GSED_DEVKIT_DCONF_PATH') }}', `echo ":$XDG_DATA_DIRS:" | grep -q ":/usr/share/:" || echo XDG_DATA_DIRS="${XDG_DATA_DIRS:+$XDG_DATA_DIRS:}/usr/share/"`]
# _GSED_DEVKIT_DCONF_PATH: DConf keyfile settings for temporary sessions, such as setting the default shell for the GNOME Console
# GTK_A11Y*: ignore Atspi errors, flatpak Document portal issues, speed up startup, etc. see also https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/5095
# XDG_DATA_DIRS: for non-FHS hosts like NixOS

_uuid() := f'cat "./{{ _builddir }}/res/data/metadata.json" | {{ jq("uuid") }}'
whoami() := f'meson introspect "{{ _builddir }}" --projectinfo | {{ jq("descriptive_name") }}'
jq(key) := f'python3 -c "import sys,json; print(json.load(sys.stdin)[sys.argv[1]])" "{{ key }}"'
debug-gse(args) := f'{{ _toolenv }} gnome-shell-test-tool --devkit --wrap=dbus-run-session --extension="{{ _builddir }}/$({{ whoami() }}).zip" {{ args }} ./cli/manual.js'
