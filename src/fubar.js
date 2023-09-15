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
export const getSignalHolder = o => [o, o.$signal_holder].find(x => _isDestroyable(x)) ?? raise('undestroyable');

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
    let BUS_NAME = 'org.gnome.SettingsDaemon.Color',
        colorInfo = Gio.DBusInterfaceInfo.new_for_xml(loadInterfaceXML(BUS_NAME)),
        proxy = new Gio.DBusProxy({
            g_name: BUS_NAME,
            g_connection: Gio.DBus.session,
            g_object_path: '/org/gnome/SettingsDaemon/Color',
            g_interface_name: colorInfo.name,
            g_interface_info: colorInfo,
        });
    proxy.connectObject('g-properties-changed', callback, getSignalHolder(obj));
    proxy.init_async(GLib.PRIORITY_DEFAULT, null).catch(logError);

    return proxy;
}

export class BaseExtension extends Extension {
    enable() {
        this.$delegate = new this.$klass(this.getSettings());
    }

    disable() {
        omit(this, '$delegate');
    }
}

export class SourceManager {
    constructor(host, remove, add) {
        host.connectObject('destroy', () => this.removeSource(), getSignalHolder(host));
        this.removeSource = () => { remove(this._delegate); this._delegate = null; };
        this.addSource = (...args) => (this._delegate = add(...args));
    }

    refreshSource(...args) {
        this.removeSource();
        return this.addSource(...args);
    }
}

export class Fulu {
    constructor(prop, gset, obj, cluster) {
        this.prop = new WeakMap();
        this.gset = typeof gset === 'string' ? new Gio.Settings({ schema: gset }) : gset;
        this.attach(prop, obj, cluster);
    }

    get(prop, obj) {
        return (([key, type]) => this.gset[`get_${type}`](key))(this.prop.get(obj)[prop]);
    }

    set(prop, value, obj) {
        (([key, type]) => this.gset[`set_${type}`](key, value))(this.prop.get(obj)[prop]);
    }

    attach(props, obj, cluster) { // cluster && props <- { fulu: [key, type, output] }
        this.prop.has(obj) ? Object.assign(this.prop.get(obj), props) : this.prop.set(obj, props);
        let callback = cluster ? x => { obj[cluster] = [x, this.get(x, obj), this.prop.get(obj)[x][2]]; } : x => { obj[x] = this.get(x, obj); };
        Object.entries(props).forEach(([k, [x]]) => { callback(k); this.gset.connectObject(`changed::${x}`, () => callback(k), getSignalHolder(obj)); });
        return this;
    }

    detach(obj) {
        this.gset.disconnectObject(getSignalHolder(obj));
    }
}
