#!/usr/bin/env python
# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

import json
import argparse
from urllib import request, parse

def main():
    ap = argparse.ArgumentParser(description='Get GNOME extension version')
    ap.add_argument('uuid', help='extension uuid')
    ap.add_argument('shell_version', help='GNOME Shell version')

    try:
        arg = ap.parse_args()
        with request.urlopen(f'https://extensions.gnome.org/extension-info/?{parse.urlencode(vars(arg))}') as ans:
            svm = json.loads(ans.read().decode('utf-8'))['shell_version_map']
        try:
            print(svm[arg.shell_version]['version'])
        except:
            print(max(x['version'] for x in svm.values()))
    except:
        print(1) # fallback version

if __name__ == '__main__':
    main()

