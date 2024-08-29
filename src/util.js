// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
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
export const seq = (f, x) => (f(x), x);
export const xnor = (x, y) => !x === !y;
export const Y = f => (...xs) => f(Y(f))(...xs); // Y combinator
export const string = x => x?.constructor === String;
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const has = (o, ...xs) => xs.every(x => Object.hasOwn(o, x));
export const array = (n, f = id) => Array.from({length: n}, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const fquery = (x, ...ys) => fopen(x).query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fwrite = (x, y, c = null) => fopen(x).replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, c);
export const fcopy = (x, y, c = null) => fopen(x).copy_async(fopen(y), Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, c, null);
export const mkdir = (x, c = null) => fopen(x).make_directory_async(GLib.PRIORITY_DEFAULT, c);
export const fdelete = (x, c = null) => fopen(x).delete_async(GLib.PRIORITY_DEFAULT, c);
export const fopen = x => x instanceof Gio.File ? x : Gio.File.new_for_path(x);
export const fread = (x, c = null) => fopen(x).load_contents_async(c);

/**
 * @template T
 * @param {T} a
 * @return {T}
 */
export const hook = (o, a) => (Object.entries(o).forEach(([k, v]) => a.connect(k, v)), a);

export async function readdir(dir, func, attr = Gio.FILE_ATTRIBUTE_STANDARD_NAME, cancel = null) {
    return Array.fromAsync(await fopen(dir).enumerate_children_async(attr, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel), func);
}

export function homolog(cat, dog, keys, cmp = (x, y, _k) => x === y) { // cat, dog: JSON-compatible object
    let list = (f, x, y) => x.length === y.length && f(x),
        dict = keys ? f => f(keys) : (f, x, y) => list(f, Object.keys(x), Object.keys(y)),
        type = (x, y) => (t => t === Object.prototype.toString.call(y) ? t : NaN)(Object.prototype.toString.call(x));
    return Y(f => (a, b, k) => {
        switch(type(a, b)) {
        case '[object Array]': return list(() => a.every((x, i) => f(x, b[i])), a, b);
        case '[object Object]': return dict(xs => xs.every(x => f(a[x], b[x])), a, b);
        default: return cmp(a, b, k);
        }
    })(cat, dog);
}

export function pickle(value, tuple = true, number = 'u') { // value: JSON-compatible and non-nullish
    let list = tuple ? x => GLib.Variant.new_tuple(x) : x => new GLib.Variant('av', x);
    return Y(f => v => {
        switch(Object.prototype.toString.call(v)) {
        case '[object Array]': return list(v.map(f));
        case '[object Object]': return new GLib.Variant('a{sv}', vmap(v, f));
        case '[object String]': return GLib.Variant.new_string(v);
        case '[object Number]': return new GLib.Variant(number, v);
        case '[object Boolean]': return GLib.Variant.new_boolean(v);
        default: return GLib.Variant.new_string(String(v));
        }
    })(value);
}

export async function request(method, url, param, cancel = null, session = new Soup.Session()) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    let ans = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancel);
    if(msg.statusCode !== Soup.Status.OK) throw Error(msg.get_reason_phrase());
    return decode(ans.get_data());
}

export async function execute(cmd, env, cancel = null, tty = new Gio.SubprocessLauncher({flags: PIPE})) {
    if(env) Object.entries(env).forEach(([k, v]) => tty.setenv(k, v, true));
    let proc = tty.spawnv(['bash', '-c', cmd]),
        [stdout, stderr] = await proc.communicate_utf8_async(null, cancel),
        status = proc.get_exit_status();
    if(status) throw Error(stderr?.trimEnd() ?? '', {cause: {status, cmdline: cmd}});
    return stdout?.trimEnd() ?? '';
}
