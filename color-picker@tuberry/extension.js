// vim:fdm=syntax
// by tuberry
//
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
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const NOTIFY = { MSG: 0, OSD: 1 };
const MENU = { HISTORY: 0, COLLECT: 1 };
const NOTATION = { HEX: 0, RGB: 1, HSL: 2 };
const DROPPER_ICON = Me.dir.get_child('icons').get_child('dropper-symbolic.svg').get_path();

const convToCSS = (color, notation) => {
    switch(notation) {
    case NOTATION.RGB:
        return 'rgb(%d, %d, %d)'.format(color.red, color.green, color.blue);
    case NOTATION.HSL:
        let [h, l, s] = color.to_hls();
        return 'hsl(%d, %f%%, %f%%)'.format(h, Number(s * 100).toFixed(1), Number(l * 100).toFixed(1));
    default:
        return color.to_string().slice(0, 7);
    }
}

const convToHex = string => {
    if(string.includes('hsl')) {
        let [h, s, l] = string.slice(4, -1).split(',').map((v, i, a) => parseFloat(v) / (i == 0 ? 1 : 100));
        return Clutter.Color.from_hls(h, l, s).to_string().slice(0, 7);
    } else if(string.includes('rgb')) {
        let rgb = Clutter.Color.from_string(string)[1];
        return rgb.to_string().slice(0, 7);
    } else {
        return string;
    }
}

const ColorSlider = GObject.registerClass({
    Properties: {
        'base': GObject.param_spec_uint('base', 'base', 'base', 1, 1000, 100, GObject.ParamFlags.WRITABLE | GObject.ParamFlags.CONSTRUCT),
    },
}, class ColorSlider extends Slider.Slider {
    _init(params) {
        super._init(params.value);
        this.base = params.base;
    }

    vfunc_key_press_event(keyPressEvent) {
        let key = keyPressEvent.keyval;
        if (key == Clutter.KEY_Right || key == Clutter.KEY_Left) {
            let delta = key == Clutter.KEY_Right ? this.step : -this.step;
            this.value = Math.max(0, Math.min(this._value + delta, this._maxValue));
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(keyPressEvent);
    }

    set base(value) {
        this.step = 1 / value;
    }

    scroll(event) {
        let direction = event.get_scroll_direction();
        let delta;

        if (event.is_pointer_emulated())
            return Clutter.EVENT_PROPAGATE;

        if (direction == Clutter.ScrollDirection.DOWN) {
            delta = -this.step;
        } else if (direction == Clutter.ScrollDirection.UP) {
            delta = this.step;
        } else if (direction == Clutter.ScrollDirection.SMOOTH) {
            let [, dy] = event.get_scroll_delta();
            delta = -dy * this.step;
        }

        this.value = Math.min(Math.max(0, this._value + delta), this._maxValue);

        return Clutter.EVENT_STOP;
    }
});

const ColorMenu = GObject.registerClass({
    Signals: {
        'color-selected': { param_types: [GObject.TYPE_STRING] },
    },
}, class ColorMenu extends GObject.Object {
    _init(actor, area) {
        super._init();
        this._color = Clutter.Color.from_string('#ffffff')[1];
        this._menu = new PopupMenu.PopupMenu(actor, 0.25, St.Side.LEFT);
        this._menu.connect('open-state-changed', (menu, open) => global.display.set_cursor(Meta.Cursor[open ? 'DEFAULT' : 'BLANK']));
        this.actor.add_style_class_name('color-picker-menu');
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
        let section = new PopupMenu.PopupMenuSection();
        let [r, g, b] = [this._color.red, this._color.green, this._color.blue];
        this._rgb = this._separatorItem(convToCSS(this._color, NOTATION.RGB).toUpperCase());
        this._rslider = this._sliderItem('R', r, 255, x => { this.rgbColor = Clutter.Color.new(Math.round(x * 255), this._color.green, this._color.blue, 255); });
        this._gslider = this._sliderItem('G', g, 255, x => { this.rgbColor = Clutter.Color.new(this._color.red, Math.round(x * 255), this._color.blue, 255); });
        this._bslider = this._sliderItem('B', b, 255, x => { this.rgbColor = Clutter.Color.new(this._color.red, this._color.green, Math.round(x * 255), 255); });

        this._menu.addMenuItem(this._rgb);
        this._menu.addMenuItem(this._rslider);
        this._menu.addMenuItem(this._gslider);
        this._menu.addMenuItem(this._bslider);
    }

    _addHSLSection() {
        let [h, l, s] = this._color.to_hls();
        let section = new PopupMenu.PopupMenuSection();
        this._hsl = this._separatorItem(convToCSS(this._color, NOTATION.HSL).toUpperCase());
        this._hslider = this._sliderItem('H', h, 360, x => { this.hslColor = Clutter.Color.from_hls(Math.round(x * 360), this._color.to_hls()[1] , this._color.to_hls()[2]); });
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
        let [h, l, s] = color.to_hls()
        let hex = convToCSS(color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        this._rgb.label.set_text(convToCSS(color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convToCSS(color, NOTATION.HSL).toUpperCase());
        this._rslider.slider.value = color.red / 255;
        this._gslider.slider.value = color.green / 255;
        this._bslider.slider.value = color.blue / 255;
    }

    set rgbColor(color) {
        this._color = color;
        let [h, l, s] = color.to_hls();
        let hex = convToCSS(color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        this._rgb.label.set_text(convToCSS(color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convToCSS(color, NOTATION.HSL).toUpperCase());
        this._hslider.slider.value = h / 360;
        this._lslider.slider.value = l;
        this._sslider.slider.value = s;
    }

    _colorLabelItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item' });
        let hex = convToCSS(this._color, NOTATION.HEX);
        let label = new St.Label({ x_expand: true });
        label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        item.connect('activate', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convToCSS(this._color, NOTATION.HEX));
        });
        item.add_child(label);
        item.label = label;

        let rgb = new St.Button({ child: new St.Label({ text: 'RGB', }), style_class: 'color-picker-button' });
        rgb.connect('clicked', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convToCSS(this._color, NOTATION.RGB));
        });
        item.add_child(rgb);

        let hsl = new St.Button({ child: new St.Label({ text: 'HSL', }), style_class: 'color-picker-button' });
        hsl.connect('clicked', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convToCSS(this._color, NOTATION.HSL));
        });
        item.add_child(hsl);

        return item;
    }

    _separatorItem(text) {
        return new PopupMenu.PopupSeparatorMenuItem(text, { style_class: 'color-picker-item', x_expand: true });
    }

    _sliderItem(text, value, base, func) {
        let item = new PopupMenu.PopupBaseMenuItem({ activate: false });
        let label = new St.Label({ text: text, style_class: 'color-picker-item', x_expand: false });
        let slider = new ColorSlider({ value: value > 1 ? value / base : value, base: base });
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
        'preview': GObject.param_spec_boolean('preview', 'preview', 'preview', false, GObject.ParamFlags.READWRITE),
        'persist': GObject.param_spec_boolean('persist', 'persist', 'persist', false, GObject.ParamFlags.READWRITE),
    },
    Signals: {
        'end-pick': {},
        'notify-color': { param_types: [GObject.TYPE_STRING] },
    },
}, class ColorArea extends St.DrawingArea {
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

    _pick() {
        return new Promise((resolve, reject) => {
            try {
                let [x, y] = global.get_pointer();
                this._picker.pick_color(x, y, (pick, res) => {
                    let [, color] = pick.pick_color_finish(res);
                    resolve({ color: color, x: x, y: y });
                });
            } catch(e) {
                reject(e.message);
            }
        });
    }

    _updateColor(pramas) {
        this._icon.set_position(pramas.x, pramas.y);
        this._effect.color = pramas.color;
        this._icon.show();
    }

    set preview(preview) {
        if(preview) {
            if(this._icon) return;
            this._effect = new Screenshot.RecolorEffect({
                chroma: new Clutter.Color({ red: 80, green: 219, blue: 181, }),
                threshold: 0.03,
                smoothing: 0.3,
            });

            this._icon = new St.Icon({
                icon_name: 'color-pick',
                icon_size: Meta.prefs_get_cursor_size() * 1.5,
                effect: this._effect,
                visible: false,
            });
            this._pick().then(this._updateColor.bind(this));

            this._menu = new ColorMenu(this._icon, this);
            this._menu.actor.hide();
            Main.layoutManager.addTopChrome(this._menu.actor);
            Main.layoutManager.addTopChrome(this._icon);
            this.selectId = this._menu.connect('color-selected', (menu, color) => {
                this.emit('notify-color', color);
                if(!this._persist) this.emit('end-pick');
            });
        } else {
            if(!this._icon) return;
            if(this.selectId)
                this._menu.disconnect(this.selectId), this.selectId = 0;
            this._effect.run_dispose();
            this._menu.destroy();
            this._icon.destroy();
            delete this._effect;
            delete this._menu;
            delete this._icon;
        }
    }

    vfunc_motion_event(event) {
        if(!this._icon)
            return Clutter.EVENT_PROPAGATE;
        this._pick().then(this._updateColor.bind(this));
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_press_event(event) {
        let [X, Y] = global.get_pointer();
        switch(event.keyval) {
        case Clutter.KEY_Left:
            this._pointer.notify_absolute_motion(global.get_current_time(), X-1, Y);
            break;
        case Clutter.KEY_Up:
            this._pointer.notify_absolute_motion(global.get_current_time(), X, Y-1);
            break;
        case Clutter.KEY_Right:
            this._pointer.notify_absolute_motion(global.get_current_time(), X+1, Y);
            break;
        case Clutter.KEY_Down:
            this._pointer.notify_absolute_motion(global.get_current_time(), X, Y+1);
            break;
        case Clutter.KEY_Escape:
            this.emit('end-pick');
            return Clutter.EVENT_PROPAGATE;
        default:
            break;
        }

        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event(event) {
        switch(event.button) {
        case 1:
            if(this._icon) {
                this.emit('notify-color', convToCSS(this._effect._color, NOTATION.HEX));
            } else {
                this._pick().then(scc => { this.emit('notify-color', convToCSS(scc.color, NOTATION.HEX)); });
            }
            if(!this._persist) this.emit('end-pick');
            break;
        case 2:
            if(this._icon)
                this._menu.open(this._effect._color);
            break;
        default:
            this.emit('end-pick');
            break;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this.preview = false;
        this._picker.run_dispose();
        this._pointer.run_dispose();
        delete this._pointer;
        delete this._picker;

        super.destroy();
    }
});

const ColorButton = GObject.registerClass({
    Signals: {
        'left-click': {},
    },
}, class ColorButton extends PanelMenu.Button {
    _init(params) {
        super._init(params);
    }

    vfunc_event(event) {
        if (event.type() == Clutter.EventType.BUTTON_PRESS &&
            event.get_button() == 1) {
            this.emit('left-click');
            return Clutter.EVENT_STOP;
        }

        return super.vfunc_event(event);
    };
});

const ColorPicker = GObject.registerClass({
    Properties: {
        'collect':      GObject.param_spec_string('collect', 'collect', 'collect', '', GObject.ParamFlags.WRITABLE),
        'history':      GObject.param_spec_string('history', 'history', 'history', '', GObject.ParamFlags.WRITABLE),
        'systray':      GObject.param_spec_boolean('systray', 'systray', 'systray', false, GObject.ParamFlags.WRITABLE),
        'preview':      GObject.param_spec_boolean('preview', 'preview', 'preview', false, GObject.ParamFlags.READWRITE),
        'shortcut':     GObject.param_spec_boolean('shortcut', 'shortcut', 'shortcut', false, GObject.ParamFlags.WRITABLE),
        'menuSize':     GObject.param_spec_uint('menuSize', 'memuSize', 'menu size', 1, 16, 8, GObject.ParamFlags.READWRITE),
        'menuStyle':    GObject.param_spec_uint('menuStyle', 'menuStyle', 'menu style', 0, 1, 0, GObject.ParamFlags.WRITABLE),
        'notifyStyle':  GObject.param_spec_uint('notifyStyle', 'notifyStyle', 'notify style', 0, 1, 0, GObject.ParamFlags.READWRITE),
        'enableNotify': GObject.param_spec_boolean('enableNotify', 'enableNotify', 'enable notify', false, GObject.ParamFlags.READWRITE),
    },
}, class ColorPicker extends GObject.Object {
    _init() {
        super._init();
        this._bindSettings();
    }

    _bindSettings() { // NOTE: the order of binds matters
        gsettings.bind(Fields.ENABLESYSTRAY,  this, 'systray',      Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.COLORSHISTORY,  this, 'history',      Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.COLORSCOLLECT,  this, 'collect',      Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.MENUSTYLE,      this, 'menuStyle',    Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.MENUSIZE,       this, 'menuSize',     Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLESHORTCUT, this, 'shortcut',     Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLENOTIFY,   this, 'enableNotify', Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.NOTIFYSTYLE,    this, 'notifyStyle',  Gio.SettingsBindFlags.GET);
        gsettings.bind(Fields.ENABLEPREVIEW,  this, 'preview',      Gio.SettingsBindFlags.GET);
    }

    set menuStyle(style) {
        this._menuStyle = style;
        this._updateMenu();
    }

    set history(history) {
        this._history = history || '';
        if(this._menuStyle == MENU.HISTORY) this._updateMenu();
    }

    set collect(collect) {
        this._collect = collect || '';
        if(this._menuStyle == MENU.COLLECT) this._updateMenu();
    }

    set shortcut(shortcut) {
        if(shortcut) {
            Main.wm.addKeybinding(Fields.PICKSHORTCUT, gsettings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this._beginPick.bind(this));
        } else {
            Main.wm.removeKeybinding(Fields.PICKSHORTCUT);
        }
    }

    set systray(systray) {
        if(systray) {
            if(this._button) return;
            this._button = new ColorButton(null);
            this._button.add_actor(new St.Icon({
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(DROPPER_ICON) }),
                style_class: 'color-picker system-status-icon',
            }));
            this._button.connect('left-click', this._beginPick.bind(this));
            Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        } else {
            if(!this._button) return;
            this._button.destroy();
            delete this._button;
        }
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(this._menuStyle == MENU.HISTORY) {
            if(this._history) this._history.split('|').forEach(x => this._button.menu.addMenuItem(this._menuItemMaker(x)));
        } else {
            if(this._collect) this._collect.split('|').forEach(x => this._button.menu.addMenuItem(this._menuItemMaker(x)));
        }
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(''));
        this._button.menu.addMenuItem(this._settingItem());
    }

    _menuItemMaker(color) {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item' });
        item.connect('activate', () => {
            item._getTopMenu().close();
            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
        });
        let label = new St.Label({ x_expand: true });
        label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(convToHex(color), color));
        item.add_child(label);

        let button = new St.Button({
            style_class: this._menuStyle == MENU.HISTORY ? 'color-picker-history' : 'color-picker-collection',
            child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', style_class: 'color-picker-icon', }),
        });
        button.connect('clicked', () => {
            if(this._menuStyle == MENU.HISTORY) {
                if(this._collect.includes(color)) return;
                gsettings.set_string(Fields.COLORSCOLLECT, this._collect ? color + '|' + this._collect : color);
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
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item', hover: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        let addButtonItem = (icon, func) => {
            let btn = new St.Button({
                hover: true,
                x_expand: true,
                style_class: 'color-picker-button',
                child: new St.Icon({ icon_name: icon, style_class: 'color-picker-icon', }),
            });
            btn.connect('clicked', func);
            hbox.add_child(btn);
        }
        addButtonItem('find-location-symbolic', () => { item._getTopMenu().close(); this._beginPick(); });
        addButtonItem('face-cool-symbolic', () => { gsettings.set_uint(Fields.MENUSTYLE, 1 - this._menuStyle); });
        addButtonItem('emblem-system-symbolic', () => { item._getTopMenu().close(); ExtensionUtils.openPrefs(); });
        item.add_child(hbox);
        return item;
    }

    _beginPick() {
        if(this._area) return;
        global.display.set_cursor(Meta.Cursor[this.preview ? 'BLANK' : 'CROSSHAIR']);
        if(this._button) this._button.add_style_class_name('active');
        this._area = new ColorArea();
        this._area.set_size(...global.display.get_size());
        this._area.endId = this._area.connect('end-pick', this._endPick.bind(this));
        this._area.showId = this._area.connect('notify-color', this._notify.bind(this));
        Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
        Main.layoutManager.addChrome(this._area);
    }

    _endPick() {
        if(!this._area) return;
        global.display.set_cursor(Meta.Cursor.DEFAULT);
        if(this._button) this._button.remove_style_class_name('active');
        if(this._area.endId) this._area.disconnect(this._area.endId), this._area.endId = 0;
        if(this._area.showId) this._area.disconnect(this._area.showId), this._area.showId = 0;
        if(Main._findModal(this._area) != -1) Main.popModal(this._area);
        this._area.destroy();
        delete this._area;
    }

    _notify(actor, color) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
        if(!this._history.includes(color)) this._setHistory(color);
        if(!this.enableNotify) return;
        if(this.notifyStyle == NOTIFY.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor();
            let icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' });
            let osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style('color: %s;'.format(convToHex(color)));
            Main.osdWindowManager.show(index, icon, color, null, 2);
            let clearId = osd._box.connect('notify::mapped', box => {
                if(box.mapped) return Clutter.EVENT_STOP;
                osd._icon.set_style('color: none;');
                osd._box.disconnect(clearId);
                return Clutter.EVENT_STOP;
            });
        }
    }

    _setHistory(color) {
        if(this._history) {
            let history = (color + '|' + this._history).split('|');
            gsettings.set_string(Fields.COLORSHISTORY, history.slice(0, this.menuSize).join('|'));
        } else {
            gsettings.set_string(Fields.COLORSHISTORY, color);
        }
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) { reject(new Error('Cannot start picking')); return; }
                global.display.set_cursor(Meta.Cursor[this.preview ? 'BLANK' : 'CROSSHAIR']);
                if(this._button) this._button.add_style_class_name('active');
                this._area = new ColorArea({ ignorePersist: true });
                this._area.set_size(...global.display.get_size());
                this._area.endId = this._area.connect('end-pick', () => {
                    this._endPick();
                    reject(new Error('Cancelled'));
                });
                this._area.showId = this._area.connect('notify-color', (actor, color) => {
                    resolve(color);
                });
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
        this.run_dispose();
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
}

function init() {
    return new Extension();
}
