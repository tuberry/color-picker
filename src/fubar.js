// vim:fdm=syntax
// by tuberry
/* exported DummyActor Extension Fulu symbiose omit onus */
'use strict';

const { Gio } = imports.gi;
const { EventEmitter } = imports.misc.signals;
const SignalTracker = imports.misc.signalTracker;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { amap, raise } = Me.imports.util;

var omit = (o, ...ks) => ks.forEach(k => { o[k]?.destroy?.(); o[k] = null; });
var onus = o => [o, o.$scapegoat].find(x => SignalTracker._hasDestroySignal(x)) ?? raise('undestroyable');

function symbiose(host, doom, obj) {
    if(doom) new Symbiont(host, doom);
    if(obj) return amap(obj, v => new Symbiont(host, ...v));
}

var DummyActor = class extends EventEmitter {
    constructor() {
        super();
        this.$scapegoat = new SignalTracker.TransientSignalHolder(this);
    }

    destroy() {
        this.emit('destroy');
        omit(this, '$scapegoat');
    }
};

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
        host.connectObject('destroy', () => this.dispel(), onus(host));
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

    get(p, a) {
        return (([k, t]) => this.gset[`get_${t}`](k))(this.prop.get(a)[p]);
    }

    set(p, v, a) {
        (([k, t]) => this.gset[`set_${t}`](k, v))(this.prop.get(a)[p]);
    }

    attach(ps, a, n) { // n && ps <- { fulu: [key, type, output] }
        this.prop.has(a) ? Object.assign(this.prop.get(a), ps) : this.prop.set(a, ps);
        let cb = n ? x => { a[n] = [x, this.get(x, a), this.prop.get(a)[x][2]]; } : x => { a[x] = this.get(x, a); };
        Object.entries(ps).forEach(([k, [x]]) => { cb(k); this.gset.connectObject(`changed::${x}`, () => cb(k), onus(a)); });
        return this;
    }

    detach(a) {
        this.gset.disconnectObject(onus(a));
    }
};
