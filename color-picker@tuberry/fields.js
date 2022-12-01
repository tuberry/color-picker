// vim:fdm=syntax
// by tuberry
/* exported Fields Field Block */
'use strict';

const { Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

var Fields = {
    MENUKEY:        'menu-key',
    QUITKEY:        'quit-key',
    AUTOCOPY:       'auto-copy',
    MENUSIZE:       'menu-size',
    MENUSTYLE:      'menu-style',
    NOTIFYSTYLE:    'notify-style',
    ENABLEFORMAT:   'enable-format',
    ENABLENOTIFY:   'enable-notify',
    PREVIEW:        'preview-style',
    COLORSHISTORY:  'colors-history',
    ENABLEPREVIEW:  'enable-preview',
    ENABLESYSTRAY:  'enable-systray',
    FORMAT:         'default-format',
    ENABLESHORTCUT: 'enable-shortcut',
    PERSISTENTMODE: 'persistent-mode',
    COLORSCOLLECT:  'colors-collection',
    SYSTRAYICON:    'systray-dropper-icon',
    PICKSHORTCUT:   'color-picker-shortcut',
};

var Field = class {
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

    attach(ps, a, n) { // n && ps <- { field: [key, type, output] }
        a.setf ??= (k, v, f) => a[`_${f ?? ''}field`].set(k, v, a);
        if(!this.prop.has(a)) this.prop.set(a, ps);
        else Object.assign(this.prop.get(a), ps);
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

var Block = class {
    constructor(ws) {
        this.gset = ExtensionUtils.getSettings();
        for(let x in ws) this[x] = ws[x][2];
        Object.values(ws).forEach(([x, y, z]) => this.gset.bind(x, z, y, Gio.SettingsBindFlags.DEFAULT));
    }
};
