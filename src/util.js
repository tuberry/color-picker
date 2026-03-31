// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup';
import GObject from 'gi://GObject';

Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

export const hub = Symbol('Handy Utility Binder');
export const SYNC = GObject.BindingFlags.SYNC_CREATE;
export const BIND = GObject.BindingFlags.BIDIRECTIONAL | SYNC;
export const ROOT = GLib.path_get_dirname(import.meta.url.slice(7));
export const PIPE = Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE;

export const $ = Symbol('Chain Call');
export const $s = Symbol('Chain Calls');
export const $_ = Symbol('Chain If Call');
export const $$ = Symbol('Chain Seq Call');
Object.defineProperties(Object.prototype, { // NOTE: https://github.com/RedHatter/proposal-cascade-operator & https://en.wikipedia.org/wiki/Method_cascading
    [$]:  {get() { return new Proxy(this, {get: (t, k) => (...xs) => (t[k] instanceof Function ? t[k](...xs) : ([t[k]] = xs), t)}); }},
    [$s]: {get() { return new Proxy(this, {get: (t, k) => xs => (xs?.forEach(x => Array.isArray(x) ? t[k](...x) : t[k](x)), t)}); }},
    [$_]: {get() { return new Proxy(this, {get: (t, k) => (b, ...xs) => b ? t[$][k](...xs) : t}); }},
    [$$]: {value(f) { f(this); return this; }}, // like `also` in Kotlin
});

export const id = x => x;
export const nop = () => {};
export const xnor = (x, y) => !x === !y;
export const Y = f => (...xs) => f(Y(f))(...xs); // Y combinator
export const str = x => x?.constructor === String;
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const esc = (x, i = -1) => GLib.markup_escape_text(x, i);
export const unit = (x, f = y => [y]) => Array.isArray(x) ? x : f(x);
export const array = (n, f = id) => Array.from({length: n}, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const essay = (f, g = nop) => { try { return f(); } catch(e) { return g(e); } }; // NOTE: https://github.com/arthurfiorette/proposal-try-operator
export const inject = (o, ...xs) => chunk(xs).forEach(([k, f]) => { o[k] = f(o, o[k]); });
export const upcase = (s, f = x => x.toLowerCase()) => s.charAt(0).toUpperCase() + f(s.slice(1));
export const type = x => Object.prototype.toString.call(x).replace(/\[object (\w+)\]/, (_m, p) => p.toLowerCase());
export const format = (x, f) => x.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (m, a, b) => b ? f(b) ?? m : f(a) === undefined ? m : `{${a}}`);

export const fquery = (x, ...ys) => fopen(x).query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fwrite = (x, y, c = null) => fopen(x).replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, c);
export const fcopy = (x, y, c = null) => fopen(x).copy_async(fopen(y), Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, c, null);
export const fopen = x => str(x) ? x ? Gio.File.new_for_commandline_arg(x) : Gio.File.new_for_path(x) : x;
export const fdelete = (x, c = null) => fopen(x).delete_async(GLib.PRIORITY_DEFAULT, c);
export const fread = (x, c = null) => fopen(x).load_contents_async(c);
export const load = x => exist(x) && Gio.Resource.load(x)._register();
export const exist = x => GLib.file_test(x, GLib.FileTest.EXISTS);

export async function readdir(dir, func, attr = Gio.FILE_ATTRIBUTE_STANDARD_NAME, cancel = null) {
    return Array.fromAsync(await fopen(dir).enumerate_children_async(attr, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel), func);
}

export function* chunk(list, step = 2, from = 0, to = list.length) {
    let next = step instanceof Function ? i => { while(++i < to && !step(list[i], i)); return i; } : i => i + step;
    while(from < to) yield list.slice(from, from = next(from));
}

export function search(needle, haystack) { // non unicode safe: https://github.com/bevacqua/fuzzysearch/issues/18
    let i, j, k, c, n = needle.length, m = haystack.length;
    out: for(i = 0, j = -1; i < n; i++) {
        c = needle[i];
        while(++j < m) if(haystack[j] === c) { k ??= j; continue out; }
        return;
    }
    return (i = j - n - k + 1) && (j = haystack.indexOf(needle, k)) > 0 ? [j, 0] : [k, i]; // [index, error]
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

export function homolog(cat, dog, keys, cmp = (x, y, _k) => x === y) { // cat, dog: JSON-compatible object, NOTE: https://github.com/tc39/proposal-composites
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

export async function request(method, url, param, cancel = null, header = null, session = new Soup.Session()) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    if(header) msg.request_headers[$s].append(Object.entries(header));
    let ans = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancel);
    if(msg.statusCode !== Soup.Status.OK) throw Error(msg.get_reason_phrase());
    return decode(ans.get_data());
}

export async function execute(cmd, env, cancel = null, tty = new Gio.SubprocessLauncher({flags: PIPE})) {
    if(env) for(let k in env) tty.setenv(k, env[k], true);
    let proc = tty.spawnv([tty.getenv('SHELL'), '-c', cmd]),
        [stdout, stderr] = await proc.communicate_utf8_async(null, cancel),
        status = proc.get_exit_status();
    if(status) throw Error(stderr?.trimEnd() ?? '', {cause: {status, cmd}});
    return stdout?.trimEnd() ?? '';
}
