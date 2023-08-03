// vim:fdm=syntax
// by tuberry
/* exported Destroyable Extension Fulu symbiose omit initLightProxy */
'use strict';

const { Gio, GLib } = imports.gi;
const { EventEmitter } = imports.misc.signals;
const SignalTracker = imports.misc.signalTracker;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const { loadInterfaceXML } = imports.misc.fileUtils;
const { amap } = Me.imports.util;

var omit = (o, ...ks) => ks.forEach(k => { o[k]?.destroy?.(); o[k] = null; });

if(!SignalTracker.hasOwnProperty('_Destroyable')) {
    SignalTracker._Destroyable = class _Destroyable extends EventEmitter {
        connect_after(...args) {
            return this.connectAfter(...args);
        }

        destroy() {
            this.emit('destroy');
        }
    };
    let _hasDestroySignal = SignalTracker._hasDestroySignal;
    SignalTracker._hasDestroySignal = x => _hasDestroySignal(x) || x instanceof SignalTracker._Destroyable;
}

function symbiose(host, doom, obj) {
    if(doom) new Symbiont(host, doom);
    if(obj) return amap(obj, v => new Symbiont(host, ...v));
}

function initLightProxy(callback, obj) {
    let BUS_NAME = 'org.gnome.SettingsDaemon.Color',
        colorInfo = Gio.DBusInterfaceInfo.new_for_xml(loadInterfaceXML(BUS_NAME)),
        proxy = new Gio.DBusProxy({
            g_name: BUS_NAME,
            g_connection: Gio.DBus.session,
            g_object_path: '/org/gnome/SettingsDaemon/Color',
            g_interface_name: colorInfo.name,
            g_interface_info: colorInfo,
        });
    proxy.connectObject('g-properties-changed', callback.bind(obj), obj);
    proxy.init_async(GLib.PRIORITY_DEFAULT, null).catch(logError);

    return proxy;
}

var Destroyable = SignalTracker._Destroyable;

var Extension = class {
    constructor(klass) {
        this._klass = klass;
        ExtensionUtils.initTranslations();
    }

    enable() {
        this._delegate = new this._klass();
    }

    disable() {
        omit(this, '_delegate');
    }
};

var Symbiont = class {
    constructor(host, dispel, summon) {
        host.connectObject('destroy', () => this.dispel(), host);
        this.summon = (...args) => (this._delegate = summon?.(...args));
        this.dispel = () => { dispel(this._delegate); this._delegate = null; };
    }

    revive(...args) {
        this.dispel();
        return this.summon(...args);
    }
};

var Fulu = class {
    constructor(prop, gset, obj, tie) {
        this.prop = new WeakMap();
        this.gset = typeof gset === 'string' ? new Gio.Settings({ schema: gset }) : gset;
        this.attach(prop, obj, tie);
    }

    get(prop, obj) {
        return (([key, type]) => this.gset[`get_${type}`](key))(this.prop.get(obj)[prop]);
    }

    set(prop, value, obj) {
        (([key, type]) => this.gset[`set_${type}`](key, value))(this.prop.get(obj)[prop]);
    }

    attach(props, obj, cluster) { // cluster && props <- { fulu: [key, type, output] }
        this.prop.has(obj) ? Object.assign(this.prop.get(obj), props) : this.prop.set(obj, props);
        let cb = cluster ? x => { obj[cluster] = [x, this.get(x, obj), this.prop.get(obj)[x][2]]; } : x => { obj[x] = this.get(x, obj); };
        Object.entries(props).forEach(([k, [x]]) => { cb(k); this.gset.connectObject(`changed::${x}`, () => cb(k), obj); });
        return this;
    }

    detach(obj) {
        this.gset.disconnectObject(obj);
    }
};
