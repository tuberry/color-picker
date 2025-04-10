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
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

export const ROOT = GLib.path_get_dirname(import.meta.url.slice(7));
export const PIPE = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;
export const BIND = GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE;

export const id = x => x;
export const nop = () => {};
/** @template T * @param {T} x * @return {T} */
export const seq = (f, x) => (f(x), x);
export const xnor = (x, y) => !x === !y;
export const Y = f => (...xs) => f(Y(f))(...xs); // Y combinator
export const thunk = (f, ...xs) => (f(...xs), f);
export const str = x => x?.constructor === String;
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const escape = (x, i = -1) => GLib.markup_escape_text(x, i);
export const unit = (x, f = y => [y]) => Array.isArray(x) ? x : f(x);
export const array = (n, f = id) => Array.from({length: n}, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const each = (f, a, s) => { for(let i = 0, n = a.length; i < n;) f(a.slice(i, i += s)); };
export const upcase = (s, f = x => x.toLowerCase()) => s.charAt(0).toUpperCase() + f(s.slice(1));
export const type = x => Object.prototype.toString.call(x).replace(/\[object (\w+)\]/, (_m, p) => p.toLowerCase());
export const format = (x, f) => x.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (m, a, b) => b ? f(b) ?? m : f(a) === undefined ? m : `{${a}}`);
/** @template T * @param {T} x * @return {T} */ // NOTE: see https://github.com/tc39/proposal-type-annotations & https://github.com/jsdoc/jsdoc/issues/1986
export const hook = (o, x) => (Object.entries(o).forEach(([k, v]) => x.connect(k, v)), x);
export const essay = (f, g = nop) => { try { return f(); } catch(e) { return g(e); } }; // NOTE: https://github.com/arthurfiorette/proposal-safe-assignment-operator
export const load = x => exist(x) && Gio.Resource.load(x)._register();
export const exist = x => GLib.file_test(x, GLib.FileTest.EXISTS);

export const fquery = (x, ...ys) => fopen(x).query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fwrite = (x, y, c = null) => fopen(x).replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, c);
export const fcopy = (x, y, c = null) => fopen(x).copy_async(fopen(y), Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, c, null);
export const fopen = x => str(x) ? x ? Gio.File.new_for_commandline_arg(x) : Gio.File.new_for_path(x) : x;
export const fdelete = (x, c = null) => fopen(x).delete_async(GLib.PRIORITY_DEFAULT, c);
export const fread = (x, c = null) => fopen(x).load_contents_async(c);

export async function readdir(dir, func, attr = Gio.FILE_ATTRIBUTE_STANDARD_NAME, cancel = null) {
    return Array.fromAsync(await fopen(dir).enumerate_children_async(attr, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel), func);
}

export function search(needle, haystack) { // Ref: https://github.com/bevacqua/fuzzysearch
    let tmp, iter = haystack[Symbol.iterator](); // TODO: Iterator.from()
    out: for(let char of needle) {
        while(!(tmp = iter.next()).done) if(tmp.value === char) continue out;
        return false;
    }
    return true;
}

export function enrol(klass, pspec, param) {
    if(pspec) {
        let spec = (k, t, ...vs) => [[k, GObject.ParamSpec[t](k, null, null, GObject.ParamFlags.READWRITE, ...vs)]];
        GObject.registerClass({
            Properties: omap(pspec, ([key, value]) => (kind => {
                switch(kind) {
                case 'array': return spec(key, ...value);
                case 'null': return spec(key, 'jsobject');
                case 'function': return spec(key, 'object', value);
                default: return spec(key, kind, value);
                }
            })(type(value))), ...param,
        }, klass);
    } else {
        param ? GObject.registerClass(param, klass) : GObject.registerClass(klass);
    }
}

export function homolog(cat, dog, keys, cmp = (x, y, _k) => x === y) { // cat, dog: JSON-compatible object
    let list = (f, x, y) => x.length === y.length && f(x),
        dict = keys ? f => f(keys) : (f, x, y) => list(f, Object.keys(x), Object.keys(y)),
        kind = (x, y) => (t => t === type(y) ? t : NaN)(type(x));
    return Y(f => (a, b, k) => {
        switch(kind(a, b)) {
        case 'array': return list(() => a.every((x, i) => f(x, b[i])), a, b);
        case 'object': return dict(xs => xs.every(x => f(a[x], b[x])), a, b);
        default: return cmp(a, b, k);
        }
    })(cat, dog);
}

export function pickle(value, tuple = true, number = 'u') { // value: JSON-compatible
    let list = tuple ? x => GLib.Variant.new_tuple(x) : x => new GLib.Variant('av', x);
    return Y(f => v => {
        switch(type(v)) {
        case 'array': return list(v.map(f));
        case 'object': return new GLib.Variant('a{sv}', vmap(v, f));
        case 'string': return GLib.Variant.new_string(v);
        case 'number': return new GLib.Variant(number, v);
        case 'boolean': return GLib.Variant.new_boolean(v);
        case 'null': return new GLib.Variant('mv', v);
        default: return GLib.Variant.new_string(String(v));
        }
    })(value);
}

export async function request(method, url, param, cancel = null, header = null, session = new Soup.Session()) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    if(header) Object.entries(header).forEach(([k, v]) => msg.request_headers.append(k, v));
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
