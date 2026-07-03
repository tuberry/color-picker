import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as ExtensionUtils from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import * as T from '../src/util.js';

const {$, $$} = T;

const EM = Main.extensionManager;

export var METRICS = {
    Bye: {
        description: 'Debug ',
        value: 'Tannhauser Gate',
        units: 'Lorem Ipsum',
    },
};

function addDebugButton() {
    let lg = Main.createLookingGlass(),
        uuid = EM._enabledExtensions.find(x => EM.lookup(x).type === ExtensionUtils.ExtensionType.PER_USER),
        btn = new PanelMenu.Button(0.15, 'Debug')[$].add_child(new St.BoxLayout({styleClass: 'panel-status-indicators-box'})[$]
            .add_child(new St.Icon({styleClass: 'system-status-icon privacy-indicator', iconName: 'applications-utilities-symbolic'})));
    lg._evaluate(`Me = Main.extensionManager.lookup("${uuid}").stateObj; let {hub: me} = Me; me`);
    METRICS.Bye.description += uuid;
    btn.menu[$$].addMenuItem([
        ['Looking Glass', () => lg.open()],
        ['Debug Exit', () => Meta.Context.prototype.terminate.call(global.context)],
        new PopupMenu.PopupSwitchMenuItem('Extension', EM.lookup(uuid).enabled)[$]
            .connect('toggled', (_a, state) => state ? EM.enableExtension(uuid) : EM.disableExtension(uuid)),
        ['Preference', (() => EM.openExtensionPrefs(uuid, '', {}))[$].call()],
        ['Console', (() => Shell.AppSystem.get_default().lookup_app('org.gnome.Console.desktop')?.activate())[$].call()],
    ].map(x => Array.isArray(x) ? new PopupMenu.PopupMenuItem(x[0])[$].connect('activate', x[1]) : x));
    Main.panel.addToStatusArea('Debug', btn, 0, 'center');
}

function loadDevkitDConf() {
    let conf = new GLib.KeyFile();
    conf.load_from_file(T.fopen(GLib.getenv('_GSED_DEVKIT_DCONF_PATH')).get_path(), GLib.KeyFileFlags.NONE);
    conf.get_groups()[0].forEach(g => {
        let settings = new Gio.Settings({schema: g.replaceAll('/', '.')});
        conf.get_keys(g)[0].forEach(k => settings.set_value(k, GLib.Variant.parse(null, conf.get_value(g, k), null, null)));
    });
}

export function init() {
    GLib.unsetenv('SHELL_BACKGROUND_IMAGE'); // revoke the override by gnome-shell-test-tool
    Object.defineProperty(EM, 'updatesSupported', {get: () => false});
    Gio.DBus.session.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment',
        new GLib.Variant('(a{ss})', [Object.fromEntries(GLib.listenv().map(k => [k, GLib.getenv(k)]))]), null, Gio.DBusCallFlags.NONE, -1, null);
    // Util.trySpawnCommandLine('dbus-update-activation-environment --all');
    Promise.try(loadDevkitDConf).catch(T.nop);
    global.context.terminate = T.nop;
}

export async function run() {
    await Scripting.waitLeisure();
    // await Scripting.sleep(1000);

    addDebugButton();

    Main.overview.hide();
    let {width, height} = Main.layoutManager.primaryMonitor;
    global.stage.context.get_backend().get_default_seat().warp_pointer(width / 2, height / 2); // HACK: avoid unhiding overview if moving cursor
}

export function finish() {}
