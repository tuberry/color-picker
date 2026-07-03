#!/usr/bin/env python3
# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

import json
import argparse
from gi.repository import GLib
from urllib import request, parse

def main():
    ap = argparse.ArgumentParser(description='Target a local GNOME Shell extension')
    ap.add_argument('uuid', help='the GNOME Shell extension uuid')
    ap.add_argument('shell_version', help='the GNOME Shell version')

    arg = ap.parse_args()
    dir = GLib.build_filenamev([GLib.get_user_data_dir(), f'gnome-shell/extensions/{arg.uuid}'])
    print(dir) # https://docs.gtk.org/glib/func.get_user_data_dir.html

    try:
        if arg.shell_version:
            raise Exception('request')
        with open(f'{dir}/metadata.json', 'r') as f:
            ver = json.loads(f.read()).get('version')
    except:
        try:
            with request.urlopen(f'https://extensions.gnome.org/extension-info/?{parse.urlencode(vars(arg))}', timeout=10) as f:
                svm = json.loads(f.read().decode('utf-8'))['shell_version_map']
            try:
                ver = svm[arg.shell_version]['version']
            except:
                ver = max(x['version'] for x in svm.values())
        except:
            ver = 1 # fallback version
    if ver:
        print(ver)

if __name__ == '__main__':
    main()

