// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

import * as T from './util.js';
import * as F from './fubar.js';

const {$, $_, $$} = T;

export const Separator = PopupMenu.PopupSeparatorMenuItem;

export function upsert(table, insert, list, update, spread = x => x._getMenuItems()) {
    let items = spread(table);
    let delta = list.length - items.length;
    if(delta > 0) for(let i = 0; i < delta; i++) insert(table);
    else if(delta < 0) do items.at(delta).destroy(); while(++delta < 0);
    spread(table).forEach((x, i, a) => update(list[i], x, i, a));
}

export function record(ok, tray, ...args) {
    if(!tray) return;
    let {menu, $menu} = tray;
    T.each(([gen, key, pos]) => {
        if(T.xnor(ok, $menu[key])) return;
        ok ? menu.addMenuItem($menu[key] = gen?.() ?? new Separator(),
            pos ? menu._getMenuItems().findIndex(x => x === $menu[pos]) : undefined) : F.omit($menu, key);
    }, args, 3);
}

export function altNum(event, item, key = event.get_key_symbol()) { // Ref: https://gitlab.gnome.org/GNOME/mutter/-/blob/main/clutter/clutter/clutter-keysyms.h
    return T.seq(event.get_state() & Clutter.ModifierType.MOD1_MASK && key >= Clutter.KEY_0 && key <= Clutter.KEY_9,
        x => x && [...item].filter(y => y instanceof St.Button).at(key - Clutter.KEY_1)?.emit('clicked', Clutter.BUTTON_PRIMARY));
}

export class Systray extends PanelMenu.Button {
    static {
        T.enrol(this);
    }

    constructor(menu, icon = '', pos, box, text) {
        let {uuid, metadata: {name}} = F.me();
        super(0.5, text ?? name, !menu)[$].add_child(this.$box = new St.BoxLayout({styleClass: 'panel-status-indicators-box'})[$]
            .add_child(this.$icon = new St.Icon({iconName: icon, styleClass: 'system-status-icon'})));
        if(menu) Item.add(this.$menu = menu, this.menu);
        Main.panel.addToStatusArea(uuid, this, pos, box);
    }
}

export class Button extends St.Button {
    static {
        T.enrol(this);
    }

    constructor(func, icon = '', tip) {
        super({canFocus: true})[$]
            .$buildSources()[$_]
            .$callback(func, func)[$]
            .set_child(new St.Icon({styleClass: 'popup-menu-icon'}))[$]
            .connect('clicked', (...xs) => this.$callback(...xs))[$_]
            .setup(icon !== null, icon)[$]
            .setTip(tip);
    }

    $buildSources() {
        let tip = new F.Source((...xs) => this.#genTip(...xs));
        let show = F.Source.newTimer(() => [() => this.#showTip(true), 250], true, () => this.#showTip(false));
        this.$src = F.Source.tie({tip, show}, this);
    }

    #genTip(text) {
        let ret = new BoxPointer.BoxPointer(St.Side.TOP)[$].set({$text: text, visible: false, styleClass: 'popup-menu-boxpointer'});
        F.connect(ret, this, 'notify::hover', x => this.$src.show.toggle(x.hover));
        ret.bin.set_child(new St.Label({styleClass: 'dash-label'}));
        return ret;
    }

    #showTip(show) {
        if(!this.tip) return;
        if(show) {
            if(F.offstage(this.tip)) Main.layoutManager.addTopChrome(this.tip);
            this.tip[$].setPosition(this, 0.1)[$].open(BoxPointer.PopupAnimation.FULL);
        } else {
            if(F.offstage(this.tip)) return;
            this.tip.close(BoxPointer.PopupAnimation.FADE);
            Main.layoutManager.removeChrome(this.tip);
        }
    }

    setup(icon) {
        this.child.set_icon_name(icon);
    }

    get tip() {
        return this.$src.tip.hub;
    }

    $setTip() {
        this.tip?.bin.child.set_text(this.tip.$text);
    }

    setTip(tip) {
        this.$src.tip.toggle(tip, tip);
        this.$setTip();
    }
}

export class StateButton extends Button {
    static {
        T.enrol(this);
    }

    $setTip() {
        this.tip?.bin.child.set_text(this.tip.$text[this.$state ? 0 : 1]);
    }

    setup(icon) {
        let [state, ...icons] = icon;
        this[$].$icon(icons)[$].toggleState(state ?? this.$state);
    }

    toggleState(state = !this.$state) {
        if(state === this.$state) return;
        this.child?.set_icon_name(this.$icon[state ? 0 : 1]);
        this[$].$state(state)[$].$setTip();
    }
}

export class Item extends PopupMenu.PopupMenuItem {
    static {
        T.enrol(this);
    }

    static add = (items, menu) => menu[$$].addMenuItem(T.unit(items, Object.values).filter(T.id));

    constructor(text = '', func, param) {
        super(text, param)[$_].$callback(func, func)[$].connect('activate', (...xs) => this.$callback(...xs));
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

    setup(tool) {
        if(this.$tool) F.omit(this, ...this.$tool);
        this.$tool = T.unit(tool, Object.entries).flatMap(([k, v]) => {
            if(k in this) throw Error(`key conflict: ${k}`);
            else return v ? [(this.add_child(this[k] = v), k)] : [];
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
    }

    static getopt = o => T.omap(o, ([k, v]) => [[v, F._(T.upcase(k))]]);

    constructor($category, options, chosen, $callback) {
        super('')[$].set({$category, $callback})[$].setup(options, chosen);
    }

    choose(chosen) {
        this.$chosen = chosen;
        this.label.set_text(`${this.$category}: ${this.$options[chosen] ?? ''}`);
        this.menu._getMenuItems().forEach((x, i) => x.setOrnament(chosen === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT));
    }

    setup(options, chosen = this.$chosen) {
        this.$options = options;
        upsert(this.menu, x => x.addMenuItem(new Item()), Object.entries(options), ([k, v], x) => x.setup(v, () => this.$callback(k)));
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
        this.label[$].add_style_class_name(label)[$]
            .set({xExpand: true, canFocus: true});
    }

    #click() {
        if(this.$btn.visible) this.$btn.emit('clicked', Clutter.BUTTON_PRIMARY);
    }

    vfunc_key_press_event(event) {
        if(event.get_key_symbol() === Clutter.KEY_Control_L) this.#click();
        return super.vfunc_key_press_event(event);
    }

    activate(event) {
        super.activate(event);
        switch(event.type()) {
        case Clutter.EventType.BUTTON_RELEASE:
        case Clutter.EventType.PAD_BUTTON_RELEASE:
            switch(event.get_button()) {
            case Clutter.BUTTON_SECONDARY: this.#click(); return;
            default: this.$onActivate(); break;
            }
            break;
        default: this.$onActivate(); break;
        }
    }

    destroy() { // HACK: workaround for dangling ref & defocus on destroy & focus
        if(this.active) Reflect.defineProperty(this, 'active', {set: T.nop});
        if(this.active || this.label.has_key_focus() || this.$btn.has_key_focus()) this._getTopMenu()?.actor.grab_key_focus();
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
