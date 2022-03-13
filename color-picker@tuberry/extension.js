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
const Me = ExtensionUtils.getCurrentExtension();
const Fields = Me.imports.fields.Fields;
const _ = ExtensionUtils.gettext;
let gsettings = null;

const Notify = { MSG: 0, OSD: 1 };
const Menu = { History: 0, Collect: 1 };
const Format = { HEX: 0, RGB: 1, HSL: 2 };
const setCursor = cursor => global.display.set_cursor(Meta.Cursor[cursor]);
const genParam = (type, name, ...dflt) => GObject.ParamSpec[type](name, name, name, GObject.ParamFlags.READWRITE, ...dflt);

function toText(color, format) {
    switch(format) {
    case Format.RGB: return 'rgb(%d, %d, %d)'.format(color.red, color.green, color.blue);
    case Format.HSL: return ((h, l, s) => 'hsl(%d, %f%%, %f%%)'.format(h, Number(s * 100).toFixed(1), Number(l * 100).toFixed(1)))(...color.to_hls());
    default: return color.to_string().slice(0, 7);
    }
}

function toHex(text) {
    if(text.includes('hsl')) {
        let [h, s, l] = text.slice(4, -1).split(',').map((v, i) => parseFloat(v) / (i ? 100 : 1));
        return Clutter.Color.from_hls(h, l, s).to_string().slice(0, 7);
    } else if(text.includes('rgb')) {
        return Clutter.Color.from_string(text)[1].to_string().slice(0, 7);
    } else {
        return text;
    }
}

function toMarkup(text) {
    let hex = toHex(text);
    let lightness = Clutter.Color.from_string(hex)[1].to_hls()[1];
    // NOTE: https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
    return ' <span fgcolor="%s" bgcolor="%s">%s</span>'.format(Math.round(lightness) ? '#000' : '#fff', hex, text);
}

class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style, callbacks) {
        super({ activate: false });
        this._style = style;
        this._hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        callbacks.forEach(xs => this.addButton(...xs));
        this.add_child(this._hbox);
    }

    addButton(icon_name, callback) {
        let btn = new St.Button({ x_expand: true, style_class: this._style, child: new St.Icon({ icon_name, style_class: 'popup-menu-icon' }) });
        btn.connect('clicked', callback);
        this._hbox.add_child(btn);
    }
}

class ColorItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(color, style, callback) {
        super();
        this._label = new St.Label({ x_expand: true });
        this._button = new St.Button({ child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', style_class: 'popup-menu-icon' }) });
        this._button.connect('clicked', () => { this._call(this._color); });
        [this._label, this._button].forEach(x => this.add_child(x));
        this.setLabel(color);
        this.setButton(style, callback);
        this.connect('activate', () => { St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._color); });
    }

    setLabel(label) {
        if(this._color === label) return;
        this._color = label || '#ffffff';
        this._label.clutter_text.set_markup(toMarkup(this._color));
    }

    setButton(style, callback) {
        this._call = callback;
        if(this._style === style) return;
        if(this._style) this._button.remove_style_class_name(this._style);
        this._button.add_style_class_name(this._style = style);
    }
}

class DListSection extends PopupMenu.PopupMenuSection {
    constructor(list, style, callback) {
        super();
        this.updateList(list, style, callback);
    }

    setList(list) {
        let items = this._items;
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ColorItem(null, this._style, this._call));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._items.forEach((x, i) => x.setLabel(list[i]));
    }

    updateList(list, style, callback) {
        this._style = style;
        this._call = callback;
        this.setList(list);
        this._items.forEach(x => x.setButton(this._style, this._call));
    }

    get _items() {
        return this._getMenuItems();
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(numb, base) {
        super(numb / base);
        this.base = base;
        this.step = base > 1 ? 1 / base : 0.01;
    }

    get numb() {
        return this.value * this.base;
    }

    set numb(numb) {
        this.value = numb / this.base;
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
}

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, numb, base, callback) {
        super({ activate: false });
        let label = new St.Label({ text, x_expand: false });
        this._slider = new ColorSlider(numb, base);
        this._slider.connect('notify::value', () => { if(this._slider._dragging || this.active) callback(this._slider.numb); });
        this.connect('button-press-event', (a_, event) => { return this._slider.startDragging(event); });
        this.connect('key-press-event', (a_, event) => { return this._slider.emit('key-press-event', event); });
        this.connect('scroll-event', (a_, event) => { return this._slider.emit('scroll-event', event); });
        [label, this._slider].forEach(x => this.add_child(x));
    }

    setNumber(numb) {
        this._slider.numb = numb;
    }
}

class ColorMenu extends GObject.Object {
    static {
        GObject.registerClass({
            Signals: {
                color_selected: { param_types: [GObject.TYPE_STRING] },
                menu_closed: { },
            },
        }, this);
    }

    constructor(actor, area) {
        super();
        this._color = new Clutter.Color({ red: 255, green: 255, blue: 255 });
        this._menu = new PopupMenu.PopupMenu(actor, 0.15, St.Side.LEFT);
        this._menu.connectObject('open-state-changed', (_menu, open) => setCursor(open ? 'DEFAULT' : 'BLANK'),
            'menu-closed', () => this.emit('menu-closed'), this);
        this._manager = new PopupMenu.PopupMenuManager(area);
        this._manager.addMenu(this._menu);
        this.actor.add_style_class_name('color-picker-menu app-menu');
        this.actor.hide();
        this._addMenuItems();
    }

    _addMenuItems() {
        let [h, l, s] = this._color.to_hls();
        this._menus = {
            hex: this._genRGBSection(),
            rgb: new PopupMenu.PopupSeparatorMenuItem(),
            r:   new SliderItem('R', this._color.red, 255, red => { this.rgbColor = { red }; }),
            g:   new SliderItem('G', this._color.green, 255, green => { this.rgbColor = { green }; }),
            b:   new SliderItem('B', this._color.blue, 255, blue => { this.rgbColor = { blue }; }),
            hsl: new PopupMenu.PopupSeparatorMenuItem(),
            h:   new SliderItem('H', h, 360, x => { this.hlsColor = { 0: x }; }),
            l:   new SliderItem('L', l, 1, x => { this.hlsColor = { 1: x }; }),
            s:   new SliderItem('S', s, 1, x => { this.hlsColor = { 2: x }; }),
        };
        for(let p in this._menus) this._menu.addMenuItem(this._menus[p]);
    }

    _genRGBSection() {
        let hex = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item' });
        hex.connect('activate', () => { this._emitSelected('HEX'); });
        let rgb = new St.Button({ x_expand: false, label: 'RGB', style_class: 'color-picker-label-button button' });
        let hsl = new St.Button({ x_expand: false, label: 'HSL', style_class: 'color-picker-label-button button' });
        rgb.connect('clicked', () => { this._emitSelected(Format.RGB); });
        hsl.connect('clicked', () => { this._emitSelected(Format.HSL); });
        hex.add_child(rgb);
        hex.add_child(hsl);
        hex.label = new St.Label({ x_expand: true });
        hex.add_child(hex.label);
        return hex;
    }

    get actor() {
        return this._menu.actor;
    }

    open(color) {
        if(this._menu.isOpen) this._menu.close();
        this._color = color;
        this.hlsColor = {};
        this._menu.open(BoxPointer.PopupAnimation.NONE);
    }

    _updateLabelText() {
        this._menus.hex.label.clutter_text.set_markup(toMarkup(toText(this._color)));
        this._menus.rgb.label.set_text(toText(this._color, Format.RGB).toUpperCase());
        this._menus.hsl.label.set_text(toText(this._color, Format.HSL).toUpperCase());
    }

    set hlsColor(color) {
        let hls = this._color.to_hls();
        this._color = Clutter.Color.from_hls(...Object.assign(this._color.to_hls(), color));
        this._menus.r.setNumber(this._color.red);
        this._menus.g.setNumber(this._color.green);
        this._menus.b.setNumber(this._color.blue);
        ['h', 'l', 's'].forEach((x, i) => !(i in color) && this._menus[x].setNumber(hls[i]));
        this._updateLabelText();
    }

    set rgbColor(color) {
        Object.assign(this._color, color);
        let hls = this._color.to_hls();
        ['h', 'l', 's'].forEach((x, i) => this._menus[x].setNumber(hls[i]));
        this._updateLabelText();
    }

    _emitSelected(format) {
        this._menu.close();
        this.emit('color-selected', toText(this._color, format));
    }

    destroy() {
        this._menu.destroy();
        this._menu = this._manager = null;
    }
}

class ColorArea extends St.Widget {
    static {
        GObject.registerClass({
            Properties: {
                preview: genParam('boolean', 'preview', false),
                persist: genParam('boolean', 'persist', false),
            },
            Signals: {
                end_pick: {},
                notify_color: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(params) {
        super({ reactive: true });
        this.once = params?.once || false;
        this._picker = new Shell.Screenshot();
        this._color = new Clutter.Color({ red: 0, green: 0, blue: 0 });
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this.connect('popup-menu', () => { if(this._icon) this._menu.open(this._color); });
        [[Fields.PERSISTENTMODE, 'persist'], [Fields.ENABLEPREVIEW, 'preview']]
            .forEach(([x, y, z]) => gsettings.bind(x, this, y, z ?? Gio.SettingsBindFlags.GET));
        this.set_size(...global.display.get_size());
        setCursor(this._preview ? 'BLANK' : 'CROSSHAIR');
    }

    get _persist() {
        return this.persist && !this.once;
    }

    async _pick() {
        let [x, y] = global.get_pointer();
        let [color] = await this._picker.pick_color(x, y);
        this._color = color;
        if(!this._icon) return;
        this._effect.color = this._color;
        this._icon.set_position(x, y);
        this._icon.show();
    }

    set preview(preview) {
        if((this._preview = preview)) {
            if(this._icon) return;
            let gicon =  Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child('color-pick.svg').get_path());
            this._effect = new Screenshot.RecolorEffect({ chroma: new Clutter.Color({ red: 80, green: 219, blue: 181 }), threshold: 0.03, smoothing: 0.3 });
            this._icon = new St.Icon({ visible: false, effect: this._effect, gicon, icon_size: Meta.prefs_get_cursor_size() * 1.5 });
            this._pick().catch(() => this.emit('end-pick'));
            this._menu = new ColorMenu(this._icon, this);
            Main.layoutManager.addTopChrome(this._menu.actor);
            Main.layoutManager.addTopChrome(this._icon);
            this._menu.connectObject('menu-closed', () => { this._pick().catch(() => this.emit('end-pick')); },
                'color-selected', (menu, color) => this._emitColor(color), this);
        } else {
            if(!this._icon) return;
            ['_menu', '_icon', '_effect'].forEach(x => { this[x].destroy?.(); this[x] = null; });
        }
    }

    _emitColor(color) {
        this.emit('notify-color', color || toText(this._color));
        if(!this._persist) this.emit('end-pick');
    }

    vfunc_motion_event() {
        if(this._icon) this._pick().catch(() => this.emit('end-pick'));
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_key_press_event(event) {
        let [X, Y] = global.get_pointer();
        switch(event.keyval) {
        case Clutter.KEY_Left:   this._pointer.notify_absolute_motion(global.get_current_time(), X - 1, Y); break;
        case Clutter.KEY_Up:     this._pointer.notify_absolute_motion(global.get_current_time(), X, Y - 1); break;
        case Clutter.KEY_Right:  this._pointer.notify_absolute_motion(global.get_current_time(), X + 1, Y); break;
        case Clutter.KEY_Down:   this._pointer.notify_absolute_motion(global.get_current_time(), X, Y + 1); break;
        case Clutter.KEY_Escape: this.emit('end-pick'); return Clutter.EVENT_PROPAGATE;
        }

        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event(event) {
        switch(event.button) {
        case 1:  this._icon ? this._emitColor() : this._pick().then(() => this._emitColor()); break;
        case 2:  if(this._icon) this._menu.open(this._color); break;
        default: this.emit('end-pick'); break;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        this.preview = this._pointer = this._picker = null;
        setCursor('DEFAULT');
        super.destroy();
    }
}

class ColorButton extends PanelMenu.Button {
    static {
        GObject.registerClass({
            Properties: {
                collect:    genParam('string', 'collect', ''),
                history:    genParam('string', 'history', ''),
                icon_name:  genParam('string', 'icon_name', ''),
                menu_size:  genParam('uint', 'menu_size', 1, 16, 8),
                menu_style: genParam('uint', 'menu_style', 0, 1, 0),
            },
            Signals: {
                btn_left_click: {},
            },
        }, this);
    }

    constructor(params) {
        super(params);
        this._buildWidgets();
        this._bindSettings();
        this._addMenuItems();
    }

    _buildWidgets() {
        this.menu.actor.add_style_class_name('app-menu');
        this.add_style_class_name('color-picker-systray');
        this._icon = new St.Icon({ style_class: 'system-status-icon' });
        this.add_actor(this._icon);
    }

    _bindSettings() {
        [
            [Fields.COLORSCOLLECT, 'collect'],
            [Fields.COLORSHISTORY, 'history'],
            [Fields.MENUSIZE,      'menu_size'],
            [Fields.SYSTRAYICON,   'icon_name'],
            [Fields.MENUSTYLE,     'menu_style'],
        ].forEach(([x, y, z]) => gsettings.bind(x, this, y, z ?? Gio.SettingsBindFlags.GET));
    }

    _addMenuItems() {
        this._menus = {
            section:  new DListSection(...this.section),
            sep:      new PopupMenu.PopupSeparatorMenuItem(),
            settings: new IconItem('color-picker-setting', [
                ['find-location-symbolic', () => { this.menu.close(); this.emit('btn-left-click'); }],
                ['face-cool-symbolic',     () => { gsettings.set_uint(Fields.MENUSTYLE, 1 - this._menu_style); }],
                ['emblem-system-symbolic', () => { this.menu.close(); ExtensionUtils.openPrefs(); }],
            ]),
        };
        for(let p in this._menus) this.menu.addMenuItem(this._menus[p]);
    }

    set icon_name(path) {
        path ? this._icon.set_gicon(Gio.Icon.new_for_string(path)) : this._icon.set_icon_name('color-select-symbolic');
    }

    set history(history) {
        this._history = history.split('|').filter(Boolean);
        if(this._menu_style === Menu.History) this._menus?.section.setList(this._history);
    }

    set collect(collect) {
        this._collect = collect.split('|').filter(Boolean);
        if(this._menu_style === Menu.Collect) this._menus?.section.setList(this._collect);
    }

    set menu_style(menu_style) {
        if(this._menu_style === menu_style) return;
        this._menu_style = menu_style;
        this._menus?.section.updateList(...this.section);
    }

    get section() {
        return this._menu_style === Menu.History
            ? [this._history, 'color-picker-history', x => { this._addCollect(x); }]
            : [this._collect, 'color-picker-collect', x => { this._delCollect(x); }];
    }

    _addCollect(color) {
        if(this._collect.includes(color)) return;
        let collect = [color, ...this._collect];
        while(collect.length > this.menu_size) collect.pop();
        gsettings.set_string(Fields.COLORSCOLLECT, collect.join('|'));
    }

    _delCollect(color) {
        this._collect.splice(this._collect.indexOf(color), 1);
        gsettings.set_string(Fields.COLORSCOLLECT, this._collect.join('|'));
    }

    vfunc_event(event) {
        if(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === 1) {
            this.emit('btn-left-click');
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }
}

class ColorPicker extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                history:       genParam('string', 'history', ''),
                systray:       genParam('boolean', 'systray', true),
                auto_copy:     genParam('boolean', 'auto_copy', true),
                shortcut:      genParam('boolean', 'shortcut', false),
                menu_size:     genParam('uint', 'menu_size', 1, 16, 8),
                notify_style:  genParam('uint', 'notify_style', 0, 1, 0),
                enable_notify: genParam('boolean', 'enable_notify', true),
            },
        }, this);
    }

    constructor() {
        super();
        this._bindSettings();
    }

    _bindSettings() {
        [
            [Fields.ENABLESYSTRAY,  'systray'],
            [Fields.MENUSIZE,       'menu_size'],
            [Fields.AUTOCOPY,       'auto_copy'],
            [Fields.ENABLESHORTCUT, 'shortcut'],
            [Fields.ENABLENOTIFY,   'enable_notify'],
            [Fields.NOTIFYSTYLE,    'notify_style'],
            [Fields.COLORSHISTORY,  'history', Gio.SettingsBindFlags.DEFAULT],
        ].forEach(([x, y, z]) => gsettings.bind(x, this, y, z ?? Gio.SettingsBindFlags.GET));
    }

    set shortcut(shortcut) {
        this._shortId && Main.wm.removeKeybinding(Fields.PICKSHORTCUT);
        this._shortId = shortcut && Main.wm.addKeybinding(Fields.PICKSHORTCUT, gsettings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this.summon.bind(this));
    }

    set systray(systray) {
        if(systray) {
            if(this._button) return;
            this._button = new ColorButton(0.5, Me.metadata.uuid);
            this._button.connect('btn-left-click', this.summon.bind(this));
            Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        } else {
            if(!this._button) return;
            this._button.destroy();
            this._button = null;
        }
    }

    summon() {
        if(this._area) return;
        if(this._button) this._button.add_style_pseudo_class('busy');
        this._area = new ColorArea();
        this._area.connect('end-pick', this.dispel.bind(this));
        this._area.connect('notify-color', this.inform.bind(this));
        Main.layoutManager.addChrome(this._area);
        this._grab = Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
    }

    dispel() {
        if(!this._area) return;
        if(this._button) this._button.remove_style_pseudo_class('busy');
        Main.popModal(this._grab);
        this._area.destroy();
        this._grab = null;
        this._area = null;
    }

    inform(actor, color) {
        this._addHistory(color);
        if(!this.enable_notify) return;
        if(this.notify_style === Notify.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor();
            let icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' });
            let osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style('color: %s;'.format(toHex(color)));
            Main.osdWindowManager.show(index, icon, color, null, 2);
            osd._hbox.connectObject('notify::mapped', box => {
                if(box.mapped) return Clutter.EVENT_STOP;
                osd._icon.set_style('');
                osd._hbox.disconnectObject(this);
                return Clutter.EVENT_STOP;
            }, this);
        }
    }

    _addHistory(color) {
        if(this.auto_copy) St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
        let history = [color, ...this.history.split('|').filter(Boolean)];
        while(history.length > this.menu_size) history.pop();
        this.history = history.join('|');
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) { reject(new Error('Cannot start picking')); return; }
                if(this._button) this._button.add_style_pseudo_class('busy');
                this._area = new ColorArea({ once: true });
                this._area.connect('end-pick', () => { this.dispel(); reject(new Error('Cancelled')); });
                this._area.connect('notify-color', (actor, color) => { resolve(color); });
                Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
                Main.layoutManager.addTopChrome(this._area);
            } catch(e) {
                reject(e);
            }
        });
    }

    destroy() {
        this.dispel();
        this.systray = this.shortcut = null;
    }
}

class Extension {
    static {
        ExtensionUtils.initTranslations();
    }

    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        return this._ext.pickAsync();
    }

    enable() {
        gsettings = ExtensionUtils.getSettings();
        this._ext = new ColorPicker();
    }

    disable() {
        this._ext.destroy();
        gsettings = this._ext = null;
    }
}

function init() {
    return new Extension();
}
