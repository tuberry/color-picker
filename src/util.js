// vim:fdm=syntax
// by tuberry

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

export const ROOT_DIR = GLib.path_get_dirname(import.meta.url.slice(7));
export const BIND_FULL = GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE;

export const id = x => x;
export const noop = () => {};
export const xnor = (x, y) => !x === !y;
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const fpath = (...xs) => GLib.build_filenamev(xs);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const fopen = (...xs) => Gio.File.new_for_path(fpath(...xs));
export const nonEq = (x, y) => x instanceof Object && y instanceof Object;
export const array = (n, f = id) => Array.from({ length: n }, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const cancelled = e => e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
export const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const hook = (o, a) => (Object.entries(o).forEach(([k, v]) => a.connect(k, v)), a);
export const pickle = o => Json.gvariant_deserialize(Json.from_string(JSON.stringify(o)), null);
export const luminance = ({ r, g, b }) => Math.sqrt(0.299 * r * r  + 0.587 * g * g + 0.114 * b * b); // Ref: https://stackoverflow.com/a/596243
export const gerror = (x, y = '') => new Gio.IOErrorEnum({ code: Gio.IOErrorEnum[x] ?? x, message: y });
export const gprops = o => omap(o, ([k, [x, ...ys]]) => [[k, GObject.ParamSpec[x](k, k, k, GObject.ParamFlags.READWRITE, ...ys)]]);
export const fquery = (x, ...ys) => x.query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fcheck = (...xs) => fquery(xs[0] instanceof Gio.File ? xs[0] : fopen(...xs), Gio.FILE_ATTRIBUTE_STANDARD_NAME);
export const fwrite = (x, y, c = null) => x.replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, c);
export const fcopy = (x, y, c = null) => x.copy_async(y, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, c, null);
export const mkdir = (x, c = null) => x.make_directory_async(GLib.PRIORITY_DEFAULT, c);
export const fdelete = (x, c = null) => x.delete_async(GLib.PRIORITY_DEFAULT, c);
export const fread = (x, c = null) => x.load_contents_async(c);
export const fexist = (...xs) => fcheck(...xs).catch(noop);

export function homolog(a, b, f = (x, y, _k) => homolog(x, y, f, g, _k), g = (x, y, _k) => x === y, k) { // a, b: JSON val
    return nonEq(a, b) ? Object.getOwnPropertyNames(a).every(x => f(a[x], b[x], x)) : g(a, b, k);
}

export async function denum(path, func, cancel = null) {
    try {
        let dir = Array.isArray(path) ? fopen(...path) : fopen(path);
        return await Array.fromAsync(await dir.enumerate_children_async(Gio.FILE_ATTRIBUTE_STANDARD_NAME, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancel), func);
    } catch(e) {
        return [];
    }
}

export async function access(method, url, param, session = new Soup.Session(), cancel = null) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    let ans = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, cancel);
    if(msg.statusCode !== Soup.Status.OK) throw Error(`Unexpected response: ${msg.get_reason_phrase()}`);
    return decode(ans.get_data());
}

export async function execute(cmd, tty = new Gio.SubprocessLauncher({ flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE }), cancel = null) {
    let ret = await GLib.shell_parse_argv(cmd).at(1)
        .reduce((p, x) => (x === '|' ? p.push([]) : p.at(-1).push(x), p), [[]])
        .reduce(async (p, x) => {
            if(!x.length) throw Error(`Unexpected pipe: ${cmd}`);
            let proc = tty.spawnv(x),
                [stdout, stderr] = await proc.communicate_utf8_async(await p, cancel),
                status = proc.get_exit_status();
            if(status) throw gerror(Gio.io_error_from_errno(status), stderr?.trimEnd() ?? '');
            return stdout;
        }, null);
    return ret?.trimEnd() ?? '';
}
