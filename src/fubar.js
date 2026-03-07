// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import IBus from 'gi://IBus';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';
import * as FileUtils from 'resource:///org/gnome/shell/misc/fileUtils.js';
import * as Extensions from 'resource:///org/gnome/shell/extensions/extension.js';

import * as T from './util.js';

const {$, $s, $_, $$, hub} = T;

const ruin = o => o.destroy();

export const _ = Extensions.gettext;
export const offstage = x => !Main.uiGroup.contains(x);
export const me = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
// export const debug = (...xs) => me().getLogger().debug(...xs); // FIXME: see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const theme = () => St.ThemeContext.get_for_stage(global.stage);
export const marks = (x, m) => x.clutterText.set_markup(`\u{200b}${m}`); // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
export const yank = (o, k) => { let v = o[k]; delete o[k]; return v; };
export const erase = (o, ks) => T.unit(ks ?? Object.keys(o)).forEach(k => ruin(yank(o, k)));
export const view = (v, ...ws) => ws.forEach(w => w && !T.xnor(v, w.visible) && (v ? w.show() : w.hide())); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const bracket = text => Main.inputMethod._purpose === IBus.InputPurpose.TERMINAL && text.includes('\n') ? `\x1b[200~${text}\x1b[201~` : text; // Ref: https://en.wikipedia.org/wiki/Bracketed-paste
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise((resolve, reject) => St.Clipboard.get_default().get_text(primary ? St.ClipboardType.PRIMARY
    : St.ClipboardType.CLIPBOARD, (_c, x) => x ? resolve(x) : reject(Error('empty'))));

export class Mortal extends Signals.EventEmitter {
    constructor(set) {
        super()[$].$bindSettings?.(set).$buildSources?.();
    }

    destroy() {
        this[$].emit('destroy').disconnectAll();
    }
}

export class Extension extends Extensions.Extension {
    static {
        T.load(`${T.ROOT}/resource/extension.gresource`);
    }

    enable() {
        this[hub] = new this.$klass(this.getSettings());
    }

    disable() {
        erase(this, hub);
    }
}

export class Source {
    /** @template T * @param {T} doom * @return {T} */ // NOTE: https://github.com/tc39/proposal-type-annotations & https://github.com/jsdoc/jsdoc/issues/1986
    static tie(host, doom, ...args) {
        if(!(host instanceof Mortal || GObject.signal_lookup('destroy', host))) throw Error('undestroyable');
        host.connect('destroy', () => { erase(args); doom instanceof Source ? ruin(doom) : erase(doom); });
        return doom;
    }

    static cancelled = error => error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);
    static newCancel = (...args) => new Source(() => new Gio.Cancellable(), x => x.cancel(), ...args)[$].reborn(function (...xs) { return this[$].revive(...xs)[hub]; });

    static newDBus(host, name, path, ...args) {
        return new Source(() => new Source(x => Gio.DBusExportedObject.wrapJSObject(FileUtils.loadInterfaceXML(name), host)[$].export(x, path),
            x => x.unexport())[$$](it => it[$].$id(Gio.DBus.own_name(Gio.BusType.SESSION, name, Gio.BusNameOwnerFlags.NONE, x => it.summon(x), null, null))),
        x => { ruin(x); Gio.bus_unown_name(yank(x, '$id')); }, ...args);
    }

    static newDBusProxy(name, path, init, hooks, signals, iface, bus, enable) {
        let Klass = Gio.DBusProxy.makeProxyWrapper(FileUtils.loadInterfaceXML(iface ?? name));
        return new Source(x => new Klass(bus ?? Gio.DBus.session, x ?? name, path, init)[$s].connect(T.chunk(hooks ?? []))[$s].connectSignal(T.chunk(signals ?? [])),
            x => { Signals.EventEmitter.prototype.disconnectAll.call(x); hooks?.forEach(f => T.str(f) || GObject.signal_handlers_disconnect_by_func(x, f)); }, enable ?? name);
    }

    static newKeys(gset, key, callback, ...args) {
        return new Source(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, callback), () => Main.wm.removeKeybinding(key), ...args);
    }

    static newTimer(callback, remove = true, clear, ...args) {
        return remove ? new Source((...xs) => setTimeout(...callback(...xs)), clear ? x => clear(clearTimeout(x)) : clearTimeout, ...args)
            : new Source((...xs) => setInterval(...callback(...xs)), clear ? x => clear(clearInterval(x)) : clearInterval, ...args);
    }

    static newDefer(callback, check, interval, clear, ...args) { // polling until...
        return Source.new(() => Source.newTimer(x => [x, interval], true, clear)[$$](async (timer, until, count = 0) => {
            while(!(until = await check(count++))) await new Promise(resolve => timer.revive(resolve)); callback(until);
        }), ...args);
    }

    static newHandler(...args) { // enable by default
        return new Source(() => T.chunk(args, x => x.connectObject).map(([o, ...xs]) => [o, ...T.chunk(xs, T.str).map(([s, f, a]) =>
            o[a === GObject.ConnectFlags.AFTER ? o instanceof GObject.Object ? 'connect_after' : 'connectAfter' : 'connect'](s, f))]).toArray(),
        x => x.forEach(([o, ...is]) => is.forEach(i => o.disconnect(i))), args.at(-1) !== false);
    }

    static newMonitor(file, callback, ...args) {
        return new Source((cancel = null) => T.fopen(file).monitor(Gio.FileMonitorFlags.NONE, cancel)[$].connect('changed', callback), x => x.cancel(), ...args);
    }

    static newInvoker(source, callback) { // NOTE: ? https://github.com/tc39/proposal-explicit-resource-management
        return Source.new(source)[$].invoke(function (...xs) { let src = this[$].revive()[hub]; return callback(...xs).finally(() => ruin(src)); });
    }

    static newInjector(overrides, enable, update) {
        return new Source(() => new Extensions.InjectionManager()[$$](it => (T.chunk(overrides).forEach(([o, fs]) => T.unit(fs, Object.entries)
            .forEach(([k, f]) => it.overrideMethod(o, k, m => function (...xs) { return f(this, m, xs); }))), update?.())), x => (x.clear(), update?.()), enable);
    }

    static new(summon, ...args) {
        return new Source(summon, ruin, ...args);
    }

    constructor(summon, dispel, enable, ...args) {
        this[$].summon(((...xs) => { this[hub] = summon(...xs); })[$_].apply(enable, null, args))[$]
            .dispel(() => { if(this.active) dispel(yank(this, hub)); });
    }

    revive(...xs) { this[$].dispel().summon(...xs); }
    reload(...xs) { if(this.active) this.revive(...xs); }
    switch(b, ...xs) { b ? this.revive(...xs) : this.dispel(); }
    toggle(b, ...xs) { if(!T.xnor(b, this.active)) b ? this.summon(...xs) : this.dispel(); }

    get hub() {
        return this[hub] instanceof Source ? this[hub].hub : this[hub];
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
    constructor(gset, host, ...args) {
        this[$][hub](T.str(gset) ? new Gio.Settings({schema: gset}) : gset)[$_].tie(host, host, ...args);
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

    tie(host, ...rest) {
        Source.tie(host, Source.newHandler(this[hub],
            ...T.chunk(rest, x => x && !(x instanceof Function)).flatMap(([ring, cast, post]) =>
                T.unit(ring, Object.values).flatMap(args => {
                    let [keys, turn, back, init] = T.unit(args);
                    let [key, field = keys] = T.unit(keys);
                    if(key in host) throw Error(`key conflict: ${key}`);
                    let call = (f, x) => f(x, key) ?? x,
                        pipe = (f, g) => f ? () => call(f, g()) : g, // NOTE: https://github.com/tc39/proposal-pipeline-operator
                        read = pipe(turn, () => this[hub].get_value(field).recursiveUnpack()),
                        load = (() => (host[key] = read()))[$].call();
                    if(init) return [];
                    let sync = [post, cast, back, load].reduceRight((p, x) => pipe(x, p));
                    return [`changed::${field}`, () => void sync()];
                })[$$](() => cast?.()))));
        return this;
    }
}
