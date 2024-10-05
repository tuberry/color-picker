// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';
import {TransientSignalHolder} from 'resource:///org/gnome/shell/misc/signalTracker.js';
import {Extension as ExtensionBase, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Util from './util.js';

const ruin = o => o?.destroy();
const raise = x => { throw Error(x); };// NOTE: https://github.com/tc39/proposal-throw-expressions#todo
// NOTE: see https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const onus = o => [o, o[hub]].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ?? raise('undestroyable');

export {_};
export const hub = Symbol('Hidden Unique Binder');
export const offstage = x => !Main.uiGroup.contains(x);
export const me = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
export const markup = (x, m) => x.clutterText.set_markup(`\u200b${m}`); // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
export const getTheme = () => St.ThemeContext.get_for_stage(global.stage);
export const debug = (...xs) => console.debug(`[${me().uuid}]`, ...xs); // NOTE: see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const omit = (o, ...ks) => ks.forEach(k => { ruin(o[k]); delete o[k]; });
export const essay = (f, g) => { try { return f(); } catch(e) { return g(e); } }; // NOTE: https://github.com/arthurfiorette/proposal-safe-assignment-operator
export const view = (v, ...ws) => ws.forEach(w => w && !Util.xnor(v, w.visible) && (v ? w.show() : w.hide())); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
export const connect = (tracker, ...args) => (t => args.reduce((p, x) => (x.connectObject ? p.push([x]) : p.at(-1).push(x), p), [])
    .forEach(([emitter, ...xs]) => emitter.connectObject(...xs, t)))(onus(tracker));
export const disconnect = (tracker, ...args) => (t => args.forEach(emitter => emitter?.disconnectObject(t)))(onus(tracker));
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise(resolve => St.Clipboard.get_default().get_text(primary ? St.ClipboardType.PRIMARY
    : St.ClipboardType.CLIPBOARD, (_c, x) => x && resolve(x)));

export class DBusProxy extends Gio.DBusProxy {
    static {
        GObject.registerClass(this);
    }

    [hub] = new TransientSignalHolder(this);

    constructor(name, object, callback, hooks, signals, xml, cancel = null, bus = Gio.DBus.session, gFlags = Gio.DBusProxyFlags.NONE) {
        let info = Gio.DBusInterfaceInfo.new_for_xml(xml ?? loadInterfaceXML(name));
        super({gConnection: bus, gName: name, gObjectPath: object, gInterfaceInfo: info, gFlags, gInterfaceName: info.name});
        if(signals) Util.each(xs => this.connectSignal(...xs), signals, 2);
        if(hooks) connect(this, this, ...hooks);
        this.init_async(GLib.PRIORITY_DEFAULT, cancel).then(() => callback(this, null)).catch(e => callback(null, e));
    }

    destroy() {
        EventEmitter.prototype.disconnectAll.call(this);
        omit(this, hub);
    }
}

export class Mortal extends EventEmitter {
    [hub] = new TransientSignalHolder(this);

    destroy() {
        this.emit('destroy');
        this.disconnectAll();
        omit(this, hub);
    }
}

export class Extension extends ExtensionBase {
    enable() {
        this[hub] = new this.$klass(this.getSettings());
    }

    disable() {
        omit(this, hub);
    }
}

export class Source {
    /**
     * @template T
     * @param {T} doom
     * @return {T}
     */
    static tie = (doom, host) => (host.connect('destroy', () => omit(doom, ...Object.keys(doom))), doom);

    static cancelled(error) {
        return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    }

    static newCancel(...args) {
        return new Source(() => new Gio.Cancellable(), x => x?.cancel(), ...args);
    }

    static newDBus(iface, path, host, ...args) {
        return new Source(() => Util.seq(x => x.export(Gio.DBus.session, path), Gio.DBusExportedObject.wrapJSObject(iface, host)),
            x => x?.unexport(), ...args);
    }

    static newKeys(gset, key, callback, ...args) {
        return new Source(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL, callback), x => x && Main.wm.removeKeybinding(key), ...args);
    }

    static newLight(callback, ...args) {
        return Source.new(() => new DBusProxy('org.gnome.SettingsDaemon.Color', '/org/gnome/SettingsDaemon/Color', x => callback(x.NightLightActive),
            ['g-properties-changed', (x, p) => { if(p.lookup_value('NightLightActive', null)) callback(x.NightLightActive); }]), ...args);
    }

    static newTimer(callback, remove = true, clear, ...args) {
        return remove ? new Source((...xs) => setTimeout(...callback(...xs)), clear ? x => clear(clearTimeout(x)) : clearTimeout, ...args)
            : new Source((...xs) => setInterval(...callback(...xs)), clear ? x => clear(clearInterval(x)) : clearInterval, ...args);
    }

    static newHandler(emitter, signal, callback, ...args) {
        return new Source(() => emitter.connect(signal, callback), x => x && emitter.disconnect(x), ...args);
    }

    static newMonitor(file, changed, ...args) {
        return new Source((cancel = null) => Util.hook({changed}, Util.fopen(file).monitor(Gio.FileMonitorFlags.NONE, cancel)),
            x => x?.cancel(), ...args);
    }

    static new(summon, ...args) {
        return new Source(summon, undefined, ...args);
    }

    constructor(summon, dispel = ruin, enable, ...args) {
        this.summon = (...xs) => { this[hub] = summon(...xs); };
        this.dispel = () => { dispel(this[hub]); delete this[hub]; };
        this.revive = (...xs) => { this.dispel(); this.summon(...xs); };
        this.reload = (...xs) => { if(this.active) this.revive(...xs); };
        this.reborn = (...xs) => { this.revive(...xs); return this.hub; }; // return
        this.switch = (b, ...xs) => { b ? this.revive(...xs) : this.dispel(); };
        this.toggle = (b, ...xs) => { if(!Util.xnor(b, this.active)) b ? this.summon(...xs) : this.dispel(); };
        if(enable) this.summon(...args);
        this.destroy = () => this.toggle(false);
    }

    get hub() {
        return this[hub];
    }

    get active() {
        return Util.has(this, hub);
    }
}

export class Setting {
    #ring = new WeakMap();

    constructor(gset, ...args) {
        this[hub] = Util.str(gset) ? new Gio.Settings({schema: gset}) : gset;
        this.attach(...args);
    }

    get hub() {
        return this[hub];
    }

    set(key, value, host) {
        let [field, type] = this.#ring.get(host).get(key);
        this[hub][`set_${type}`](field, value);
    }

    negate(key, host) {
        this.set(key, !host[key], host);
    }

    attach(chain, host, cast, post) {
        if(!this.#ring.has(host)) this.#ring.set(host, new Map());
        let ring = this.#ring.get(host);
        Object.entries(chain).forEach(([key, [field, type, turn, back, init]]) => {
            if(key in host) throw Error(`key conflict: ${key}`);
            let call = (f, x) => f(x, key) ?? x,
                pipe = (f, g) => f ? () => call(f, g()) : g,
                load = pipe(turn, (g => () => this[hub][g](field))(`get_${type}`)),
                bind = Util.thunk(() => (host[key] = load()));
            ring.set(key, [field, type]);
            if(init) return;
            let sync = [post, cast, back, bind].reduceRight((p, x) => pipe(x, p));
            connect(host, this[hub], `changed::${field}`, () => void sync());
        });
        cast?.();
        return this;
    }

    detach(host) {
        if(this.#ring.has(host)) disconnect(host, this[hub]);
    }
}
