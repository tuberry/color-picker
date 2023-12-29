// vim:fdm=syntax
// by tuberry

import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ROOT_DIR } from './util.js';

export const genIcon = x => Gio.Icon.new_for_string(`${ROOT_DIR}/icons/hicolor/scalable/status/${x}.svg`);

export class TrayIcon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor(icon_name = '', fallback) {
        super({ style_class: 'system-status-icon', icon_name });
        if(fallback) this.set_fallback_gicon(genIcon(icon_name));
    }
}

export class IconButton extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(param, callback, icon, uid) {
        super({ can_focus: true, ...param });
        this.connect('clicked', callback);
        if(Array.isArray(icon)) {
            let [status, on, off] = icon;
            this.set_child(new St.Icon({ style_class: 'popup-menu-icon', icon_name: status ? on : off }));
            this.connect('clicked', () => this.setIcon({ [on]: off, [off]: on }[this.child.get_icon_name()]));
        } else {
            this.set_child(new St.Icon({ style_class: 'popup-menu-icon', icon_name: icon ?? '' }));
        }
        this._uid = uid;
    }

    setIcon(icon) {
        this.child.set_icon_name(icon);
    }
}

export class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style_class, icons) {
        super({ activate: false, can_focus: false });
        Object.entries(icons).forEach(([k, v]) => this.add_child(new IconButton({ x_expand: true, style_class }, ...v, k)));
    }

    getIcon(uid) {
        return [...this].find(x => x._uid === uid);
    }

    setViz(uid, viz) {
        this.getIcon(uid)?.[viz ? 'show' : 'hide']();
    }
}

export class SwitchItem extends PopupMenu.PopupSwitchMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, active, callback, param) {
        super(text, active, param);
        this.connect('toggled', (_x, y) => callback(y));
    }
}

export class MenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, callback, param) {
        super(text, param);
        this.connect('activate', callback);
    }

    setLabel(label) {
        this.label.set_text(label);
    }
}

export class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(category, choices, choice, callback) {
        super('');
        this._choices = choices;
        this._category = category;
        Object.entries(choices).forEach(([k, v]) => this.menu.addMenuItem(new MenuItem(v, () => callback(k))));
        this.setSelected(choice);
    }

    setSelected(c) {
        if(!(c in this._choices)) return;
        this.label.set_text(`${this._category}：${this._choices[c]}`);
        this.menu._getMenuItems().forEach(x => x.setOrnament(PopupMenu.Ornament[x.label.text === this._choices[c] ? 'DOT' : 'NONE']));
    }
}

export class DRadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(category, choices, selected, callback) {
        super('');
        this._category = category;
        this._callback = callback;
        this.setList(choices, selected);
    }

    setSelected(selected) {
        this._selected = selected;
        this.label.set_text(`${this._category}：${this._choices[this._selected] || ''}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(PopupMenu.Ornament[selected === i ? 'DOT' : 'NONE']));
    }

    setList(choices, selected) {
        let items = this.menu._getMenuItems();
        let diff = choices.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.menu.addMenuItem(new MenuItem('', () => this._callback(items.length + a)));
        else if(diff < 0) do items.at(diff).destroy(); while(++diff < 0);
        this._choices = choices;
        this.menu._getMenuItems().forEach((x, i) => x.setLabel(choices[i]));
        this.setSelected(selected ?? this._selected);
    }
}
