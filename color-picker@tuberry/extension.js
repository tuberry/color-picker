// vim:fdm=syntax
// by tuberry
//
const Main = imports.ui.main;
const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;
const { Gio, St, Shell, GObject, Clutter, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const NOTIFY = { MSG: 0, OSD: 1 };
const MENU = { HISTORY: 0, COLLECTION: 1 };
const NOTATION = { HEX: 0, RGB: 1, HSL: 2 };
const COLOR_PICK_ICON = Me.dir.get_child('icons').get_child('color-pick.svg').get_path();
const DROPPER_ICON = Me.dir.get_child('icons').get_child('dropper-symbolic.svg').get_path();

const convColorToCSS = (color, notation) => {
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

const convColorToHex = string => {
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

// js/ui/screenshot.js
const RecolorEffect = GObject.registerClass({
    Properties: {
        color: GObject.ParamSpec.boxed(
            'color', 'color', 'replacement color',
            GObject.ParamFlags.WRITABLE,
            Clutter.Color.$gtype),
        chroma: GObject.ParamSpec.boxed(
            'chroma', 'chroma', 'color to replace',
            GObject.ParamFlags.WRITABLE,
            Clutter.Color.$gtype),
        threshold: GObject.ParamSpec.float(
            'threshold', 'threshold', 'threshold',
            GObject.ParamFlags.WRITABLE,
            0.0, 1.0, 0.0),
        smoothing: GObject.ParamSpec.float(
            'smoothing', 'smoothing', 'smoothing',
            GObject.ParamFlags.WRITABLE,
            0.0, 1.0, 0.0),
    },
}, class RecolorEffect extends Shell.GLSLEffect {
    _init(params) {
        this._color = new Clutter.Color();
        this._chroma = new Clutter.Color();
        this._threshold = 0;
        this._smoothing = 0;

        this._colorLocation = null;
        this._chromaLocation = null;
        this._thresholdLocation = null;
        this._smoothingLocation = null;

        super._init(params);

        this._colorLocation = this.get_uniform_location('recolor_color');
        this._chromaLocation = this.get_uniform_location('chroma_color');
        this._thresholdLocation = this.get_uniform_location('threshold');
        this._smoothingLocation = this.get_uniform_location('smoothing');

        this._updateColorUniform(this._colorLocation, this._color);
        this._updateColorUniform(this._chromaLocation, this._chroma);
        this._updateFloatUniform(this._thresholdLocation, this._threshold);
        this._updateFloatUniform(this._smoothingLocation, this._smoothing);
    }

    _updateColorUniform(location, color) {
        if (!location)
            return;

        this.set_uniform_float(location,
            3, [color.red / 255, color.green / 255, color.blue / 255]);
        this.queue_repaint();
    }

    _updateFloatUniform(location, value) {
        if (!location)
            return;

        this.set_uniform_float(location, 1, [value]);
        this.queue_repaint();
    }

    get color() {
        return this._color;
    }

    set color(c) {
        if (this._color.equal(c))
            return;

        this._color = c;
        this.notify('color');

        this._updateColorUniform(this._colorLocation, this._color);
    }

    set chroma(c) {
        if (this._chroma.equal(c))
            return;

        this._chroma = c;
        this.notify('chroma');

        this._updateColorUniform(this._chromaLocation, this._chroma);
    }

    set threshold(value) {
        if (this._threshold === value)
            return;

        this._threshold = value;
        this.notify('threshold');

        this._updateFloatUniform(this._thresholdLocation, this._threshold);
    }

    set smoothing(value) {
        if (this._smoothing === value)
            return;

        this._smoothing = value;
        this.notify('smoothing');

        this._updateFloatUniform(this._smoothingLocation, this._smoothing);
    }

    vfunc_build_pipeline() {
        // Conversion parameters from https://en.wikipedia.org/wiki/YCbCr
        const decl = `
            vec3 rgb2yCrCb(vec3 c) {                                \n
                float y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;  \n
                float cr = 0.7133 * (c.r - y);                      \n
                float cb = 0.5643 * (c.b - y);                      \n
                return vec3(y, cr, cb);                             \n
            }                                                       \n
                                                                    \n
            uniform vec3 chroma_color;                              \n
            uniform vec3 recolor_color;                             \n
            uniform float threshold;                                \n
            uniform float smoothing;                                \n`;
        const src = `
            vec3 mask = rgb2yCrCb(chroma_color.rgb);                \n
            vec3 yCrCb = rgb2yCrCb(cogl_color_out.rgb);             \n
            float blend =                                           \n
              smoothstep(threshold,                                 \n
                         threshold + smoothing,                     \n
                         distance(yCrCb.gb, mask.gb));              \n
            cogl_color_out.rgb =                                    \n
              mix(recolor_color, cogl_color_out.rgb, blend);        \n`;

        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, decl, src, false);
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
        this._menu.connect('open-state-changed', (menu, open) => global.display.set_cursor(Meta.Cursor[open ? 'DEFAULT' : 'CROSSHAIR']));
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
        this._rgb = this._separatorItem(section, convColorToCSS(this._color, NOTATION.RGB).toUpperCase());
        this._rslider = this._sliderItem(section, 'R', r / 255, x => { this.rgbColor = Clutter.Color.new(Math.round(x * 255), this._color.green, this._color.blue, 255); });
        this._gslider = this._sliderItem(section, 'G', g / 255, x => { this.rgbColor = Clutter.Color.new(this._color.red, Math.round(x * 255), this._color.blue, 255); });
        this._bslider = this._sliderItem(section, 'B', b / 255, x => { this.rgbColor = Clutter.Color.new(this._color.red, this._color.green, Math.round(x * 255), 255); });

        this._menu.addMenuItem(this._rgb);
        this._menu.addMenuItem(this._rslider);
        this._menu.addMenuItem(this._gslider);
        this._menu.addMenuItem(this._bslider);
    }

    _addHSLSection() {
        let [h, l, s] = this._color.to_hls();
        let section = new PopupMenu.PopupMenuSection();
        this._hsl = this._separatorItem(section, convColorToCSS(this._color, NOTATION.HSL).toUpperCase());
        this._hslider = this._sliderItem(section, 'H', h / 360, x => { this.hslColor = Clutter.Color.from_hls(Math.round(x * 360), this._color.to_hls()[1] , this._color.to_hls()[2]); });
        this._sslider = this._sliderItem(section, 'S', s, x => {
            this.hslColor = Clutter.Color.from_hls(this._color.to_hls()[0], this._color.to_hls()[1], x);
            this._hslider.slider.value = this._color.to_hls()[0] / 360;
            this._lslider.slider.value = this._color.to_hls()[1];
        });
        this._lslider = this._sliderItem(section, 'L', l, x => {
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
        let hex = convColorToCSS(color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        this._rgb.label.set_text(convColorToCSS(color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convColorToCSS(color, NOTATION.HSL).toUpperCase());
        this._rslider.slider.value = color.red / 255;
        this._gslider.slider.value = color.green / 255;
        this._bslider.slider.value = color.blue / 255;
    }

    set rgbColor(color) {
        this._color = color;
        let [h, l, s] = color.to_hls();
        let hex = convColorToCSS(color, NOTATION.HEX);
        this._hex.label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        this._rgb.label.set_text(convColorToCSS(color, NOTATION.RGB).toUpperCase());
        this._hsl.label.set_text(convColorToCSS(color, NOTATION.HSL).toUpperCase());
        this._hslider.slider.value = h / 360;
        this._lslider.slider.value = l;
        this._sslider.slider.value = s;
    }

    _colorLabelItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item' });
        let hex = convColorToCSS(this._color, NOTATION.HEX);
        let label = new St.Label({ x_expand: true });
        label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(hex, hex));
        item.connect('activate', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convColorToCSS(this._color, NOTATION.HEX));
        });
        item.add_child(label);
        item.label = label;

        let rgb = new St.Button({ child: new St.Label({ text: 'RGB', }), style_class: 'color-picker-button' });
        rgb.connect('clicked', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convColorToCSS(this._color, NOTATION.RGB));
        });
        item.add_child(rgb);

        let hsl = new St.Button({ child: new St.Label({ text: 'HSL', }), style_class: 'color-picker-button' });
        hsl.connect('clicked', () => {
            item._getTopMenu().close();
            this.emit('color-selected', convColorToCSS(this._color, NOTATION.HSL));
        });
        item.add_child(hsl);

        return item;
    }

    _separatorItem(menu, text) {
        return new PopupMenu.PopupSeparatorMenuItem(text, { style_class: 'color-picker-item' });
    }

    _sliderItem(menu, text, value, func) {
        let item = new PopupMenu.PopupBaseMenuItem({ activate: false });
        let label = new St.Label({ text: text, style_class: 'color-picker-item', x_expand: false });
        let slider = new Slider.Slider(value);

        slider.connect('notify::value', () => { if(item.active) func(slider.value); });
        item.add_child(label);
        item.add_child(slider);
        item.slider = slider;

        return item;
    }

    destroy() {
        this._menu.destroy();
        this._menu = null;
        this._menuManager = null;
    }
});

const ColorArea = GObject.registerClass({
    Signals: {
        'end-pick': {},
        'notify-color': { param_types: [GObject.TYPE_STRING] },
    },
}, class ColorArea extends St.DrawingArea {
    _init(params) {
        super._init({ reactive: true });
        this._loadSettings();
        this.ignorePersistentMode = params && params.ignorePersistentMode || false;
    }

    vfunc_motion_event(motionEvent) {
        if(!this._enablePreview) return Clutter.EVENT_PROPAGATE;
        const { x, y } = motionEvent;
        this._pickAt(x, y);
        return Clutter.EVENT_PROPAGATE;
    }

    _pickAt(x, y) {
        this._pick.pick_color(x, y, (pick, res) => {
            try {
                let [, color] = pick.pick_color_finish(res);
                this._icon.set_position(x, y);
                this._effect.color = color;
                this._icon.show();
            } catch(e) {
                //
            }
        });
    }

    _loadSettings() {
        this._pick = new Shell.Screenshot();
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this._enablePreview = gsettings.get_boolean(Fields.ENABLEPREVIEW);
        this._enablePreviewId = gsettings.connect('changed::' + Fields.ENABLEPREVIEW, () => { this._enablePreview = gsettings.get_boolean(Fields.ENABLEPREVIEW); });
    }

    get _enablePreview() {
        return gsettings.get_boolean(Fields.ENABLEPREVIEW);
    }

    get _persistentMode() {
        return gsettings.get_boolean(Fields.PERSISTENTMODE) && !this.ignorePersistentMode;
    }

    set _enablePreview(enable) {
        if(enable) {
            if(this._icon) return;
            this._addPreviewCursor();
        } else {
            if(!this._icon) return;
            this._removePreviewCursor();
        }
    }

    _addPreviewCursor() {
        this._effect = new RecolorEffect({
            chroma: new Clutter.Color({
                red: 80,
                green: 219,
                blue: 181,
            }),
            threshold: 0.03,
            smoothing: 0.3,
        });

        this._icon = new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(COLOR_PICK_ICON) }),
            icon_size: Meta.prefs_get_cursor_size() * 1.5,
            effect: this._effect,
            visible: false,
        });
        let [x, y] = global.get_pointer();
        this._pickAt(x, y);

        this._menu = new ColorMenu(this._icon, this);
        this._menu.actor.hide();
        Main.layoutManager.addTopChrome(this._menu.actor);
        Main.layoutManager.addTopChrome(this._icon);
        this._onMenuColorSelectedId = this._menu.connect('color-selected', (menu, color) => {
            this.emit('notify-color', color);
            if(!this._persistentMode) this.emit('end-pick');
        });
    }

    _removePreviewCursor() {
        if(this._onMenuColorSelectedId) this._menu.disconnect(this._onMenuColorSelectedId), this._onMenuColorSelectedId = 0;
        this._menu.destroy();
        this._icon.destroy();
        this._menu = null;
        this._icon = null;
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
            break;
        case Clutter.KEY_Menu:
            if(this._enablePreview) this._menu.open(this._effect.color);
            break;
        default:
            if(!this._persistentMode) this.emit('end-pick');
            break;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_press_event(event) {
        switch(event.button) {
        case 1:
            if(this._enablePreview) {
                let hex = convColorToCSS(this._effect.color, NOTATION.HEX);
                this.emit('notify-color', hex);
            } else {
                let [x, y] = global.get_pointer();
                this._pick.pick_color(x, y, (pick, res) => {
                    try {
                        let [ok, color] = pick.pick_color_finish(res);
                        if(ok) {
                            let hex = convColorToCSS(color, NOTATION.HEX);
                            this.emit('notify-color', hex);
                        }
                    } catch(e) {
                        //
                    }
                });
            }
            if(!this._persistentMode) this.emit('end-pick');
            break;
        case 2:
            if(this._enablePreview)
                this._menu.open(this._effect.color);
            break;
        default:
            this.emit('end-pick');
            break;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    destroy() {
        if(this._enablePreviewId) gsettings.disconnect(this._enablePreviewId), this._enablePreviewId = 0;

        this._pick = null;
        this._pointer = null;
        this._enablePreview = false;

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
        if (this.menu &&
            (event.type() == Clutter.EventType.TOUCH_BEGIN ||
                event.type() == Clutter.EventType.BUTTON_PRESS))
            this.menu.toggle();

        return Clutter.EVENT_PROPAGATE;
    };
});

const ColorPicker = GObject.registerClass(
class ColorPicker extends GObject.Object {
    _init() {
        super._init();
        this._colorHistory = [];
        this._colorCollection = [];
    }

    get _menuSize() {
        return gsettings.get_uint(Fields.MENUSIZE);
    }

    get _enableNotify() {
        return gsettings.get_boolean(Fields.ENABLENOTIFY);
    }

    get _notifyStyle() {
        return gsettings.get_uint(Fields.NOTIFYSTYLE);
    }

    set _enableShortcut(enable) {
        if(enable) {
            Main.wm.addKeybinding(Fields.PICKSHORTCUT, gsettings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, this._beginPick.bind(this));
        } else {
            Main.wm.removeKeybinding(Fields.PICKSHORTCUT);
        }
    }

    set _enableSystray(enable) {
        if(enable) {
            if(this._button) return;
            this._addButton();
        } else {
            if(!this._button) return;
            this._button.destroy();
            this._button = null;
        }
    }

    get _enableSystray() {
        return gsettings.get_boolean(Fields.ENABLESYSTRAY);
    }

    _updateMenu() {
        this._button.menu.removeAll();
        if(this._menuStyle == MENU.HISTORY) {
            this._colorHistory.forEach(x => this._button.menu.addMenuItem(this._menuItemMaker(x)));
        } else {
            this._colorCollection.forEach(x => this._button.menu.addMenuItem(this._menuItemMaker(x)));
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
        label.clutter_text.set_markup('<span background="%s">     </span>  %s'.format(convColorToHex(color), color));
        item.add_child(label);

        let button = new St.Button({
            style_class: this._menuStyle == MENU.HISTORY ? 'color-picker-history' : 'color-picker-collection',
            child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', style_class: 'popup-menu-icon', }),
        });
        button.connect('clicked', () => {
            if(this._menuStyle == MENU.HISTORY) {
                if(this._colorCollection.includes(color)) return;
                this._colorCollection.unshift(color);
                gsettings.set_strv(Fields.COLORCOLLECTION, this._colorCollection.slice(0, this._menuSize));
            } else {
                let index = this._colorCollection.indexOf(color);
                if(index != -1) this._colorCollection.splice(index, 1);
                gsettings.set_strv(Fields.COLORCOLLECTION, this._colorCollection);
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
                child: new St.Icon({ icon_name: icon, style_class: 'popup-menu-icon', }),
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

    _addButton() {
        this._button = new ColorButton(null);
        this._button.add_actor(new St.Icon({
            // icon_name: 'gtk-color-picker-symbolic', // NOTE: not symbolic
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(DROPPER_ICON) }),
            style_class: 'color-picker system-status-icon' })
        );
        this._button.connect('left-click', this._beginPick.bind(this));
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        this._updateMenu();
    }

    _beginPick() {
        if(this._area !== null) return;
        global.display.set_cursor(Meta.Cursor.CROSSHAIR); // NOTE: set NONE get 'Bail out' from Mutter
        if(this._enableSystray) this._button.add_style_class_name('active');
        this._area = new ColorArea();
        this._area.set_size(...global.display.get_size());
        this._area.endId = this._area.connect('end-pick', this._endPick.bind(this));
        this._area.showId = this._area.connect('notify-color', this._notify.bind(this));
        Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
        Main.layoutManager.addChrome(this._area);
    }

    _endPick() {
        if(this._area === null) return;
        global.display.set_cursor(Meta.Cursor.DEFAULT);
        if(this._enableSystray) this._button.remove_style_class_name('active');
        if(this._area.endId) this._area.disconnect(this._area.endId), this._area.endId = 0;
        if(this._area.showId) this._area.disconnect(this._area.showId), this._area.showId = 0;
        if(Main._findModal(this._area) != -1) Main.popModal(this._area);
        this._area.destroy();
        this._area = null;
    }

    _notify(actor, color) {
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, color);
        if(!this._colorHistory.includes(color)) {
            this._colorHistory.unshift(color);
            gsettings.set_strv(Fields.COLORHISTORY, this._colorHistory.slice(0, this._menuSize));
        }
        if(!this._enableNotify) return;
        if(this._notifyStyle == NOTIFY.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor();
            let icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' });
            let osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style('color: %s;'.format(convColorToHex(color)));
            Main.osdWindowManager.show(index, icon, color, null, 2);
            let clearId = osd._label.connect('notify::text', () => {
                if(this._area !== null) return;
                osd._icon.set_style('color: none;');
                osd._label.disconnect(clearId);
                return Clutter.EVENT_STOP;
            });
        }
    }

    _fetchSettings() {
        this._menuStyle = gsettings.get_uint(Fields.MENUSTYLE);
        this._colorHistory = gsettings.get_strv(Fields.COLORHISTORY);
        this._enableSystray = gsettings.get_boolean(Fields.ENABLESYSTRAY);
        this._colorCollection = gsettings.get_strv(Fields.COLORCOLLECTION);
        this._enableShortcut = gsettings.get_boolean(Fields.ENABLESHORTCUT);
    }

    // API
    // test: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area !== null) { reject(new Error('Cannot start picking')); return; }
                global.display.set_cursor(Meta.Cursor.CROSSHAIR); // NOTE: set NONE get 'Bail out' from Mutter
                if(this._enableSystray) this._button.add_style_class_name('active');
                this._area = new ColorArea({ ignorePersistentMode: true });
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

    enable() {
        this._area = null;
        this._fetchSettings();
        this._menuStyleId = gsettings.connect('changed::' + Fields.MENUSTYLE, () => {
            this._menuStyle = gsettings.get_uint(Fields.MENUSTYLE);
            this._updateMenu();
        });
        this._colorHistoryId = gsettings.connect('changed::' + Fields.COLORHISTORY, () => {
            this._colorHistory = gsettings.get_strv(Fields.COLORHISTORY);
            if(this._menuStyle == MENU.HISTORY) this._updateMenu();
        });
        this._colorCollectionId = gsettings.connect('changed::' + Fields.COLORCOLLECTION, () => {
            this._colorCollection = gsettings.get_strv(Fields.COLORCOLLECTION);
            if(this._menuStyle == MENU.COLLECTION) this._updateMenu();
        });
        this._enableSystrayId = gsettings.connect('changed::' + Fields.ENABLESYSTRAY, () => { this._enableSystray = gsettings.get_boolean(Fields.ENABLESYSTRAY); });
        this._enableShortcutId = gsettings.connect('changed::' + Fields.ENABLESHORTCUT, () => { this._enableShortcut = gsettings.get_boolean(Fields.ENABLESHORTCUT); });
    }

    disable() {
        this._endPick();
        for(let x in this)
            if(RegExp(/^_.+Id$/).test(x)) eval('if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;'.format(x, x, x));
        this._enableSystray = false;
        this._enableShortcut = false;
    }
});

function init() {
    ExtensionUtils.initTranslations();
    return new ColorPicker();
}
