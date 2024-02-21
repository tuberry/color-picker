// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';
import {loadInterfaceXML} from 'resource:///org/gnome/shell/misc/fileUtils.js';
import {TransientSignalHolder} from 'resource:///org/gnome/shell/misc/signalTracker.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {vmap, hook} from './util.js';

export {_};
export const getSelf = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
export const debug = (...xs) => console.debug(`[${getSelf().uuid}]`, ...xs);
export const ruin = o => o && (o.destroy ?? o.run_dispose)?.bind(o)();
export const omit = (o, ...ks) => ks.forEach(k => { ruin(o[k]); o[k] = null; });
// TODO: wait for https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const onus = o => [o, o.$scapegoat].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ??
    (() => { throw Error('undestroyable'); })(); // NOTE: https://github.com/tc39/proposal-throw-expressions#todo
export const connect = (tracker, ...args) => (x => args.forEach(([emitter, ...argv]) => emitter.connectObject(...argv, x)))(onus(tracker));
export const disconnect = (tracker, ...args) => (x => args.forEach(emitter => emitter?.disconnectObject(x)))(onus(tracker));
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise(resolve => St.Clipboard.get_default().get_text(
    primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, (_c, x) => x && resolve(x)));

export class Destroyable extends EventEmitter {
    $scapegoat = new TransientSignalHolder(this);

    destroy() {
        this.emit('destroy');
        omit(this, '$scapegoat');
    }
}

export function symbiose(host, doom, obj) {
    if(doom) host.connect('destroy', doom);
    if(obj) return vmap(obj, v => new Symbiont(host, ...v));
}

export async function bindNight(callback, host, key) {
    let Proxy = Gio.DBusProxy.makeProxyWrapper(loadInterfaceXML('org.gnome.SettingsDaemon.Color')),
        value = 'NightLightActive',
        symbol = Symbol(value);
    host[symbol] = hook({'g-properties-changed': (_a, p) => { if(p.lookup_value(value, null)) host[key] = callback(host[symbol][value] ?? false); }},
        await Proxy.newAsync(Gio.DBus.session, 'org.gnome.SettingsDaemon.Color', '/org/gnome/SettingsDaemon/Color'));
    host[key] = callback(host[symbol][value] ?? false);
    symbiose(host, () => omit(host, symbol));
}

export class ExtensionBase extends Extension {
    enable() {
        this.$delegate = new this.$klass(this.getSettings());
    }

    disable() {
        omit(this, '$delegate');
    }
}

export class Symbiont {
    constructor(host, dispel, summon) {
        symbiose(host, () => this.dispel());
        this.summon = (...args) => (this._delegate = summon(...args));
        this.dispel = () => { dispel(this._delegate); this._delegate = null; };
        this.revive = (...args) => { this.dispel(); return this.summon(...args); };
    }
}

export class Fulu {
    #map = new WeakMap();
    constructor(prop, gset, obj, cluster) {
        this.gset = typeof gset === 'string' ? new Gio.Settings({schema: gset}) : gset;
        this.attach(prop, obj, cluster);
    }

    get(prop, obj) {
        return (([key, type]) => this.gset[`get_${type}`](key))(this.#map.get(obj)[prop]);
    }

    set(prop, value, obj) {
        (([key, type]) => this.gset[`set_${type}`](key, value))(this.#map.get(obj)[prop]);
    }

    attach(props, obj, cluster) { // cluster && props <- { fulu: [key, type, output] }
        this.#map.has(obj) ? Object.assign(this.#map.get(obj), props) : this.#map.set(obj, props);
        let callback = cluster ? x => { obj[cluster] = [x, this.get(x, obj), this.#map.get(obj)[x][2]]; } : x => { obj[x] = this.get(x, obj); };
        Object.entries(props).forEach(([k, [x]]) => { callback(k); connect(obj, [this.gset, `changed::${x}`, () => callback(k)]); });
        return this;
    }

    detach(obj) {
        if(this.#map.has(obj)) disconnect(obj, this.gset);
    }
}
