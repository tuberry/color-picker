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

import {has, seq, xnor, fopen, hook, string} from './util.js';

const ruin = o => o?.destroy();
const raise = x => { throw Error(x); };// NOTE: https://github.com/tc39/proposal-throw-expressions#todo
// NOTE: see https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const onus = o => [o, o[hub]].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ?? raise('undestroyable');

export {_};
export const hub = Symbol('Hidden Unique Binder');
export const myself = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
export const debug = (...xs) => console.debug(`[${myself().uuid}]`, ...xs); // NOTE: see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const omit = (o, ...ks) => ks.forEach(k => { ruin(o[k]); delete o[k]; });
export const extent = x => [...x.get_transformed_position(), ...x.get_transformed_size()];
export const view = (v, ...ws) => ws.forEach(w => { if(w && v ^ w.visible) v ? w.show() : w.hide(); }); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
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
        if(signals) for(let i = 0, n = signals.length; i < n; i += 2) this.connectSignal(signals[i], signals[i + 1]);
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
    static fuse = (doom, host) => (host.connect('destroy', () => omit(doom, ...Object.keys(doom))), doom);

    static cancelled(error) {
        return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    }

    static newCancel(...args) {
        return new Source(() => new Gio.Cancellable(), x => x?.cancel(), ...args);
    }

    static newDBus(iface, path, host, ...args) {
        return new Source(() => seq(x => x.export(Gio.DBus.session, path), Gio.DBusExportedObject.wrapJSObject(iface, host)),
            x => x?.unexport(), ...args);
    }

    static newKeys(gset, key, callback, ...args) {
        return new Source(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL, callback), x => x && Main.wm.removeKeybinding(key), ...args);
    }

    static newLight(callback, ...args) {
        return new Source(() => new DBusProxy('org.gnome.SettingsDaemon.Color', '/org/gnome/SettingsDaemon/Color', x => callback(x.NightLightActive),
            ['g-properties-changed', (x, p) => { if(p.lookup_value('NightLightActive', null)) callback(x.NightLightActive); }]), ruin, ...args);
    }

    static newTimer(callback, remove = true, clear, ...args) {
        return remove ? new Source((...xs) => setTimeout(...callback(...xs)), clear ? x => clear(clearTimeout(x)) : clearTimeout, ...args)
            : new Source((...xs) => setInterval(...callback(...xs)), clear ? x => clear(clearInterval(x)) : clearInterval, ...args);
    }

    static newHandler(emitter, signal, callback, ...args) {
        return new Source(() => emitter.connect(signal, callback), x => x && emitter.disconnect(x), ...args);
    }

    static newMonitor(file, changed, ...args) {
        return new Source((cancel = null) => hook({changed}, fopen(file).monitor(Gio.FileMonitorFlags.WATCH_MOVES, cancel)),
            x => x?.cancel(), ...args);
    }

    static newSetting(prop, gset, host, func, last, ...args) {
        return new Source(() => new Setting(prop, gset, host, func, last), x => x?.detach(host), ...args);
    }

    constructor(summon, dispel = ruin, enable, ...args) {
        this.summon = (...xs) => { this[hub] = summon(...xs); };
        this.dispel = () => { dispel(this[hub]); delete this[hub]; };
        this.revive = (...xs) => { this.dispel(); this.summon(...xs); };
        this.reload = (...xs) => { if(this.active) this.revive(...xs); };
        this.reborn = (...xs) => { this.revive(...xs); return this.hub; }; // return
        this.toggle = (b, ...xs) => { if(!xnor(b, this.active)) b ? this.summon(...xs) : this.dispel(); };
        if(enable) this.summon(...args);
        this.destroy = () => this.toggle(false);
    }

    get hub() {
        return this[hub];
    }

    get active() {
        return has(this, hub);
    }
}

export class Setting {
    #map = new WeakMap();

    constructor(prop, gset, ...args) {
        this.gset = string(gset) ? new Gio.Settings({schema: gset}) : gset;
        if(prop) this.attach(prop, ...args);
    }

    get(key, host) {
        return (([field, type]) => this.gset[`get_${type}`](field))(this.#map.get(host)[key]);
    }

    set(key, value, host) {
        (([field, type]) => this.gset[`set_${type}`](field, value))(this.#map.get(host)[key]);
    }

    attach(prop, host, func, last) { // prop <- { key: [field, type, pre/conv, post] }
        this.#map.has(host) ? Object.assign(this.#map.get(host), prop) : this.#map.set(host, prop);
        last &&= Object.keys(prop).at(-1);
        let call = (f, v, k) => f?.(v, k) ?? v,
            bind = (k, f, g) => call(g, seq(x => { host[k] = x; }, call(f, this.get(k, host), k)), k),
            sync = last ? (k, f, g) => call((...xs) => has(host, last) && func(...xs), bind(k, f, g), k) : (k, f, g) => call(func, bind(k, f, g), k);
        connect(host, this.gset, ...Object.entries(prop).flatMap(([k, [x,, f, g]]) => (sync(k, f, g), [`changed::${x}`, () => sync(k, f, g)])));
        return this;
    }

    detach(host) {
        if(this.#map.has(host)) disconnect(host, this.gset);
    }
}
