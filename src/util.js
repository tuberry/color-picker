// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Json from 'gi://Json';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup/?version=3.0';

Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

export const ROOT = GLib.path_get_dirname(import.meta.url.slice(7));
export const PIPE = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
export const BIND = GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE;

export const id = x => x;
export const noop = () => {};
export const xnor = (x, y) => !x === !y;
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const has = (o, ...xs) => xs.every(x => x in o);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const nonEq = (x, y) => x instanceof Object && y instanceof Object;
export const array = (n, f = id) => Array.from({length: n}, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const cancelled = e => e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const hook = (o, a) => (Object.entries(o).forEach(([k, v]) => a.connect(k, v)), a);
export const pickle = o => Json.gvariant_deserialize(Json.from_string(JSON.stringify(o)), null);
export const gprops = o => omap(o, ([k, [x, ...ys]]) => [[k, GObject.ParamSpec[x](k, k, k, GObject.ParamFlags.READWRITE, ...ys)]]);

export const fquery = (x, ...ys) => fopen(x).query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fwrite = (x, y, c = null) => fopen(x).replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, c);
export const fcopy = (x, y, c = null) => fopen(x).copy_async(fopen(y), Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, c, null);
export const mkdir = (x, c = null) => fopen(x).make_directory_async(GLib.PRIORITY_DEFAULT, c);
export const fdelete = (x, c = null) => fopen(x).delete_async(GLib.PRIORITY_DEFAULT, c);
export const fopen = x => x instanceof Gio.File ? x : Gio.File.new_for_path(x);
export const fread = (x, c = null) => fopen(x).load_contents_async(c);

export async function readdir(dir, func, cancel = null) {
    return Array.fromAsync(await fopen(dir).enumerate_children_async(Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel), func);
}

export function homolog(a, b, f = (x, y, _k) => homolog(x, y, f, g, _k), g = (x, y, _k) => x === y, k) { // a, b: JSON val
    return nonEq(a, b) ? Object.getOwnPropertyNames(a).every(x => f(a[x], b[x], x)) : g(a, b, k);
}

export async function request(method, url, param, session = new Soup.Session(), cancel = null) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    let ans = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancel);
    if(msg.statusCode !== Soup.Status.OK) throw Error(msg.get_reason_phrase());
    return decode(ans.get_data());
}

export async function execute(cmd, env, tty = new Gio.SubprocessLauncher({flags: PIPE}), cancel = null) {
    if(env) Object.entries(env).forEach(([k, v]) => tty.setenv(k, v, true));
    let proc = tty.spawnv(['bash', '-c', cmd]),
        [stdout, stderr] = await proc.communicate_utf8_async(null, cancel),
        status = proc.get_exit_status();
    if(status) throw Error(stderr?.trimEnd() ?? '', {cause: {status, cmdline: cmd}});
    return stdout?.trimEnd() ?? '';
}
