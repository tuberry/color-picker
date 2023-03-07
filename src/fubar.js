// vim:fdm=syntax
// by tuberry
/* exported DEventEmitter Extension Symbiont Fulu */
'use strict';

const { Gio } = imports.gi;
const { EventEmitter } = imports.misc.signals;
const ExtensionUtils = imports.misc.extensionUtils;

var DEventEmitter = class extends EventEmitter {
    destroy = () => this.emit('destroy');
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
        this._delegate.destroy();
        this._delegate = null;
    }
};

var Symbiont = class {
    constructor(dispel, obj, summon) {
        this.dispel = () => { dispel(this._delegate); this._delegate = null; };
        obj.connectObject('destroy', () => { this.dispel(); obj.disconnectObject(this); }, this);
        this.summon = (...argv) => (this._delegate = summon?.(...argv));
    }

    reset(...argv) {
        this.dispel();
        return this.summon(...argv);
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
        a.setf ??= (k, v, f) => a[`_fulu${f ? `_${f}` : ''}`].set(k, v, a);
        a._sbt_detach ??= new Symbiont(() => this.detach(a), a);
        if(!this.prop.has(a)) this.prop.set(a, ps);
        else  Object.assign(this.prop.get(a), ps);
        let cb = n ? x => { a[n] = [x, this.get(x, a), this.prop.get(a)[x][2]]; } : x => { a[x] = this.get(x, a); };
        let fs = Object.entries(ps);
        fs.forEach(([k]) => cb(k));
        this.gset.connectObject(...fs.flatMap(([k, [x]]) => [`changed::${x}`, () => cb(k)]), a);
        return this;
    }

    detach(a) {
        this.gset.disconnectObject(a);
    }
};
