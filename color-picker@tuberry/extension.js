// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;
const Screenshot = imports.ui.screenshot;
const { Gio, St, Shell, GObject, Clutter, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const Fields = Me.imports.fields.Fields;

const NOTIFY = { MSG: 0, OSD: 1 };
const MENU = { HISTORY: 0, COLLECT: 1 };
const NOTATION = { HEX: 0, RGB: 1, HSL: 2 };
const COLOR_PICK_ICON = Me.dir.get_child('icons').get_child('color-pick.svg').get_path();
const DROPPER_ICON = Me.dir.get_child('icons').get_child('dropper-symbolic.svg').get_path();
const setCursor = cursor => global.display.set_cursor(Meta.Cursor[cursor]);

function convToCSS(color, notation) {
    switch(notation) {
    case NOTATION.RGB: return 'rgb(%d, %d, %d)'.format(color.red, color.green, color.blue);
    case NOTATION.HSL: return ((h, l, s) => 'hsl(%d, %f%%, %f%%)'.format(h, Number(s * 100).toFixed(1), Number(l * 100).toFixed(1)))(...color.to_hls());
    default: return color.to_string().slice(0, 7);
    }
}

function convToHex(color) {
    if(color.includes('hsl')) {
        let [h, s, l] = color.slice(4, -1).split(',').map((v, i) => parseFloat(v) / (i ? 100 : 1));
        return Clutter.Color.from_hls(h, l, s).to_string().slice(0, 7);
    } else if(color.includes('rgb')) {
        return Clutter.Color.from_string(color)[1].to_string().slice(0, 7);
    } else {
        return color;
    }
}

function convToText(color) {
    let hex = convToHex(color);
    let [, l] = Clutter.Color.from_string(hex)[1].to_hls();
    // NOTE: https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
    return ' <span fgcolor="%s" bgcolor="%s">%s</span>'.format(Math.round(l) ? '#000' : '#fff', hex, color);
}

const ColorSlider = GObject.registerClass({
    Properties: {
        'base': GObject.ParamSpec.uint('base', 'base', 'base', GObject.ParamFlags.WRITABLE | GObject.ParamFlags.CONSTRUCT, 1, 1000, 100),
    },
}, class ColorSlider extends Slider.Slider {
    _init(params) {
        super._init(params.value);
        this.base = params.base;
    }

    vfunc_key_press_event(event) {
        let key = event.keyval;
        if(key === Clutter.KEY_Right || key === Clutter.KEY_Left) {
            let delta = key === Clutter.KEY_Right ? this.step : -this.step;
            this.value = Math.max(0, Math.min(this._value + delta, this._maxValue));
            return Clutter.EVENT_STOP;
        }

        return super.vfunc_key_press_event(event);
    }

    set base(value) {
        this.step = 1 / value;
    }

    scroll(event) {
        if(event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        let delta = (direction => {
            switch(direction) {
            case Clutter.ScrollDirection.UP: return 1;
            case Clutter.ScrollDirection.DOWN: return -1;
            case Clutter.ScrollDirection.SMOOTH: return -event.get_scroll_delta()[1];
            default: return 0;
            }
        })(event.get_scroll_direction());
        this.value = Math.min(Math.max(0, this._value + delta * this.step), this._maxValue);

        return Clutter.EVENT_STOP;
    }
});

const ColorMenu = GObject.registerClass({
    Signals: {
        'color-selected': { param_types: [GObject.TYPE_STRING] },
        'menu-closed': { },
    },
}, class ColorMenu extends GObject.Object {
    _init(actor, area) {
        super._init();
        this._color = new Clutter.Color({ red: 255, green: 255, blue: 255 });
        this._menu = new PopupMenu.PopupMenu(actor, 0.25, St.Side.LEFT);
        this._menu.connect('open-state-changed', (_menu, open) => setCursor(open ? 'DEFAULT' : 'BLANK'));
        this._menu.connect('menu-closed', () => this.emit('menu-closed'));
        this.actor.add_style_class_name('color-picker-menu popup-menu');
        this._menuManager = new PopupMenu.PopupMenuManager(area);
        this._menuManager.addMenu(this._menu);
    }

    _updateMenu() {
        this._menu.removeAll();
        this._addHEXSection();
        this._addRGBSection();
        this._addHSLSection();
    }

    get actor() {
        return this._menu.actor;
    }

    open(color) {
        if(this._menu.isOpen) this._menu.close();
        this._color = color;
        this._updateMenu(color);
        this._menu.open(BoxPointer.PopupAnimation.NONE);
        this._menuManager.ignoreRelease();
    }

    _addHEXSection() {
        this._hex = this._colorLabelItem();
        this._menu.addMenuItem(this._hex);
    }

    _addRGBSection() {
        let { red, green, blue } = this._color;
        this._rgb = this._separatorItem(convToCSS(this._color, NOTATION.RGB).toUpperCase());
        this._rslider = this._sliderItem('R', red, 255, x => { this.rgbColor = { red: Math.round(x * 255) }; });
        this._gslider = this._sliderItem('G', green, 255, x => { this.rgbColor = { green: Math.round(x * 255) }; });
        this._bslider = this._sliderItem('B', blue, 255, x => { this.rgbColor = { blue: Math.round(x * 255) }; });
        this._menu.addMenuItem(this._rgb);
        this._menu.addMenuItem(this._rslider);
        this._menu.addMenuItem(this._gslider);
        this._menu.addMenuItem(this._bslider);
    }

    _addHSLSection() {
        let [h, l, s] = this._color.to_hls();
        this._hsl = this._separatorItem(convToCSS(this._color, NOTATION.HSL).toUpperCase());
        this._hslider = this._sliderItem('H', h, 360, x => {
            let [, l_, s_] = this._color.to_hls();
            this.hslColor = Clutter.Color.from_hls(Math.round(x * 360), l_, s_);
        });
        this._sslider = this._sliderItem('S', s, 100, x => {
            this.hslColor = Clutter.Color.from_hls(this._color.to_hls()[0], this._color.to_hls()[1], x);
            this._hslider.slider.value = this._color.to_hls()[0] / 360;
            this._lslider.slider.value = this._color.to_hls()[1];
        });
        this._lslider = this._sliderItem('L', l, 100, x => {
            this.hslColor = Clutter.Color.from_hls(this._color.to_hls()[0], x, this._color.to_hls()[2]);
            this._hslider.slider.value = this._color.to_hls()[0] / 360;
            this._sslider.slider.value = this._color.to_hls()[2];
        });
        this._menu.addMenuItem(this._hsl);
        this._menu.addMenuItem(this._hslider);
        this._menu.addMenuItem(this._sslider);
        this._menu.addMenuItem(this._lslider);
    }

    set hslColor(color) {
        this._color = color;
        let hex = convToCSS(color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup(convToText(hex));
        this._rgb.label.set_text(convToCSS(color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convToCSS(color, NOTATION.HSL).toUpperCase());
        this._rslider.slider.value = color.red / 255;
        this._gslider.slider.value = color.green / 255;
        this._bslider.slider.value = color.blue / 255;
    }

    set rgbColor(color) {
        Object.assign(this._color, color);
        let [h, l, s] = this._color.to_hls();
        let hex = convToCSS(this._color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup(convToText(hex));
        this._rgb.label.set_text(convToCSS(this._color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convToCSS(this._color, NOTATION.HSL).toUpperCase());
        this._hslider.slider.value = h / 360;
        this._lslider.slider.value = l;
        this._sslider.slider.value = s;
    }

    _colorLabelItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item', hover: false });
        let color = convToCSS(this._color, NOTATION.HEX);
        let label = new St.Label({ x_expand: true });
        label.clutter_text.set_markup(convToText(color));
        item.add_child(label);
        item.label = label;
        this._addLabelButton(item, 'HEX', NOTATION.HEX);
        this._addLabelButton(item, 'RGB', NOTATION.RGB);
        this._addLabelButton(item, 'HSL', NOTATION.HSL);

        return item;
    }

    _addLabelButton(item, label, notation) {
        let btn = new St.Button({ label, style_class: 'color-picker-label-button button' });
        btn.connect('clicked', () => {
            this._menu.close();
            this.emit('color-selected', convToCSS(this._color, notation));
        });
        item.add_child(btn);
    }

    _separatorItem(text) {
        return new PopupMenu.PopupSeparatorMenuItem(text, { style_class: 'color-picker-item popup-menu-item' });
    }

    _sliderItem(text, value, base, func) {
        let item = new PopupMenu.PopupBaseMenuItem({ activate: false });
        let label = new St.Label({ text, style_class: 'color-picker-item popup-menu-item', x_expand: false });
        let slider = new ColorSlider({ value: value > 1 ? value / base : value, base });
        slider.connect('notify::value', () => { if(item.active) func(slider.value); });
        item.connect('button-press-event', (actor, event) => { return actor.slider.startDragging(event); });
        item.connect('key-press-event', (actor, event) => { return actor.slider.emit('key-press-event', event); });
        item.connect('scroll-event', (actor, event) => { return actor.slider.emit('scroll-event', event); });
        item.add_child(label);
        item.add_child(slider);
        item.slider = slider;

        return item;
    }

    destroy() {
        this._menu.destroy();
        delete this._menu;
        delete this._menuManager;
    }
});

const ColorArea = GObject.registerClass({
    Properties: {
        'preview': GObject.ParamSpec.boolean('preview', 'preview', 'preview', GObject.ParamFlags.READWRITE, false),
        'persist': GObject.ParamSpec.boolean('persist', 'persist', 'persist', GObject.ParamFlags.READWRITE, false),
    },
    Signals: {
        'end-pick': {},
        'notify-color': { param_types: [GObject.TYPE_STRING] },
    },
}, class ColorArea extends St.Widget {
    _init(params) {
        super._init({ reactive: true });
        this.ignorePersist = params && params.ignorePersist || false;

        this._picker = new Shell.Screenshot();
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this.connect('popup-menu', () => { if(this._icon) this._menu.open(this._effect._color); });
        this._bindSettings();
    }

    get _persist() {
        return this.persist && !this.ignorePersist;
    }

    _bindSettings() {
        gsettings.bind(Fields.PERSISTENTMODE, this, 'persist', Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLEPREVIEW,  this, 'preview', Gio.SettingsBindFlags.GET);
    }

    async _pick() {
        let [x, y] = global.get_pointer();
        this._icon.set_position(x, y);
        let [color] = await this._picker.pick_color(x, y);
        this._effect.color = color;
        this._icon.show();
    }

    set preview(preview) {
        if(preview) {
            if(this._icon) return;
            this._effect = new Screenshot.RecolorEffect({
                chroma: new Clutter.Color({ red: 80, green: 219, blue: 181 }),
                threshold: 0.03,
                smoothing: 0.3,
            });
            this._icon = new St.Icon({
                // icon_name: 'color-pick',
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(COLOR_PICK_ICON) }),
                icon_size: Meta.prefs_get_cursor_size() * 1.5,
                effect: this._effect,
                visible: false,
            });
            this._pick().then().catch(() => this.emit('end-pick'));
            this._menu = new ColorMenu(this._icon, this);
            this._menu.actor.hide();
            Main.layoutManager.addTopChrome(this._menu.actor);
            Main.layoutManager.addTopChrome(this._icon);
            this._menu.connect('menu-closed', () => { this._pick().then().catch(() => this.emit('end-pick')); });
            this._menu.connect('color-selected', (menu, color) => this._emitColor(color));
        } else {
            if(!this._icon) return;
            this._menu.destroy();
            this._icon.destroy();
            delete this._effect;
            delete this._menu;
            delete this._icon;
        }
    }

    _emitColor(color) {
        this.emit('notify-color', color || convToCSS(this._effect._color, NOTATION.HEX));
        if(!this._persist) this.emit('end-pick');
    }

    vfunc_motion_event() {
        if(this._icon) this._pick();
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_press_event(event) {
        let [X, Y] = global.get_pointer();
        switch(event.keyval) {
        case Clutter.KEY_Left:
            this._pointer.notify_absolute_motion(global.get_current_time(), X - 1, Y); break;
        case Clutter.KEY_Up:
            this._pointer.notify_absolute_motion(global.get_current_time(), X, Y - 1); break;
        case Clutter.KEY_Right:
            this._pointer.notify_absolute_motion(global.get_current_time(), X + 1, Y); break;
        case Clutter.KEY_Down:
            this._pointer.notify_absolute_motion(global.get_current_time(), X, Y + 1); break;
        case Clutter.KEY_Escape:
            this.emit('end-pick'); return Clutter.EVENT_PROPAGATE;
        }

        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event(event) {
        switch(event.button) {
        case 1:
            this._icon ? this._emitColor() : this._pick().then(() => this._emitColor()).catch(() => this.emit('end-pick')); break;
        case 2:
            if(this._icon) this._menu.open(this._effect._color); break;
        default:
            this.emit('end-pick'); break;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this.preview = false;
        delete this._pointer;
        delete this._picker;
        super.destroy();
    }
});

const ColorButton = GObject.registerClass({
    Properties: {
        'icon-name': GObject.ParamSpec.string('icon-name', 'icon-name', 'icon name', GObject.ParamFlags.WRITABLE, ''),
    },
    Signals: {
        'btn-left-click': {},
    },
}, class ColorButton extends PanelMenu.Button {
    _init(params) {
        super._init(params);
        gsettings.bind(Fields.SYSTRAYICON, this, 'icon-name', Gio.SettingsBindFlags.GET);
        this.add_actor(this.icon);
    }

    set icon_name(path) {
        let icon = Gio.File.new_for_path(path);
        let gicon = new Gio.FileIcon({ file: path.endsWith('svg') && icon.query_exists(null) ? icon : Gio.File.new_for_path(DROPPER_ICON) });
        if(this._icon) this._icon.gicon = gicon;
        else this._icon = new St.Icon({ style_class: 'color-picker system-status-icon', gicon });

        this._icon_name = path;
    }

    get icon() {
        if(!this._icon) this.icon_name = this._icon_name;
        return this._icon;
    }

    vfunc_event(event) {
        if(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1) {
            this.emit('btn-left-click');
            return Clutter.EVENT_STOP;
        }

        return super.vfunc_event(event);
    }
});

const ColorPicker = GObject.registerClass({
    Properties: {
        'collect':       GObject.ParamSpec.string('collect', 'collect', 'collect', GObject.ParamFlags.WRITABLE, ''),
        'history':       GObject.ParamSpec.string('history', 'history', 'history', GObject.ParamFlags.WRITABLE, ''),
        'systray':       GObject.ParamSpec.boolean('systray', 'systray', 'systray', GObject.ParamFlags.WRITABLE, true),
        'preview':       GObject.ParamSpec.boolean('preview', 'preview', 'preview', GObject.ParamFlags.READWRITE, true),
        'icon-name':     GObject.ParamSpec.string('icon-name', 'icon-name', 'icon name', GObject.ParamFlags.WRITABLE, ''),
        'shortcut':      GObject.ParamSpec.boolean('shortcut', 'shortcut', 'shortcut', GObject.ParamFlags.WRITABLE, false),
        'auto-copy':     GObject.ParamSpec.boolean('auto-copy', 'auto-copy', 'auto-copy', GObject.ParamFlags.READWRITE, true),
        'menu-size':     GObject.ParamSpec.uint('menu-size', 'menu-size', 'menu size', GObject.ParamFlags.READWRITE, 1, 16, 8),
        'menu-style':    GObject.ParamSpec.uint('menu-style', 'menu-style', 'menu style', GObject.ParamFlags.WRITABLE, 0, 1, 0),
        'notify-style':  GObject.ParamSpec.uint('notify-style', 'notify-style', 'notify style', GObject.ParamFlags.READWRITE, 0, 1, 0),
        'enable-notify': GObject.ParamSpec.boolean('enable-notify', 'enable-notify', 'enable notify', GObject.ParamFlags.READWRITE, true),
    },
}, class ColorPicker extends GObject.Object {
    _init() {
        super._init();
        this._bindSettings();
    }

    _bindSettings() {
        gsettings.bind(Fields.ENABLESYSTRAY,  this, 'systray',       Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.COLORSHISTORY,  this, 'history',       Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.COLORSCOLLECT,  this, 'collect',       Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.MENUSTYLE,      this, 'menu-style',    Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.MENUSIZE,       this, 'menu-size',     Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.AUTOCOPY,       this, 'auto-copy',     Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLESHORTCUT, this, 'shortcut',      Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLENOTIFY,   this, 'enable-notify', Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.NOTIFYSTYLE,    this, 'notify-style',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLEPREVIEW,  this, 'preview',       Gio.SettingsBindFlags.GET);
    }

    set menu_style(style) {
        this._menu_style = style;
        this._updateMenu();
    }

    set history(history) {
        this._history = history || '';
        if(this._menu_style === MENU.HISTORY) this._updateMenu();
    }

    set collect(collect) {
        this._collect = collect || '';
        if(this._menu_style === MENU.COLLECT) this._updateMenu();
    }

    set shortcut(shortcut) {
        if(this._shortcutId) Main.wm.removeKeybinding(Fields.PICKSHORTCUT);
        this._shortcutId = shortcut ? Main.wm.addKeybinding(Fields.PICKSHORTCUT, gsettings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this._beginPick.bind(this)) : undefined;
    }

    set systray(systray) {
        if(systray) {
            if(this._button) return;
            this._button = new ColorButton(null, Me.metadata.uuid);
            this._button.connect('btn-left-click', this._beginPick.bind(this));
            Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
            this._updateMenu();
        } else {
            if(!this._button) return;
            this._button.destroy();
            delete this._button;
        }
    }

    _updateMenu() {
        if([this._button, this._menu_style, this._history, this._collect].some(x => x === undefined)) return;
        this._button.menu.removeAll();
        let colors = this._menu_style === MENU.HISTORY ? this._history : this._collect;
        if(colors) {
            colors.split('|').forEach(x => this._button.menu.addMenuItem(this._menuItemMaker(x)));
            this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        }
        this._button.menu.addMenuItem(this._settingItem());
    }

    _menuItemMaker(color) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item popup-menu-item' });
        item.connect('activate', () => { St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color); });
        let label = new St.Label({ x_expand: true });
        label.clutter_text.set_markup(convToText(color));
        item.add_child(label);
        let button = new St.Button({
            style_class: this._menu_style === MENU.HISTORY ? 'color-picker-history' : 'color-picker-collection',
            child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', style_class: 'color-picker-icon' }),
        });
        button.connect('clicked', () => {
            if(this._menu_style === MENU.HISTORY) {
                if(this._collect.includes(color)) return;
                gsettings.set_string(Fields.COLORSCOLLECT, this._collect ? '%s|%s'.format(color, this._collect) : color);
            } else {
                let collects = this._collect.split('|');
                collects.splice(collects.indexOf(color), 1);
                gsettings.set_string(Fields.COLORSCOLLECT, collects.join('|'));
            }
        });
        item.add_child(button);

        return item;
    }

    _settingItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item popup-menu-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                x_expand: true,
                style_class: 'color-picker-setting-button color-picker-button',
                child: new St.Icon({ icon_name: icon, style_class: 'color-picker-icon popup-menu-icon' }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        };
        addButtonItem('find-location-symbolic', () => { this._button.menu.close(); this._beginPick(); });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_uint(Fields.MENUSTYLE, 1 - this._menu_style); });
        addButtonItem('emblem-system-symbolic', () => { this._button.menu.close(); ExtensionUtils.openPrefs(); });
        item.add_child(hbox);

        return item;
    }

    _beginPick() {
        if(this._area) return;
        setCursor(this.preview ? 'BLANK' : 'CROSSHAIR');
        if(this._button) this._button.add_style_class_name('active');
        this._area = new ColorArea();
        this._area.set_size(...global.display.get_size());
        this._area.connect('end-pick', this._endPick.bind(this));
        this._area.connect('notify-color', this._notify.bind(this));
        Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
        Main.layoutManager.addChrome(this._area);
    }

    _endPick() {
        if(!this._area) return;
        setCursor('DEFAULT');
        if(this._button) this._button.remove_style_class_name('active');
        if(Main._findModal(this._area) !== -1) Main.popModal(this._area);
        this._area.destroy();
        delete this._area;
    }

    _notify(actor, color) {
        this._setHistory(color);
        if(!this.enable_notify) return;
        if(this.notify_style === NOTIFY.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor();
            let icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' });
            let osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style('color: %s;'.format(convToHex(color)));
            Main.osdWindowManager.show(index, icon, color, null, 2);
            let clearId = osd._box.connect('notify::mapped', box => {
                if(box.mapped) return Clutter.EVENT_STOP;
                osd._icon.set_style('');
                osd._box.disconnect(clearId);
                return Clutter.EVENT_STOP;
            });
        }
    }

    _setHistory(color) {
        if(this.auto_copy) St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
        if(this._history) gsettings.set_string(Fields.COLORSHISTORY, [color].concat(this._history.split('|')).slice(0, this.menu_size).join('|'));
        else gsettings.set_string(Fields.COLORSHISTORY, color);
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) { reject(new Error('Cannot start picking')); return; }
                setCursor(this.preview ? 'BLANK' : 'CROSSHAIR');
                if(this._button) this._button.add_style_class_name('active');
                this._area = new ColorArea({ ignorePersist: true });
                this._area.set_size(...global.display.get_size());
                this._area.connect('end-pick', () => { this._endPick(); reject(new Error('Cancelled')); });
                this._area.connect('notify-color', (actor, color) => { resolve(color); });
                Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
                Main.layoutManager.addTopChrome(this._area);
            } catch(e) {
                reject(e);
            }
        });
    }

    destroy() {
        this._endPick();
        this.systray = false;
        this.shortcut = false;
    }
});

const Extension = class Extension {
    constructor() {
        ExtensionUtils.initTranslations();
    }

    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        return this._ext.pickAsync();
    }

    enable() {
        this._ext = new ColorPicker();
    }

    disable() {
        this._ext.destroy();
        delete this._ext;
    }
};

function init() {
    return new Extension();
}
