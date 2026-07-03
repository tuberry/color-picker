// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Signals from 'resource:///org/gnome/shell/misc/signals.js';
import * as FileUtils from 'resource:///org/gnome/shell/misc/fileUtils.js';
import * as Extensions from 'resource:///org/gnome/shell/extensions/extension.js';

import * as T from './util.js';

const {$, $$, $_, hub} = T;

const ruin = o => o.destroy();

export const _ = Extensions.gettext;
export const offstage = x => !Main.uiGroup.contains(x);
export const me = () => Extension.lookupByURL(import.meta.url); // NOTE: https://github.com/tc39/proposal-json-modules
// export const debug = (...xs) => me().getLogger().debug(...xs); // FIXME: see https://gitlab.gnome.org/GNOME/gobject-introspection/-/issues/491
export const theme = () => St.ThemeContext.get_for_stage(global.stage);
export const marks = (x, m) => x.clutterText.set_markup(`\u{200b}${m}`); // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
export const held = (x, m) => Iterator.from(x.get_state()).drop(1).some(y => y & m); // https://mutter.gnome.org/clutter/method.KeyController.get_state.html
export const free = (o, ks) => T.unit(ks ?? Object.keys(o)).forEach(k => ruin(T.steal(o, k)));
export const view = (v, ...ws) => ws.forEach(w => w && !T.xnor(v, w.visible) && (v ? w.show() : w.hide())); // NOTE: https://github.com/tc39/proposal-optional-chaining-assignment
export const open = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
export const app = id => (a => a && apps().find(x => x === a) || null)(Shell.AppSystem.get_default().lookup_app(id));
export const temp = () => `${GLib.get_user_runtime_dir()}/gnome-shell/extensions/${me().uuid}`[$_](it => GLib.mkdir_with_parents(it, 0o700));
export const copy = (text, primary) => St.Clipboard.get_default().set_text(primary ? St.ClipboardType.PRIMARY : St.ClipboardType.CLIPBOARD, text);
export const paste = primary => new Promise((resolve, reject) => St.Clipboard.get_default().get_text(primary ? St.ClipboardType.PRIMARY
    : St.ClipboardType.CLIPBOARD, (_c, x) => x ? resolve(x) : reject(Error('empty'))));

export function* apps() {
    let appDisplay = Main.overview._overview._controls._appDisplay;
    yield* Object.values(appDisplay._appFavorites.getFavoriteMap());
    for(let item of appDisplay.getAllItems()) item.view ? yield* Iterator.from(item.view.getAllItems()).map(x => x.app) : yield item.app;
}

export function cursor([x, y] = global.get_pointer(), scale = 7 / 8) {
    let tracker = global.backend.get_cursor_tracker(),
        sprite = tracker.get_sprite(),
        [u, v] = tracker.get_hot();
    return [x - u, y - v, Math.round(sprite.get_width() * scale), Math.round(sprite.get_height() * scale)];
}

export class Mortal extends Signals.EventEmitter {
    constructor(set) {
        super()[$].$bindSettings?.(set).$buildSources?.();
    }

    set(...args) {
        return Object.assign(this, ...args);
    }

    destroy() {
        this[$].emit('destroy').disconnectAll();
    }
}

export class Extension extends Extensions.Extension {
    static {
        T.load(`${T.ROOT}/resource/extension.gresource`);
    }

    get hub() { return this[hub]; }

    enable() {
        this[hub] = new this.$klass(this.getSettings());
    }

    disable() {
        free(this, hub);
    }
}

export class Source {
    /** @template T * @param {T} doom * @return {T} */ // NOTE: https://github.com/tc39/proposal-type-annotations & https://github.com/jsdoc/jsdoc/issues/1986
    static tie(host, doom, ...args) {
        if(!((host instanceof Signals.EventEmitter && host.destroy) || GObject.signal_lookup('destroy', host))) throw TypeError('undestroyable');
        host.connect('destroy', () => { free(args); doom.destroy ? ruin(doom) : free(doom); });
        return doom;
    }

    static Cancel = class extends this {
        static expected = error => error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED);

        constructor(...args) {
            super(() => new Gio.Cancellable(), x => x.cancel(), ...args);
        }

        reborn(...xs) { return this[$].revive(...xs)[hub]; }
    };

    static DBus = class extends this {
        static respond(invocation, callback) {
            return Promise.try(callback).then(v => invocation.return_value(v instanceof GLib.Variant ? v : null)).catch(e => e instanceof GLib.Error
                ? invocation.return_gerror(e) : invocation.return_error_literal(Gio.DBusError, Gio.DBusError.FAILED, e.message || 'Operation failed'));
        }

        constructor(host, name, path, ...args) {
            super(() => new Source(x => Gio.DBusExportedObject.wrapJSObject(FileUtils.loadInterfaceXML(name), host)[$].export(x, path),
                x => x.unexport())[$_](it => it[$].$id(Gio.DBus.own_name(Gio.BusType.SESSION, name, Gio.BusNameOwnerFlags.NONE, x => it.summon(x),
                null, null))), x => { ruin(x); Gio.bus_unown_name(T.steal(x, '$id')); }, ...args);
        }
    };

    static Proxy = class extends this {
        constructor(name, path, init, hooks, signals, iface, bus, enable) {
            let Klass = Gio.DBusProxy.makeProxyWrapper(FileUtils.loadInterfaceXML(iface ?? name));
            super(x => new Klass(bus ?? Gio.DBus.session, x ?? name, path, init)[$$].connect(T.chunk(hooks ?? []))[$$].connectSignal(T.chunk(signals ?? [])),
                x => { Signals.EventEmitter.prototype.disconnectAll.call(x); hooks?.forEach(f => T.str(f) || GObject.signal_handlers_disconnect_by_func(x, f)); }, enable ?? name);
        }
    };

    static Keys = class extends this {
        constructor(gset, key, callback, ...args) {
            super(() => Main.wm.addKeybinding(key, gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, callback), () => Main.wm.removeKeybinding(key), ...args);
        }
    };

    static Timer = class extends this {
        constructor(callback, once = true, clear, ...args) {
            once ? super((...xs) => setTimeout(...callback(...xs)), clear ? x => clear(clearTimeout(x)) : clearTimeout, ...args)
                : super((...xs) => setInterval(...callback(...xs)), clear ? x => clear(clearInterval(x)) : clearInterval, ...args);
        }
    };

    static Defer = class extends this {
        constructor(callback, check, interval, clear, ...args) { // polling until...
            super(() => new Source.Timer(x => [x, interval], true, clear)[$_](async (timer, until, count = 0) => {
                while(!(until = await check(count++))) await new Promise(resolve => timer.revive(resolve)); callback(until);
            }), ...args);
        }
    };

    static Handler = class extends this {
        constructor(...args) { // enable by default
            super(() => T.chunk(args, x => x.connectObject).map(([o, ...xs]) => [o, ...T.chunk(xs, T.str).map(([s, f, a]) =>
                o[a === GObject.ConnectFlags.AFTER ? o instanceof GObject.Object ? 'connect_after' : 'connectAfter' : 'connect'](s, f))]).toArray(),
            x => x.forEach(([o, ...is]) => is.forEach(i => o.disconnect(i))), args.at(-1) !== false);
        }
    };

    static Monitor = class extends this {
        constructor(file, callback, ...args) {
            super((cancel = null) => T.fopen(file).monitor(Gio.FileMonitorFlags.NONE, cancel)[$].connect('changed', callback), x => x.cancel(), ...args);
        }
    };

    static Invoker = class extends this { // NOTE: ? https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/await_using
        constructor(source, callback) {   //  see also https://github.com/tc39/proposal-explicit-resource-management
            super(source)[$].invoke(function (...xs) { let src = this[$].revive()[hub]; return callback(...xs).finally(() => ruin(src)); });
        }
    };

    static Injector = class extends this {
        constructor(overrides, enable, update) {
            super(() => new Extensions.InjectionManager()[$_](it => (T.chunk(overrides).forEach(([o, fs]) => T.unit(fs, Object.entries)
                .forEach(([k, f]) => it.overrideMethod(o, k, m => function (...xs) { return f(this, m, xs); }))), update?.())), x => (x.clear(), update?.()), enable);
        }
    };

    static Keyboard = class extends this {
        static get focused() { return !!Main.inputMethod.currentFocus; }

        constructor(enable = true) {
            super(() => global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE),
                x => x.run_dispose(), enable); // run_dispose to release keys immediately
        }

        stroke(keys) {
            keys.forEach(k => this[hub].notify_keyval(Clutter.get_current_event_time() * 1000, k, Clutter.KeyState.PRESSED));
            keys.reverse().forEach(k => this[hub].notify_keyval(Clutter.get_current_event_time() * 1000, k, Clutter.KeyState.RELEASED));
        }

        commit(text, focused = Source.Keyboard.focused) {
            let threshold = 1234; // max bytes: Wayland msg / UTF-8 char = 4000 / 3 = 1333.3 ~ 1234, see also https://github.com/whatwg/encoding/issues/333
            let terminal = Main.inputMethod.contentPurpose === Clutter.InputContentPurpose.TERMINAL;
            if(text.length < threshold && focused) Main.inputMethod.commit(terminal ? `\x1b[200~${text}\x1b[201~` : text); // Ref: https://en.wikipedia.org/wiki/Bracketed-paste
            else copy(text), this.stroke([Clutter.KEY_Shift_L, ...terminal ? [Clutter.KEY_Control_L, Clutter.KEY_v] : [Clutter.KEY_Insert]]);
        }
    };

    constructor(summon, ...args) {
        let dispel, enable;
        if(typeof args[0] === 'function') [dispel, enable, ...args] = args;
        else dispel = ruin, [enable, ...args] = args;

        this.summon = (...xs) => { this[hub] = summon(...xs); };
        this.dispel = () => { if(this.active) dispel(T.steal(this, hub)); };
        if(enable) this.summon(...args);
    }

    revive(...xs) { this[$].dispel().summon(...xs); }
    reload(...xs) { if(this.active) this.revive(...xs); }
    switch(b, ...xs) { b ? this.revive(...xs) : this.dispel(); }
    toggle(b, ...xs) { if(!T.xnor(b, this.active)) b ? this.summon(...xs) : this.dispel(); }

    get hub() { return this[hub] instanceof Source ? this[hub].hub : this[hub]; }
    get active() { return Object.hasOwn(this, hub); }

    destroy() {
        this.dispel();
        this.dispel = this.summon = T.nop;
    }
}

export class Setting {
    constructor(gset) {
        this[hub] = T.str(gset) ? new Gio.Settings({schema: gset}) : gset;
    }

    get hub() { return this[hub]; }

    set(field, value) {
        this[hub].set_value(field, T.pickle(value, this[hub].get_value(field).get_type_string()));
    }

    add(field, delta) {
        let value = (v => T.pickle(v.unpack() + delta, v.get_type_string()))(this[hub].get_value(field));
        return this[hub].settingsSchema.get_key(field).range_check(value) && this[hub].set_value(field, value);
    }

    not(field) {
        this[hub].set_boolean(field, !this[hub].get_boolean(field));
    }

    tie(host, ...rest) {
        Source.tie(host, new Source.Handler(this[hub],
            ...T.chunk(rest, x => x && typeof x !== 'function').flatMap(([ring, cast, post]) =>
                T.unit(ring, Object.values).flatMap(args => {
                    let [keys, turn, back, init] = T.unit(args);
                    let [key, field = keys] = T.unit(keys);
                    if(key in host) throw TypeError(`key conflict: ${key}`);
                    let call = (f, x) => (v => v === undefined ? x : v)(f(x, key)),
                        pipe = (f, g) => f ? () => call(f, g()) : g, // NOTE: https://github.com/tc39/proposal-pipeline-operator
                        read = pipe(turn, () => this[hub].get_value(field).recursiveUnpack()),
                        load = (() => (host[key] = read()))[$].call();
                    if(init) return [];
                    let sync = [post, cast, back, load].reduceRight((p, x) => pipe(x, p));
                    return [`changed::${field}`, () => void sync()];
                })[$_](() => cast?.()))));
        return this;
    }
}
