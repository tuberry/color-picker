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
import {symbiose, getSelf, omit, connect} from './fubar.js';

export const offstage = x => !Main.uiGroup.contains(x);
export const lookupIcon = x => St.IconTheme.new().lookup_icon(x, -1, St.IconLookupFlags.FORCE_SVG);

export class StIcon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor({icon = '', ...param}) {
        super({...param});
        this._setIcon(icon);
    }

    _setIcon(icon) {
        this.set_icon_name(icon);
        if(!icon || lookupIcon(icon)) return;
        this.set_fallback_gicon(Gio.Icon.new_for_string(`${ROOT}/icons/hicolor/scalable/status/${icon}.svg`));
    }
}

export class PanelButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(icon, pos, box, text, no_menu) {
        let {uuid, metadata: {name}} = getSelf();
        super(0.5, text ?? name, no_menu);
        this._box = new St.BoxLayout({style_class: 'panel-status-indicators-box'});
        this.add_child(this._box);
        this._icon = new StIcon({icon, style_class: 'system-status-icon'});
        this._box.add_child(this._icon);
        Main.panel.addToStatusArea(uuid, this, pos, box);
    }
}

export class IconButton extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(param, callback, icon = '', tip) {
        let mutable = Array.isArray(icon);
        let accessible_role = mutable ? Atk.Role.TOGGLE_BUTTON : Atk.Role.PUSH_BUTTON;
        super({can_focus: true, accessible_role, ...param});
        if(icon !== null) this._buildWigets(mutable, icon, tip);
        this.connect('clicked', callback);
    }

    _buildWigets(mutable, icon, tip) {
        if(mutable) {
            let [status, on, off] = icon;
            this.set_child(new StIcon({style_class: 'popup-menu-icon', icon: status ? on : off}));
            this.connect('clicked', () => this.setIcon({[on]: off, [off]: on}[this.child.get_icon_name()]));
            if(!tip) return;
            this._buildTip();
            this._updateTip = () => this._tip?.bin.child.set_text({[on]: tip[0], [off]: tip[1]}[this.child.get_icon_name()]);
        } else {
            this.set_child(new StIcon({style_class: 'popup-menu-icon', icon}));
            if(!tip) return;
            this._buildTip(tip);
            this._updateTip = noop;
        }
    }

    setIcon(icon) {
        this.child?._setIcon(icon);
        if(this._tip) this._updateTip();
    }

    _buildTip(text = '') {
        this._tip = new BoxPointer.BoxPointer(St.Side.TOP);
        this._tip.bin.set_child(new St.Label({text, style_class: 'dash-label'}));
        this._tip.visible = false;
        this.label_actor = this._tip.bin.child;
        this._tip.style_class = 'popup-menu-boxpointer';
        connect(this._tip, [this, 'notify::hover', () => { this._sbt.tooltip.revive(this.hover); }]);
        this._sbt = symbiose(this, () => omit(this, '_tip'), {
            tooltip: [x => { clearTimeout(x); this._showTip(false); }, x => x && setTimeout(() => this._showTip(true), 250)],
        });
    }

    _showTip(show) {
        if(!this._tip) return;
        if(show) {
            this._updateTip();
            this._tip.setPosition(this, 0);
            if(offstage(this._tip)) Main.layoutManager.addTopChrome(this._tip);
            this._tip.open(BoxPointer.PopupAnimation.FULL);
        } else {
            if(offstage(this._tip)) return;
            this._tip.close(BoxPointer.PopupAnimation.NONE);
            Main.layoutManager.removeChrome(this._tip);
        }
    }
}

export class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(icons, param) {
        super({activate: false, can_focus: false, ...param});
        Object.entries(icons).forEach(([k, [p, ...v]]) => this.add_child(new IconButton({x_expand: true, label: k, ...p}, ...v)));
        this._updateViz();
    }

    getIcon(label) {
        return [...this].find(x => x.label === label);
    }

    setViz(label, viz) {
        this.getIcon(label)?.[viz ? 'show' : 'hide']();
        this._updateViz();
    }

    _updateViz() {
        // NOTE: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator/some#browser_compatibility
        [...this].some(x => x.visible) ? this.show() : this.hide();
    }
}

export class SwitchItem extends PopupMenu.PopupSwitchMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, active, callback, param) {
        super(text, active, param);
        this.connect('toggled', (_a, x) => callback(x));
    }
}

export class MenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text = '', callback, param) {
        super(text, param);
        this._callback = callback;
        this.connect('activate', (...xs) => this._callback(...xs));
    }

    setItem(label, callback) {
        this.label.set_text(label);
        this._callback = callback;
    }
}

export class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(category, options, chosen, callback) {
        super('');
        this._category = category;
        this._callback = callback;
        this.setOptions(options, chosen);
    }

    setChosen(chosen) {
        this._chosen = chosen;
        this.label.set_text(`${this._category}：${this._options[chosen] || ''}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(chosen === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NO_DOT));
    }

    setOptions(options, chosen) {
        this._options = options;
        let choices = Object.entries(options),
            items = this.menu._getMenuItems(),
            diff = choices.length - items.length;
        if(diff > 0) for(let i = 0; i < diff; i++) this.menu.addMenuItem(new MenuItem());
        else if(diff < 0) do items.at(diff).destroy(); while(++diff < 0);
        this.menu._getMenuItems().forEach((x, i) => (([k, v]) => x.setItem(v, () => this._callback(k)))(choices[i]));
        this.setChosen(chosen ?? this._chosen);
    }
}
