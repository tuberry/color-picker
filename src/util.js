// vim:fdm=syntax
// by tuberry
/* exported fcheck fquery execute noop xnor omap gerror
   gparam _GTK _ fl fn ec dc id fwrite fexist grect
   fread fdelete fcopy denum dtouch access bmap scap
 */
'use strict';

imports.gi.versions.Soup = '3.0'; // suppress warning in prefs.js

const { GObject, Gio, GLib, Soup, Graphene } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const STDN = Gio.FILE_ATTRIBUTE_STANDARD_NAME;

Gio._promisify(Gio.File.prototype, 'copy_async');
Gio._promisify(Gio.File.prototype, 'delete_async');
Gio._promisify(Gio.File.prototype, 'query_info_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'make_directory_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_async');
Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async');

var id = x => x;
var noop = () => {};
var xnor = (x, y) => !x === !y;
var _ = ExtensionUtils.gettext;
var dc = x => new TextDecoder().decode(x);
var ec = x => new TextEncoder().encode(x);
var fn = (...xs) => GLib.build_filenamev(xs);
var fl = (...xs) => Gio.File.new_for_path(fn(...xs));
var _GTK = imports.gettext.domain('gtk40').gettext;
var bmap = o => ({ ...o, ...omap(o, ([k, v]) => [[v, k]]) });
var omap = (o, f) => Object.fromEntries(Object.entries(o).flatMap(f));
var scap = s => s.split('').map((x, i) => i ? x.toLowerCase() : x.toUpperCase()).join('');
var gerror = (x, y = '') => new Gio.IOErrorEnum({ code: Gio.IOErrorEnum[x] ?? x, message: y });
var gparam = (x, y, ...zs) => GObject.ParamSpec[x](y, y, y, GObject.ParamFlags.READWRITE, ...zs);
var grect = (width, height, x = 0, y = 0) => new Graphene.Rect({ origin: new Graphene.Point({ x, y }), size: new Graphene.Size({ width, height }) });
var fquery = (x, ...ys) => x.query_info_async(ys.join(','), Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
var denum = (x, y = STDN) => x.enumerate_children_async(y, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
var fwrite = (x, y) => x.replace_contents_async(ec(y), null, false, Gio.FileCreateFlags.NONE, null);
var fcopy = (x, y) => x.copy_async(y, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
var fcheck = (...xs) => fquery(xs[0] instanceof Gio.File ? xs[0] : fl(...xs), STDN);
var dtouch = x => x.make_directory_async(GLib.PRIORITY_DEFAULT, null);
var fdelete = x => x.delete_async(GLib.PRIORITY_DEFAULT, null);
var fexist = (...xs) => fcheck(...xs).catch(noop);
var fread = x => x.load_contents_async(null);

async function access(method, url, param, session = new Soup.Session()) {
    let msg = param ? Soup.Message.new_from_encoded_form(method, url, Soup.form_encode_hash(param)) : Soup.Message.new(method, url);
    let byt = await session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null);
    if(msg.statusCode !== Soup.Status.OK) throw new Error(`Unexpected response: ${msg.get_reason_phrase()}`);
    return dc(byt.get_data());
}

async function execute(cmd) {
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
