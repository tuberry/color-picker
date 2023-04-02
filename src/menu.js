// vim:fdm=syntax
// by tuberry
/* exported TrayIcon StButton IconItem MenuItem
   DRadioItem RadioItem SwitchItem gicon
 */
'use strict';

const { St, GObject, Gio } = imports.gi;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var gicon = x => Gio.Icon.new_for_string(`${Me.dir.get_path()}/icons/hicolor/scalable/status/${x}.svg`);

var TrayIcon = class extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor(icon_name = '', fallback) {
        super({ style_class: 'system-status-icon', icon_name });
        if(fallback) this.set_fallback_gicon(gicon(icon_name));
    }
};

var StButton = class extends St.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(param, callback) {
        super(param);
        this.connect('clicked', callback);
    }
};

var SwitchItem = class extends PopupMenu.PopupSwitchMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, active, callback, param) {
        super(text, active, param);
        this.connect('toggled', (_x, y) => callback(y));
    }
};

var IconItem = class extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style_class, callbacks) {
        super({ activate: false });
        this._box = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        callbacks.forEach(([icon_name, callback]) => this._box.add_child(new StButton({
            child: new St.Icon({ icon_name, style_class: 'popup-menu-icon' }), x_expand: true, style_class,
        }, callback)));
        this.add_child(this._box);
    }

    setViz(icon, viz) {
        this._box.get_children().find(x => x.child.gicon.to_string().includes(icon))?.[viz ? 'show' : 'hide']();
    }
};

var MenuItem = class extends PopupMenu.PopupMenuItem {
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
};

var RadioItem = class extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(name, enums, enum_, callback) {
        super('');
        this._enum = enums;
        this._name = name;
        Object.entries(enums).forEach(([k, v]) => this.menu.addMenuItem(new MenuItem(v, () => callback(k))));
        this.setSelected(enum_);
    }

    setSelected(m) {
        if(!(m in this._enum)) return;
        this.label.set_text(`${this._name}：${this._enum[m]}`);
        this.menu._getMenuItems().forEach(x => x.setOrnament(x.label.text === this._enum[m] ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }
};

var DRadioItem = class extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(name, list, index, click, select) {
        super('');
        this._name = name;
        this._onClick = click;
        this._onSelect = select || (x => this._list[x]);
        this.setList(list, index);
    }

    setSelected(index) {
        this._index = index;
        this.label.set_text(`${this._name}：${this._onSelect(this._index) || ''}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(index === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }

    setList(list, index) {
        let items = this.menu._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.menu.addMenuItem(new MenuItem('', () => this._onClick(items.length + a)));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._list = list;
        this.menu._getMenuItems().forEach((x, i) => x.setLabel(list[i]));
        this.setSelected(index ?? this._index);
    }
};
