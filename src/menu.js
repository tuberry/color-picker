// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Atk from 'gi://Atk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';

import {ROOT, noop} from './util.js';
import {Source, view, myself, connect} from './fubar.js';

export const offstage = x => !Main.uiGroup.contains(x);
export const lookupIcon = x => St.IconTheme.new().lookup_icon(x, -1, St.IconLookupFlags.FORCE_SVG);

export class StIcon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor({icon = '', ...param}) {
        super({...param});
        this.setIcon(icon);
    }

    setIcon(icon) {
        this.set_icon_name(icon);
        if(!icon || lookupIcon(icon)) return;
        this.set_fallback_gicon(Gio.Icon.new_for_string(`${ROOT}/icons/hicolor/scalable/status/${icon}.svg`));
    }
}

export class Systray extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(menu, icon, pos, box, prop, text) {
        let {uuid, metadata: {name}} = myself();
        super(0.5, text ?? name, !menu);
        this.$box = new St.BoxLayout({styleClass: 'panel-status-indicators-box'});
        this.add_child(this.$box);
        this.$icon = new StIcon({icon, styleClass: 'system-status-icon'});
        this.$box.add_child(this.$icon);
        this.addToBox = x => this.$box.add_child(x);
        Main.panel.addToStatusArea(uuid, this, pos, box);
        if(menu) Object.values(this.$menu = menu).forEach(x => this.menu.addMenuItem(x));
        this.set(prop);
    }
}

export class IconButton extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(param, callback, icon = '', tip) {
        let mutable = Array.isArray(icon);
        let accessibleRole = mutable ? Atk.Role.TOGGLE_BUTTON : Atk.Role.PUSH_BUTTON;
        super({canFocus: true, accessibleRole, ...param});
        this.$src = Source.fuse({
            tip: new Source((...xs) => this.$genTip(...xs)),
            show: Source.newTimer(() => [() => this.$showTip(true), 250], true, () => this.$showTip(false)),
        }, this);
        if(icon !== null) this.$buildWidgets(mutable, icon, tip);
        this.connect('clicked', callback);
    }

    setIcon(icon) {
        this.child?.setIcon(icon);
        this.$src.tip.hub?.updateText();
    }

    $buildWidgets(mutable, icon, tip) {
        if(mutable) {
            let [status, on, off] = icon;
            this.set_child(new StIcon({styleClass: 'popup-menu-icon', icon: status ? on : off}));
            this.connect('clicked', () => this.setIcon({[on]: off, [off]: on}[this.child.get_icon_name()]));
            if(tip) this.$src.tip.summon(() => ({[on]: tip[0], [off]: tip[1]}[this.child.get_icon_name()]));
        } else {
            this.set_child(new StIcon({styleClass: 'popup-menu-icon', icon}));
            if(tip) this.$src.tip.summon(tip);
        }
    }

    $genTip(arg) {
        if(!arg) return;
        let cb = arg instanceof Function;
        let tip = new BoxPointer.BoxPointer(St.Side.TOP);
        tip.set({visible: false, styleClass: 'popup-menu-boxpointer'});
        tip.updateText = cb ? () => tip.bin.child.set_text(arg()) : noop;
        tip.bin.set_child(new St.Label({text: cb ? arg() : arg, styleClass: 'dash-label'}));
        connect(tip, this, 'notify::hover', () => this.$src.show.toggle(this.hover));
        return tip;
    }

    $showTip(show) {
        let tip = this.$src.tip?.hub;
        if(!tip) return;
        if(show) {
            tip.updateText();
            tip.setPosition(this, 0.1);
            if(offstage(tip)) Main.layoutManager.addTopChrome(tip);
            tip.open(BoxPointer.PopupAnimation.FULL);
        } else {
            if(offstage(tip)) return;
            tip.close(BoxPointer.PopupAnimation.FADE);
            Main.layoutManager.removeChrome(tip);
        }
    }
}

export class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(icons, param, prop) {
        super({activate: false, can_focus: false, ...param});
        Object.entries(icons).forEach(([k, [p, ...v]]) => this.add_child(new IconButton({xExpand: true, label: k, ...p}, ...v)));
        this.$updateVisible();
        this.set(prop);
    }

    getIcon(label) {
        return [...this].find(x => x.label === label);
    }

    viewIcon(label, visible) {
        view(visible, this.getIcon(label));
        this.$updateVisible();
    }

    $updateVisible() {
        // NOTE: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator/some#browser_compatibility
        view([...this].some(x => x.visible), this);
    }
}

export class SwitchItem extends PopupMenu.PopupSwitchMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, active, callback, param, prop) {
        super(text, active, param);
        this.connect('toggled', a => callback(a.state));
        this.set(prop);
    }
}

export class MenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text = '', callback, param, prop) {
        super(text, param);
        this.$callback = callback;
        this.connect('activate', (...xs) => this.$callback(...xs));
        this.set(prop);
    }

    setItem(label, callback) {
        this.label.set_text(label);
        this.$callback = callback;
    }
}

export class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(category, options, chosen, callback, prop) {
        super('');
        this.$category = category;
        this.$callback = callback;
        this.setOptions(options, chosen);
        this.set(prop);
    }

    setChosen(chosen) {
        this.$chosen = chosen;
        this.label.set_text(`${this.$category}：${this.$options[chosen] || ''}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(chosen === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT));
    }

    setOptions(options, chosen = this.$chosen) {
        this.$options = options;
        let choices = Object.entries(options),
            items = this.menu._getMenuItems(),
            diff = choices.length - items.length;
        if(diff > 0) for(let i = 0; i < diff; i++) this.menu.addMenuItem(new MenuItem());
        else if(diff < 0) do items.at(diff).destroy(); while(++diff < 0);
        this.menu._getMenuItems().forEach((x, i) => (([k, v]) => x.setItem(v, () => this.$callback(k)))(choices[i]));
        this.setChosen(chosen);
    }
}
