// vim:fdm=syntax
// by tuberry

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { EventEmitter } from 'resource:///org/gnome/shell/misc/signals.js';
import { loadInterfaceXML } from 'resource:///org/gnome/shell/misc/fileUtils.js';
import { TransientSignalHolder } from 'resource:///org/gnome/shell/misc/signalTracker.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { vmap, raise } from './util.js';

// roll back to the previous workaround for the read-only signalTracker since 45.beta
// TODO: wait for https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const _isDestroyable = x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x);

export { _ };
export const getSelf = () => Extension.lookupByURL(import.meta.url);
export const omit = (o, ...ks) => ks.forEach(k => { o[k]?.destroy?.(); o[k] = null; });
export const onus = o => [o, o.$scapegoat].find(x => _isDestroyable(x)) ?? raise('undestroyable');

export class Destroyable extends EventEmitter {
    $scapegoat = new TransientSignalHolder(this);

    destroy() {
        this.emit('destroy');
        omit(this, '$scapegoat');
    }
}

export function symbiose(host, doom, obj) {
    if(doom) new Symbiont(host, doom);
    if(obj) return vmap(obj, v => new Symbiont(host, ...v));
}

export function lightProxy(callback, obj) {
    let BUS_NAME = 'org.gnome.SettingsDaemon.Color',
        colorInfo = Gio.DBusInterfaceInfo.new_for_xml(loadInterfaceXML(BUS_NAME)),
        proxy = new Gio.DBusProxy({
            g_name: BUS_NAME,
            g_connection: Gio.DBus.session,
            g_object_path: '/org/gnome/SettingsDaemon/Color',
            g_interface_name: colorInfo.name,
            g_interface_info: colorInfo,
        });
    proxy.connectObject('g-properties-changed', callback, onus(obj));
    proxy.init_async(GLib.PRIORITY_DEFAULT, null).catch(logError);

    return proxy;
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
        host.connectObject('destroy', () => this.dispel(), onus(host));
        this.dispel = () => { dispel(this._delegate); this._delegate = null; };
        this.summon = (...args) => (this._delegate = summon(...args));
        this.revive = (...args) => { this.dispel(); return this.summon(...args); };
    }
}

export class Fulu {
    #map = new WeakMap();
    constructor(prop, gset, obj, cluster) {
        this.gset = typeof gset === 'string' ? new Gio.Settings({ schema: gset }) : gset;
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
        Object.entries(props).forEach(([k, [x]]) => { callback(k); this.gset.connectObject(`changed::${x}`, () => callback(k), onus(obj)); });
        return this;
    }

    detach(obj) {
        this.gset.disconnectObject(onus(obj));
    }
}
