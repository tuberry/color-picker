#!/bin/bash
# by tuberry

LC=${1:-${LANG%%.*}}
DM=$(meson setup build $(test -d build && echo -- --wipe || echo) | grep -Po '(?<=Project name: ).*')
meson compile $DM-pot -C build
grep -Fqx ${LC:?got no LC code} po/LINGUAS || (echo $LC >> po/LINGUAS; msginit --no-translator -l $LC.UTF-8 -i po/$DM.pot -o po/$LC.po)
msgmerge --backup=off -q -U po/$LC.po po/$DM.pot
echo po/$LC.po is ready!
