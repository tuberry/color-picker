// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';
import {TransientSignalHolder} from 'resource:///org/gnome/shell/misc/signalTracker.js';
import {Extension as ExtensionBase, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {has, hook, xnor} from './util.js';

export {_};
export const myself = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
export const debug = (...xs) => console.debug(`[${myself().uuid}]`, ...xs); // NOTE:see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const ruin = o => o && (o.destroy ?? o.run_dispose).bind(o)();
export const omit = (o, ...ks) => ks.forEach(k => { ruin(o[k]); delete o[k]; });
export const view = (v, ...ws) => ws.forEach(w => { if(w && v ^ w.visible) v ? w.show() : w.hide(); }); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
// NOTE: see https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const onus = o => [o, o.$hub].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ??
    (() => { throw Error('undestroyable'); })(); // NOTE: https://github.com/tc39/proposal-throw-expressions#todo
export const connect = (tracker, ...args) => (t => args.reduce((p, x) => (x.connectObject ? p.push([x]) : p.at(-1).push(x), p), [])
    .forEach(([emitter, ...argv]) => emitter.connectObject(...argv, t)))(onus(tracker));
export const disconnect = (tracker, ...args) => (t => args.forEach(emitter => emitter?.disconnectObject(t)))(onus(tracker));
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise(resolve => St.Clipboard.get_default().get_text(
    primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, (_c, x) => x && resolve(x)));

export class Mortal extends EventEmitter {
    $hub = new TransientSignalHolder(this);

    destroy() {
        this.emit('destroy');
        omit(this, '$hub');
    }
}

/**
 * @template T
 * @param {T} doom
 * @return {T}
 */
export function degrade(doom, host) {
    host.connect('destroy', () => omit(doom, ...Object.keys(doom)));
    return doom;
}

export class Extension extends ExtensionBase {
    enable() {
        this.$hub = new this.$klass(this.getSettings());
    }

    disable() {
        omit(this, '$hub');
    }
}

export class Source {
    constructor(summon, dispel = ruin, enable, ...args) {
        this.summon = (...xs) => { this.hub = summon(...xs); };
        this.dispel = () => { dispel(this.hub); delete this.hub; };
        this.revive = (...xs) => { this.dispel(); this.summon(...xs); };
        this.reload = (...xs) => { if(this.active) this.revive(...xs); };
        this.toggle = (b, ...xs) => xnor(b, this.active) || (b ? this.summon(...xs) : this.dispel());
        if(enable) this.summon(...args);
        this.destroy = this.dispel;
    }

    get active() {
        return has(this, 'hub');
    }
}

export class Cancel extends Source {
    static cancelled(error) {
        return error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    }

    constructor(enable) {
        super(() => new Gio.Cancellable(), x => x?.cancel(), enable);
        this.reborn = (...xs) => { this.revive(...xs); return this.hub; }; // return
    }
}

export class DBus extends Source {
    constructor(iface, path, host, enable) {
        super(() => (d => (d.export(Gio.DBus.session, path), d))(Gio.DBusExportedObject.wrapJSObject(iface, host)),
            x => x?.unexport(), enable);
    }
}

export class Keys extends Source {
    constructor(gset, key, callback, enable) {
        super(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.ALL, callback), x => x && Main.wm.removeKeybinding(key), enable);
    }
}

export class Light extends Source {
    constructor(callback) {
        let ColorProxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.gnome.SettingsDaemon.Color'));
        super(() => hook({'g-properties-changed': (x, p) => { if(p.lookup_value('NightLightActive', null)) callback(x.NightLightActive); }},
            new ColorProxy(Gio.DBus.session, 'org.gnome.SettingsDaemon.Color', '/org/gnome/SettingsDaemon/Color', x => callback(x.NightLightActive))));
    }
}

export class Setting {
    #map = new WeakMap();

    constructor(prop, gset, ...args) {
        this.gset = typeof gset === 'string' ? new Gio.Settings({schema: gset}) : gset;
        if(prop) this.attach(prop, ...args);
    }

    get(key, host) {
        return (([field, type]) => this.gset[`get_${type}`](field))(this.#map.get(host)[key]);
    }

    set(key, value, host) {
        (([field, type]) => this.gset[`set_${type}`](field, value))(this.#map.get(host)[key]);
    }

    attach(prop, host, func, last) { // prop <- { key: [field::str, type::str, pre::func, post::func] }
        this.#map.has(host) ? Object.assign(this.#map.get(host), prop) : this.#map.set(host, prop);
        last &&= Object.keys(prop).at(-1);
        let call = (f, v, k) => f?.(v, k) ?? v,
            bind = (k, f, g) => call(g, host[k] = call(f, this.get(k, host), k), k),
            sync = last ? (k, f, g) => call((...xs) => has(host, last) && func(...xs), bind(k, f, g), k) : (k, f, g) => call(func, bind(k, f, g), k);
        connect(host, this.gset, ...Object.entries(prop).flatMap(([k, [x,, f, g]]) => (sync(k, f, g), [`changed::${x}`, () => sync(k, f, g)])));
        return this;
    }

    detach(host) {
        if(this.#map.has(host)) disconnect(host, this.gset);
    }
}
