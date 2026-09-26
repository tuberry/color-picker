#!/usr/bin/env -S gjs -m
// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Sys from 'system';
import GLib from 'gi://GLib';
import * as T from '../src/util.js';

if(!ARGV[0]) {
    print('USAGE: local.js UUID [SHELL_VERSION]');
    Sys.exit(1);
}

let [uuid, shell_version] = ARGV;
let dir = GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', uuid]);
print(dir); // https://docs.gtk.org/glib/func.get_user_data_dir.html

try {
    if(shell_version) throw Error('request');
    let {version: ver} = JSON.parse(T.decode((await T.fread(`${dir}/metadata.json`))[0]));
    if(ver) print(ver);
} catch {
    try {
        let {shell_version_map: svm} = JSON.parse(await T.request('https://extensions.gnome.org/extension-info/', null, {uuid, shell_version}));
        print(svm[shell_version]?.version ?? Object.values(svm).reduce((p, x) => p.version > x.version ? p : x).version);
    } catch {
        print(1); // fallback version
    }
}
