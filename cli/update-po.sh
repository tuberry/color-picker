#!/bin/bash
# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

set -e
set -o pipefail

if [[ -d build ]]; then
    meson setup build --wipe
else
    meson setup build
fi
LC=${1:-${LANG%%.*}}
# DM=$(gjs -c "print(JSON.parse('$(meson introspect build --projectinfo)').descriptive_name)")
DM=$(meson introspect build --projectinfo | python -c 'import sys,json; print(json.loads(sys.stdin.read())["descriptive_name"])')
meson compile "${DM:?got no pot}-pot" -C build
grep -Fqx "${LC:?got no LC code}" po/LINGUAS || (echo "$LC" >> po/LINGUAS; msginit --no-translator -l "$LC".UTF-8 -i po/"$DM".pot -o po/"$LC".po)
msgmerge --backup=off -q -U po/"$LC".po po/"$DM".pot
printf "\npo/%s.po is ready!\n" "$LC"
