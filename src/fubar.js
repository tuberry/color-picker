// vim:fdm=syntax
// by tuberry

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import { EventEmitter } from 'resource:///org/gnome/shell/misc/signals.js';
import { loadInterfaceXML } from 'resource:///org/gnome/shell/misc/fileUtils.js';
import { TransientSignalHolder } from 'resource:///org/gnome/shell/misc/signalTracker.js';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import { vmap } from './util.js';

export { _ };
export const getSelf = () => Extension.lookupByURL(import.meta.url);
export const omit = (o, ...ks) => ks.forEach(k => { o[k]?.destroy?.(); o[k] = null; });

// TODO: wait for https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const getSignalHolder = o => [o, o.$signal_holder].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ??
    (() => { throw Error('undestroyable'); })(); // NOTE: https://github.com/tc39/proposal-throw-expressions#todo
export const connect = (tracker, ...args) => (x => args.forEach(([emitter, ...argv]) => emitter.connectObject(...argv, x)))(getSignalHolder(tracker));
export const disconnect = (tracker, ...args) => (x => args.forEach(emitter => emitter?.disconnectObject(x)))(getSignalHolder(tracker));

export class Destroyable extends EventEmitter {
    $signal_holder = new TransientSignalHolder(this);

    destroy() {
        this.emit('destroy');
        omit(this, '$signal_holder');
    }
}

export function manageSource(host, doom, obj) {
    if(doom) new SourceManager(host, doom);
    if(obj) return vmap(obj, v => new SourceManager(host, ...v));
}

export function lightProxy(callback, obj) {
    let iface = Gio.DBusInterfaceInfo.new_for_xml(loadInterfaceXML('org.gnome.SettingsDaemon.Color'));
    let proxy = new Gio.DBusProxy({
        g_interface_info: iface,
        g_interface_name: iface.name,
        g_connection: Gio.DBus.session,
        g_name: 'org.gnome.SettingsDaemon.Color',
        g_object_path: '/org/gnome/SettingsDaemon/Color',
    });
    connect(obj, [proxy, 'g-properties-changed', callback]);
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

export class SourceManager {
    constructor(host, removeSource, addSource) {
        connect(host, [host, 'destroy', () => this.removeSource()]);
        this.removeSource = () => { removeSource(this._delegate); this._delegate = null; };
        this.addSource = (...args) => (this._delegate = addSource(...args));
        this.refreshSource = (...args) => { this.removeSource(); return this.addSource(...args); };
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
        Object.entries(props).forEach(([k, [x]]) => { callback(k); connect(obj, [this.gset, `changed::${x}`, () => callback(k)]); });
        return this;
    }

    detach(obj) {
        disconnect(obj, this.gset);
    }
}
