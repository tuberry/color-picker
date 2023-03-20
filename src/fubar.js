// vim:fdm=syntax
// by tuberry
/* exported DEventEmitter Extension Fulu symbiose omit onus */
'use strict';

const { Gio } = imports.gi;
const { EventEmitter } = imports.misc.signals;
const { TransientSignalHolder } = imports.misc.signalTracker;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { omap } = Me.imports.util;

var onus = o => o instanceof DEventEmitter ? o.$scapegoat : o;
var omit = (o, ...ks) => ks.forEach(k => { o[k]?.destroy?.(); o[k] = null; });

function symbiose(host, doom, obj) {
    if(doom) new Symbiont(host, doom);
    if(obj) return omap(obj, ([k, v]) => [[k, new Symbiont(host, ...v)]]);
}

var DEventEmitter = class extends EventEmitter {
    constructor() {
        super();
        this.$scapegoat = new TransientSignalHolder(this);
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

    get(k, a) {
        return this.gset[`get_${this.prop.get(a)[k][1]}`](this.prop.get(a)[k][0]);
    }

    set(k, v, a) {
        this.gset[`set_${this.prop.get(a)[k][1]}`](this.prop.get(a)[k][0], v);
    }

    attach(ps, a, n) { // n && ps <- { fulu: [key, type, output] }
        if(!this.prop.has(a)) this.prop.set(a, ps);
        else Object.assign(this.prop.get(a), ps);
        let cb = n ? x => { a[n] = [x, this.get(x, a), this.prop.get(a)[x][2]]; } : x => { a[x] = this.get(x, a); };
        let fs = Object.entries(ps);
        fs.forEach(([k]) => cb(k));
        this.gset.connectObject(...fs.flatMap(([k, [x]]) => [`changed::${x}`, () => cb(k)]), onus(a));
        return this;
    }

    detach(a) {
        this.gset.disconnectObject(onus(a));
    }
};
