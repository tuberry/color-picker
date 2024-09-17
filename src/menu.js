// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

import * as Util from './util.js';
import * as Fubar from './fubar.js';

export const itemize = (x, y) => Object.values(x).forEach(z => z && y.addMenuItem(z));
export const findIcon = x => St.IconTheme.new().lookup_icon(x, -1, St.IconLookupFlags.FORCE_SVG);

export function upsert(table, insert, list, update, iter = x => x._getMenuItems()) {
    let items = iter(table);
    let delta = list.length - items.length;
    if(delta > 0) for(let i = 0; i < delta; i++) insert(table);
    else if(delta < 0) do items.at(delta).destroy(); while(++delta < 0);
    iter(table).forEach((x, i, a) => update(list[i], x, i, a));
}

export function record(ok, tray, ...args) {
    if(!tray) return;
    let {menu, $menu} = tray;
    Util.each(([gen, key, pos]) => {
        if(Util.xnor(ok, $menu[key])) return;
        ok ? menu.addMenuItem($menu[key] = gen?.() ?? new PopupMenu.PopupSeparatorMenuItem(),
            pos ? menu._getMenuItems().findIndex(x => x === $menu[pos]) : undefined) : Fubar.omit($menu, key);
    }, args, 3);
}

export function altNum(key, event, item) {
    return Util.seq(x => x && [...item].filter(y => y instanceof St.Button)[key - 49]?.emit('clicked', Clutter.BUTTON_PRIMARY),
        event.get_state() & Clutter.ModifierType.MOD1_MASK && key > 48 && key < 58); // Alt + 1..9
}

export class Icon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor({icon, ...param}) {
        super({...param});
        this.setup(icon);
    }

    setup(icon = '') {
        if(icon === this.icon_name) return;
        this.set_icon_name(icon);
        if(icon && !findIcon(icon)) this.set_fallback_gicon(Gio.Icon.new_for_string(`${Util.ROOT}/icons/hicolor/scalable/status/${icon}.svg`));
    }
}

export class Systray extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(menu, icon, pos, box, prop, text) {
        let {uuid, metadata: {name}} = Fubar.me();
        super(0.5, text ?? name, !menu);
        this.$box = new St.BoxLayout({styleClass: 'panel-status-indicators-box'});
        this.add_child(this.$box);
        this.$icon = new Icon({icon, styleClass: 'system-status-icon'});
        this.$box.add_child(this.$icon);
        Main.panel.addToStatusArea(uuid, this, pos, box);
        if(menu) itemize(this.$menu = menu, this.menu);
        this.set(prop);
    }
}

export class Button extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(param, callback, icon = '', tip) {
        super({canFocus: true, ...param});
        this.#buildSources();
        this.$callback = callback;
        this.set_child(new Icon({styleClass: 'popup-menu-icon'}));
        this.connect('clicked', (...xs) => this.$onClick(...xs));
        if(icon !== null) this.setup(icon);
        this.setTip(tip);
    }

    #buildSources() {
        let tip = new Fubar.Source((...xs) => this.#genTip(...xs));
        let show = Fubar.Source.newTimer(() => [() => this.#showTip(true), 250], true, () => this.#showTip(false));
        this.$src = Fubar.Source.tie({tip, show}, this);
    }

    #genTip(text) {
        let tip = new BoxPointer.BoxPointer(St.Side.TOP);
        tip.bin.set_child(new St.Label({styleClass: 'dash-label'}));
        tip.set({$text: text, visible: false, styleClass: 'popup-menu-boxpointer'});
        Fubar.connect(tip, this, 'notify::hover', x => this.$src.show.toggle(x.hover));
        return tip;
    }

    #showTip(show) {
        let {tip} = this;
        if(!tip) return;
        if(show) {
            tip.setPosition(this, 0.1);
            if(Fubar.offstage(tip)) Main.layoutManager.addTopChrome(tip);
            tip.open(BoxPointer.PopupAnimation.FULL);
        } else {
            if(Fubar.offstage(tip)) return;
            tip.close(BoxPointer.PopupAnimation.FADE);
            Main.layoutManager.removeChrome(tip);
        }
    }

    $onClick() {
        this.$callback();
    }

    setup(icon) {
        this.child.setup(icon);
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
        GObject.registerClass(this);
    }

    $onClick() {
        this.toggleState();
        this.$callback();
    }

    $setTip() {
        this.tip?.bin.child.set_text(this.tip.$text[this.$state ? 0 : 1]);
    }

    setup(icon) {
        let [state, ...icons] = icon;
        this.$icon = icons;
        this.toggleState(state ?? this.$state);
    }

    toggleState(state = !this.$state) {
        this.$state = state;
        this.child?.setup(this.$icon[this.$state ? 0 : 1]);
        this.$setTip();
    }
}

export class Item extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text = '', callback, param, prop) {
        super(text, param);
        this.$callback = callback;
        this.connect('activate', (...xs) => this.$callback(...xs));
        this.set(prop);
    }

    setup(label, callback) {
        this.label.set_text(label);
        this.$callback = callback;
    }
}

export class ToolItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(tool, param, prop) {
        super({activate: false, can_focus: false, ...param});
        this.setup(tool);
        this.set(prop);
    }

    setup(tool) {
        if(this.$tool) Fubar.omit(this, ...this.$tool);
        if(!Array.isArray(tool)) tool = Object.entries(tool);
        this.$tool = tool.flatMap(([k, v]) => v ? [Util.seq(() => this.add_child(this[k] ??= v), k)] : []);
    }
}

export class SwitchItem extends PopupMenu.PopupSwitchMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, active, callback, param, prop) {
        super(text, active, param);
        this.connect('toggled', a => callback(a.state)); // FIXME: revert when https://gitlab.gnome.org/GNOME/gnome-shell/-/merge_requests/3493
        this.set(prop);
    }
}

export class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static getopt = o => Util.omap(o, ([k, v]) => [[v, Fubar._(Util.upcase(k))]]);

    static {
        GObject.registerClass(this);
    }

    constructor(category, options, chosen, callback, prop) {
        super('');
        this.$category = category;
        this.$callback = callback;
        this.setup(options, chosen);
        this.set(prop);
    }

    choose(chosen) {
        this.$chosen = chosen;
        this.label.set_text(`${this.$category}：${this.$options[chosen] ?? ''}`);
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
        GObject.registerClass(this);
    }

    constructor(label, icon, callback, datum) {
        super('');
        this.set_can_focus(false);
        this.label.add_style_class_name(label);
        this.label.set({xExpand: true, canFocus: true});
        this.add_child(this.$btn = new Button({styleClass: icon}, () => this.$onClick()));
        if(callback) this.$onActivate = callback;
        if(datum) this.setup(datum);
    }

    #click() {
        if(this.$btn.visible) this.$btn.emit('clicked', Clutter.BUTTON_PRIMARY);
    }

    vfunc_key_press_event(event) {
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Control_L:
        case Clutter.KEY_Control_R: this.#click(); break;
        }
        return super.vfunc_key_press_event(event);
    }

    activate(event) {
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
        super.activate(event);
    }

    destroy() { // HACK: workaround for dangling ref & defocus on destroy & focus
        if(this.active) Object.defineProperty(this, 'active', {set: Util.noop});
        if(this.active || this.label.has_key_focus() || this.$btn.has_key_focus()) this._getTopMenu()?.actor.grab_key_focus();
        super.destroy();
    }
}

export class DatasetSection extends PopupMenu.PopupMenuSection {
    constructor(gen, dataset) {
        super();
        this.$genItem = gen;
        if(dataset) this.setup(dataset);
    }

    setup(dataset) {
        upsert(this, x => x.addMenuItem(this.$genItem()), dataset, (d, x) => x.setup(d));
    }
}
