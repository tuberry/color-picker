// vim:fdm=syntax
// by tuberry

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
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

export const id = x => x;
export const noop = () => {};
export const xnor = (x, y) => !x === !y;
export const raise = x => { throw new Error(x); };
export const decode = x => new TextDecoder().decode(x);
export const encode = x => new TextEncoder().encode(x);
export const fpath = (...xs) => GLib.build_filenamev(xs);
export const vmap = (o, f) => omap(o, ([k, v]) => [[k, f(v)]]);
export const lot = x => x[Math.floor(Math.random() * x.length)];
export const fopen = (...xs) => Gio.File.new_for_path(fpath(...xs));
export const bmap = o => ({ ...o, ...omap(o, ([k, v]) => [[v, k]]) });
export const array = (n, f = id) => Array.from({ length: n }, (_x, i) => f(i));
export const omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
export const luminance = ({ r, g, b }) => Math.sqrt(0.299 * r * r  + 0.587 * g * g + 0.114 * b * b); // Ref: https://stackoverflow.com/a/596243
export const gerror = (x, y = '') => new Gio.IOErrorEnum({ code: Gio.IOErrorEnum[x] ?? x, message: y });
export const gprops = o => omap(o, ([k, [x, ...ys]]) => [[k, GObject.ParamSpec[x](k, k, k, GObject.ParamFlags.READWRITE, ...ys)]]);
export const grect = (w, h, x = 0, y = 0) => new Graphene.Rect({ origin: new Graphene.Point({ x, y }), size: new Graphene.Size({ width: w, height: h }) });
export const denum = (x, y = Gio.FILE_ATTRIBUTE_STANDARD_NAME) => x.enumerate_children_async(y, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fquery = (x, ...ys) => x.query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
export const fcheck = (...xs) => fquery(xs[0] instanceof Gio.File ? xs[0] : fopen(...xs), Gio.FILE_ATTRIBUTE_STANDARD_NAME);
export const fwrite = (x, y) => x.replace_contents_async(encode(y), null, false, Gio.FileCreateFlags.NONE, null);
export const fcopy = (x, y) => x.copy_async(y, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
export const dtouch = x => x.make_directory_async(GLib.PRIORITY_DEFAULT, null);
export const fdelete = x => x.delete_async(GLib.PRIORITY_DEFAULT, null);
export const fexist = (...xs) => fcheck(...xs).catch(noop);
export const fread = x => x.load_contents_async(null);

export async function access(method, url, param, session = new Soup.Session()) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    let byt = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
    if(msg.statusCode !== Soup.Status.OK) raise(`Unexpected response: ${msg.get_reason_phrase()}`);
    return decode(byt.get_data());
}

export async function execute(cmd) {
    let proc = new Gio.Subprocess({
        argv: GLib.shell_parse_argv(cmd).at(1),
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    proc.init(null);
    let [stdout, stderr] = await proc.communicate_utf8_async(null, null);
    let status = proc.get_exit_status();
    if(status) throw gerror(Gio.io_error_from_errno(status), stderr.trimEnd() || GLib.strerror(status));
    return stdout.trimEnd();
}
