// vim:fdm=syntax
// by tuberry
/* exported fcheck fquery execute noop xnor omap
   genParam _GTK _ fl fn ec dc fwrite fexist
   fread fdelete fcopy denum dtouch
 */
'use strict';

const { GObject, Gio, GLib } = imports.gi;
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

var noop = () => {};
var xnor = (x, y) => !x === !y;
var _ = ExtensionUtils.gettext;
var dc = x => new TextDecoder().decode(x);
var ec = x => new TextEncoder().encode(x);
var fn = (...xs) => GLib.build_filenamev(xs);
var fl = (...xs) => Gio.File.new_for_path(fn(...xs));
var _GTK = imports.gettext.domain('gtk40').gettext;
var omap = (o, f) => Object.fromEntries(Object.entries(o).map(f));
var genParam = (x, y, ...z) => GObject.ParamSpec[x](y, y, y, GObject.ParamFlags.READWRITE, ...z);
var denum = (x, y = STDN) => x.enumerate_children_async(y, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
var fquery = (x, y) => x.query_info_async(y, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
var fwrite = (x, y) => x.replace_contents_async(ec(y), null, false, Gio.FileCreateFlags.NONE, null);
var fcopy = (x, y) => x.copy_async(y, Gio.FileCopyFlags.NONE, GLib.PRIORITY_DEFAULT, null, null);
var fcheck = (...xs) => fquery(xs[0] instanceof Gio.File ? xs[0] : fl(...xs), STDN);
var dtouch = x => x.make_directory_async(GLib.PRIORITY_DEFAULT, null);
var fdelete = x => x.delete_async(GLib.PRIORITY_DEFAULT, null);
var fexist = (...xs) => fcheck(...xs).catch(noop);
var fread = x => x.load_contents_async(null);

async function execute(cmd, fmt = x => x.trim()) {
    let proc = new Gio.Subprocess({
        argv: GLib.shell_parse_argv(cmd).at(1),
        flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
    });
    proc.init(null);
    let [stdout, stderr] = await proc.communicate_utf8_async(null, null);
    let status = proc.get_exit_status();
    if(status) throw new Gio.IOErrorEnum({ code: Gio.io_error_from_errno(status), message: stderr.trim() || GLib.strerror(status) });
    return fmt(stdout);
}
