// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';
import * as FileUtils from 'resource:///org/gnome/shell/misc/fileUtils.js';
import * as Extensions from 'resource:///org/gnome/shell/extensions/extension.js';
import * as SignalTracker from 'resource:///org/gnome/shell/misc/signalTracker.js';

import * as T from './util.js';
const {$, $$, $_, hub} = T;

const ruin = o => o.destroy();
const raise = x => { throw Error(x); }; // NOTE: https://github.com/tc39/proposal-throw-expressions#todo
// NOTE: see https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/2542
const onus = o => [o, o[hub]].find(x => GObject.type_is_a(x, GObject.Object) && GObject.signal_lookup('destroy', x)) ?? raise('undestroyable');

export const _ = Extensions.gettext;
export const offstage = x => !Main.uiGroup.contains(x);
export const me = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
export const debug = (...xs) => me().getLogger().debug(...xs); // FIXME: see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const theme = () => St.ThemeContext.get_for_stage(global.stage);
export const marks = (x, m) => x.clutterText.set_markup(`\u{200b}${m}`); // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
export const omit = (o, ...ks) => ks.forEach(k => { ruin(o[k]); delete o[k]; });
export const view = (v, ...ws) => ws.forEach(w => w && !T.xnor(v, w.visible) && (v ? w.show() : w.hide())); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
export const connect = (tracker, ...args) => (t => args.reduce((p, x) => (x.connectObject ? p.push([x]) : p.at(-1).push(x), p), [])
    .forEach(([emitter, ...xs]) => emitter.connectObject(...xs, t)))(onus(tracker));
export const disconnect = (tracker, ...args) => (t => args.forEach(emitter => emitter?.disconnectObject(t)))(onus(tracker));
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise((resolve, reject) => St.Clipboard.get_default().get_text(primary ? St.ClipboardType.PRIMARY
    : St.ClipboardType.CLIPBOARD, (_c, x) => x ? resolve(x) : reject(Error('empty'))));

export class DBusProxy extends Gio.DBusProxy {
    static {
        T.enrol(this);
    }

    [hub] = new SignalTracker.TransientSignalHolder(this);

    constructor(name, path, callback, hooks, signals, xml, cancel = null, bus = Gio.DBus.session, gFlags = Gio.DBusProxyFlags.NONE) {
        let info = Gio.DBusInterfaceInfo.new_for_xml(xml ?? FileUtils.loadInterfaceXML(name));
        super({gConnection: bus, gName: name, gObjectPath: path, gInterfaceInfo: info, gFlags, gInterfaceName: info.name})[$_]
            .connectObject(hooks, ...hooks?.flat() ?? [], onus(this))[$$]
            .connectSignal(signals ?? [])
            .init_async(GLib.PRIORITY_DEFAULT, cancel).then(() => callback(this, null)).catch(e => callback(null, e));
    }

    destroy() {
        Signals.EventEmitter.prototype.disconnectAll.call(this);
        omit(this, hub);
    }
}

export class Mortal extends Signals.EventEmitter {
    [hub] = new SignalTracker.TransientSignalHolder(this);

    destroy() {
        omit(this[$].emit('destroy')[$].disconnectAll(), hub);
    }
}

export class Extension extends Extensions.Extension {
    constructor(...args) {
        T.load(`${T.ROOT}/resource/extension.gresource`);
        super(...args);
    }

    enable() {
        this[hub] = new this.$klass(this.getSettings());
    }

    disable() {
        omit(this, hub);
    }
}

export class Source {
    /** @template T * @param {T} doom * @return {T} */
    static tie = (doom, host) => (host.connect('destroy', () => omit(doom, ...Object.keys(doom))), doom);

    static cancelled = error => error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    static newCancel = (...args) => new Source(() => new Gio.Cancellable(), x => x.cancel(), ...args)[$].reborn(function (...xs) { return this[$].revive(...xs).hub; });

    static newDBus(name, path, host, ...args) {
        let impl = new Source(x => Gio.DBusExportedObject.wrapJSObject(FileUtils.loadInterfaceXML(name), host)[$].export(x, path), x => x.unexport());
        return new Source(() => Gio.DBus.own_name(Gio.BusType.SESSION, name, Gio.BusNameOwnerFlags.NONE, x => impl.summon(x), null, null),
            x => { Gio.bus_unown_name(x); impl.dispel(); }, ...args);
    }

    static newKeys(gset, key, callback, ...args) {
        return new Source(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, callback),
            () => Main.wm.removeKeybinding(key), ...args);
    }

    static newTimer(callback, remove = true, clear, ...args) {
        return remove ? new Source((...xs) => setTimeout(...callback(...xs)), clear ? x => clear(clearTimeout(x)) : clearTimeout, ...args)
            : new Source((...xs) => setInterval(...callback(...xs)), clear ? x => clear(clearInterval(x)) : clearInterval, ...args);
    }

    static newDefer(callback, check, interval, clear, ...args) { // polling until...
        return Source.new(() => T.seq(Source.newTimer(x => [x, interval], true, clear),
            async (timer, until, count = 0) => { while(!(until = await check(count++))) await new Promise(r => timer.revive(r)); callback(until); }), ...args);
    }

    static newHandler(emitter, signal, callback, ...args) {
        return new Source(() => emitter.connect(signal, callback), x => emitter.disconnect(x), ...args);
    }

    static newMonitor(file, callback, ...args) {
        return new Source((cancel = null) => T.fopen(file).monitor(Gio.FileMonitorFlags.NONE, cancel)[$].connect('changed', callback), x => x.cancel(), ...args);
    }

    static newInvoker(source, callback) { // NOTE: ? https://github.com/tc39/proposal-explicit-resource-management
        return Source.new(source)[$].invoke(function (...xs) { let src = this[$].revive().hub; return callback(...xs).finally(() => src.destroy()); });
    }

    static newInjector(overrides, enable, update) {
        let manager = new Extensions.InjectionManager();
        return new Source(() => (T.each(([proto, methods]) => T.unit(methods, Object.entries).forEach(([name, func]) => manager.overrideMethod(proto, name,
            former => function (...xs) { return func(this, former, xs); })), overrides, 2), update?.()), () => (manager.clear(), update?.()), enable);
    }

    static new(summon, ...args) {
        return new Source(summon, undefined, ...args);
    }

    constructor(summon, dispel = ruin, enable, ...args) {
        this[$].summon(((...xs) => { this[hub] = summon(...xs); })[$_].call(enable, null, ...args))[$]
            .dispel(() => { if(this.active) dispel(this[hub]), delete this[hub]; });
    }

    revive(...xs) { this[$].dispel().summon(...xs); }
    reload(...xs) { if(this.active) this.revive(...xs); }
    switch(b, ...xs) { b ? this.revive(...xs) : this.dispel(); }
    toggle(b, ...xs) { if(!T.xnor(b, this.active)) b ? this.summon(...xs) : this.dispel(); }

    get hub() {
        return this[hub];
    }

    get active() {
        return Object.hasOwn(this, hub);
    }

    destroy() {
        this.dispel();
        this.dispel = this.summon = T.nop;
    }
}

export class Setting {
    constructor(gset, ...args) {
        this[$][hub](T.str(gset) ? new Gio.Settings({schema: gset}) : gset)[$].tie(...args);
    }

    get hub() {
        return this[hub];
    }

    set(field, value) {
        this[hub].set_value(field, new GLib.Variant(this[hub].get_value(field).get_type_string(), value));
    }

    not(field) {
        this[hub].set_boolean(field, !this[hub].get_boolean(field));
    }

    tie(ring, host, cast, post) {
        T.unit(ring, Object.values).forEach(args => {
            let [keys, turn, back, init] = T.unit(args);
            let [key, field = keys] = T.unit(keys);
            if(key in host) throw Error(`field conflict: ${field}`);
            let call = (f, x) => f(x, key) ?? x,
                pipe = (f, g) => f ? () => call(f, g()) : g, // NOTE: https://github.com/tc39/proposal-pipeline-operator
                read = pipe(turn, () => this[hub].get_value(field).recursiveUnpack()),
                load = (() => (host[key] = read()))[$].call();
            if(init) return;
            let sync = [post, cast, back, load].reduceRight((p, x) => pipe(x, p));
            connect(host, this[hub], `changed::${field}`, () => void sync());
        });
        cast?.();
        return this;
    }
}
