// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

import * as T from './util.js';
import * as F from './fubar.js';

const {$, $_, $s, $$} = T;

export function upsert(table, insert, list, update, spread = x => x._getMenuItems()) {
    let items = spread(table);
    let delta = list.length - items.length;
    if(delta > 0) while(delta-- > 0) insert(table);
    else while(delta < 0) items.at(delta++).destroy();
    spread(table).forEach((x, i, a) => update(list[i], x, i, a));
}

export function altNum(event, item, key = event.get_key_symbol()) { // Ref: https://gitlab.gnome.org/GNOME/mutter/-/blob/main/clutter/clutter/clutter-keysyms.h
    return (event.get_state() & Clutter.ModifierType.MOD1_MASK && key >= Clutter.KEY_0 && key <= Clutter.KEY_9)[$$](it =>
        it && [...item].filter(x => x instanceof St.Button).at(key - Clutter.KEY_1)?.emit('clicked', Clutter.BUTTON_PRIMARY));
}

export const Separator = PopupMenu.PopupSeparatorMenuItem;

export class Icon extends St.Icon {
    static {
        T.enrol(this); // eslint-disable-next-line no-new-wrappers
        this.wrap = icon => (T.str(icon) ? new String(icon ?? '') : icon)[$].$gicon(true);
    }

    constructor(icon) { // HACK: ? revert for stale TextureCache since GNOME 50, see also https://gitlab.gnome.org/GNOME/gnome-shell/-/issues/1997
        super({iconName: T.str(icon) ? String(icon) : null})[$_].bind_property_full(icon?.$gicon, 'icon-name', this, 'fallback-gicon', T.SYNC,
            (_b, x) => [true, x && Gio.Icon.new_for_string(`resource:///org/gnome/shell/icons/scalable/status/${x}.svg`)], null);
    }
}

export class Systray extends PanelMenu.Button {
    static {
        T.enrol(this);
    }

    constructor(menu, icon = '', pos, box, text) {
        let {uuid, metadata: {name}} = F.me();
        super(0.5, text ?? name, !menu)[$].add_child(this.$box = new St.BoxLayout({styleClass: 'panel-status-indicators-box'})[$]
            .add_child(this.$icon = new Icon(icon)[$].set({styleClass: 'system-status-icon'})));
        if(menu) Item.put(this.menu, this.$menu = menu);
        Main.panel.addToStatusArea(uuid, this, pos, box);
    }

    $record(ok, ...args) {
        T.chunk(args).forEach(([key, gen]) => {
            if(T.xnor(ok, this.$menu[key])) return;
            if(ok) {
                let index = 0;
                for(let k in this.$menu) { // string keys in insert order
                    if(k === key) break;
                    if(this.$menu[k]) index++;
                }
                this.$menu[key] = gen?.() ?? new Separator();
                this.menu.addMenuItem(this.$menu[key], index);
            } else {
                this.$menu[key].destroy();
                this.$menu[key] = null;
            }
        });
    }
}

export class Button extends St.Button {
    static {
        T.enrol(this);
    }

    constructor(func, icon = '', tip, label) {
        super({canFocus: true})[$].$buildSources()[$_]
            .setup(func, func, icon, tip, label)
            .connect('clicked', (...xs) => this.$meta.func(...xs));
    }

    $buildSources() {
        this.$src = F.Source.tie(this, {
            tip: F.Source.new(() => {
                let ret = new BoxPointer.BoxPointer(St.Side.TOP)[$].set({visible: false, styleClass: 'popup-menu-boxpointer'}),
                    show = F.Source.newTimer(() => [() => {
                        if(F.offstage(ret)) Main.layoutManager.addTopChrome(ret);
                        ret[$].setPosition(this, 0.1).open(BoxPointer.PopupAnimation.FULL);
                    }, 250], true, () => F.offstage(ret) || Main.layoutManager.removeChrome(ret[$].close(BoxPointer.PopupAnimation.FADE))),
                    hover = F.Source.newHandler(this, 'notify::hover', x => show.toggle(x.hover));
                F.Source.tie(ret, show, hover);
                ret.bin.set_child(new St.Label({styleClass: 'dash-label'}));
                ret.update = () => ret.bin.child.set_text(this.$meta.tip);
                return ret;
            }),
        });
    }

    setup(func, icon, tip, label) {
        this[$].$meta(new Proxy({func}, {get: (t, k) => Array.isArray(t[k]) ? t[k][1 - t.state] : t[k]}))[$].setIcon(icon, label).setTip(tip);
    }

    setIcon(icon, label) {
        this[$$](it => Object.assign(it.$meta, {icon, label}, Array.isArray(icon) ? {state: icon.shift()} : null)).$update();
    }

    setTip(tip) {
        this.$src.tip[$].toggle(this.$meta.tip = tip).hub?.update();
    }

    toggleState(state = !this.$meta.state) {
        if(state === this.$meta.state) return;
        this.$meta.state = state;
        this.$src.tip.hub?.update();
        this.$update();
    }

    $update() {
        if(this.$meta.label) this.set_label(this.$meta.label);
        else if(this.child instanceof Icon) this.set_icon_name(this.$meta.icon?.toString());
        else this.set_child(new Icon(this.$meta.icon)[$].set({styleClass: 'popup-menu-icon'}));
    }
}

export class Item extends PopupMenu.PopupMenuItem {
    static {
        T.enrol(this);
        this.put = (menu, items) => menu[$s].addMenuItem(T.unit(items, Object.values).filter(T.id));
    }

    constructor(text = '', func, param) {
        super(text, param)[$_].$callback(func, func).connect('activate', (...xs) => this.$callback(...xs));
    }

    setup(label, callback) {
        this.label.set_text(label);
        this.$callback = callback;
    }
}

export class ToolItem extends PopupMenu.PopupBaseMenuItem {
    static {
        T.enrol(this);
    }

    constructor(tool, param) {
        super({activate: false, can_focus: false, ...param}).setup(tool);
    }

    setup([tool, styleClass]) {
        if(this.$tool) F.erase(this, this.$tool);
        this.$tool = T.unit(tool, Object.entries).flatMap(([k, v]) => {
            if(k in this) throw Error(`key conflict: ${k}`);
            else return v ? [(this.add_child(this[k] = new Button(...v)[$].set({xExpand: true, styleClass})), k)] : [];
        });
    }
}

export class SwitchItem extends PopupMenu.PopupSwitchMenuItem {
    static {
        T.enrol(this);
    }

    constructor(text, active, callback, param) {
        super(text, active, param).connect('toggled', (_a, state) => callback(state));
    }
}

export class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        T.enrol(this);
        this.getopt = o => T.omap(o, ([k, v]) => [[v, F._(T.upcase(k))]]);
    }

    constructor(category, options, chosen, callback) {
        super('')[$].$meta({category, callback}).setup(options, chosen);
    }

    choose(chosen) {
        this.$meta.chosen = chosen;
        this.label.set_text(`${this.$meta.category}: ${this.$meta.options[chosen] ?? ''}`);
        this.menu._getMenuItems().forEach((x, i) => x.setOrnament(chosen === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT));
    }

    setup(options, chosen = this.$meta.chosen) {
        this.$meta.options = options;
        upsert(this.menu, x => x.addMenuItem(new Item()), Object.entries(options), ([k, v], x) => x.setup(v, () => this.$meta.callback(k)));
        this.choose(chosen);
    }
}

export class DatumItemBase extends PopupMenu.PopupMenuItem {
    static {
        T.enrol(this);
    }

    constructor(label, icon, func, datum) {
        super('')[$].can_focus(false)[$]
            .add_child(this.$btn = new Button(() => this.$onClick())[$].set({styleClass: icon}))[$_]
            .$onActivate(func, func)[$_]
            .setup(datum, datum);
        this.label[$].add_style_class_name(label)
            .set({xExpand: true, canFocus: true});
    }

    $activateTail() {
        if(this.$btn.visible) this.$btn.emit('clicked', Clutter.BUTTON_PRIMARY);
    }

    vfunc_key_press_event(event) {
        if(event.get_key_symbol() === Clutter.KEY_Control_L) this.$activateTail();
        return super.vfunc_key_press_event(event);
    }

    activate(event) {
        super.activate(event);
        switch(event.type()) {
        case Clutter.EventType.BUTTON_RELEASE:
        case Clutter.EventType.PAD_BUTTON_RELEASE: if(event.get_button() === Clutter.BUTTON_SECONDARY) return this.$activateTail();
        }
        this.$onActivate();
    }

    destroy() {
        if(this.active || this.label.has_key_focus() || this.$btn.has_key_focus()) this._getTopMenu()?.actor.grab_key_focus();
        if(this.active) Reflect.defineProperty(this, 'active', {set: T.nop}); // HACK: workaround for dangling ref & defocus on destroy & focus
        super.destroy();
    }
}

export class DatasetSection extends PopupMenu.PopupMenuSection {
    constructor(gen, dataset) {
        super()[$].$genItem(gen)[$_].setup(dataset, dataset);
    }

    setup(dataset) {
        upsert(this, x => x.addMenuItem(this.$genItem()), dataset, (d, x) => x.setup(d));
    }
}
