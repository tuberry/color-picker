// vim:fdm=syntax
// by tuberry
//
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const { Gio, St, Shell, Gdk, GObject, Clutter, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const MENUSIZE = 8;
const NOTIFY = { MSG: 0, OSD: 1 };
const MENU = { HISTORY: 0, COLLECTION: 1 };
const COLOR_PICK_ICON = Me.dir.get_child('icons').get_child('color-pick.svg').get_path();
const DROPPER_ICON = Me.dir.get_child('icons').get_child('dropper-symbolic.svg').get_path();

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

const ColorArea = GObject.registerClass({
    Signals: {
        'end-pick': {},
        'notify-color': { param_types: [GObject.TYPE_STRING] },
    },
}, class ColorArea extends St.DrawingArea {
    _init() {
        super._init({ reactive: true });
        this._loadSettings();
    }

    vfunc_motion_event(motionEvent) {
        if(!this._enablePreview) return Clutter.EVENT_PROPAGATE;
        const { x, y } = motionEvent;
        this._pick.pick_color(x, y, (pick, res) => {
            try {
                let [ok, color] = pick.pick_color_finish(res);
                if(ok) {
                    this._icon.set_position(x, y);
                    this._effect.color = color;
                    this._icon.show();
                }
            } catch(e) {
                //
            }
        });

        return Clutter.EVENT_PROPAGATE;
    }

    _loadSettings() {
        this._persistentMode = gsettings.get_boolean(Fields.PERSISTENTMODE);
        this._persistentModeId = gsettings.connect(`changed::${Fields.PERSISTENTMODE}`, () => {
            this._persistentMode = gsettings.get_boolean(Fields.PERSISTENTMODE);
        });


        this._enablePreview = gsettings.get_boolean(Fields.ENABLEPREVIEW);
        this._enablePreviewId = gsettings.connect(`changed::${Fields.ENABLEPREVIEW}`, () => {
            this._enablePreview = gsettings.get_boolean(Fields.ENABLEPREVIEW);
            this._enablePreview ? this._addPreviewCursor() : this._removePreviewCursor();
        });
        if(this._enablePreview) this._addPreviewCursor();

        this._pick = new Shell.Screenshot();

        this._onKeyPressedId = this.connect('key-press-event', this._onKeyPressed.bind(this));
        this._onButtonPressedId = this.connect('button-press-event', this._onButtonPressed.bind(this));
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
        Main.uiGroup.add_actor(this._icon);
    }

    _onKeyPressed(actor, event) { // NOTE: not working on wayland
        let [screen, X, Y] = Gdk.Display.get_default().get_pointer();
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Left:
            Gdk.Display.get_default().warp_pointer(screen, X-1, Y);
            break;
        case Clutter.KEY_Up:
            Gdk.Display.get_default().warp_pointer(screen, X, Y-1);
            break;
        case Clutter.KEY_Right:
            Gdk.Display.get_default().warp_pointer(screen, X+1, Y);
            break;
        case Clutter.KEY_Down:
            Gdk.Display.get_default().warp_pointer(screen, X, Y+1);
            break;
        default:
            if(!this._persistentMode) this.emit('end-pick');
            break;
        }
    }

    _removePreviewCursor() {
        Main.uiGroup.remove_actor(this._icon);
        this._icon.destroy();
        this._icon = null;
    }

    _onButtonPressed(actor, event) {
        if(this._persistentMode && event.get_button() == 3) {
            this.emit('end-pick');
            return Clutter.EVENT_STOP;
        }
        let hexcolor = this._effect.color.to_string().slice(0, 7);
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, hexcolor);
        this.emit('notify-color', hexcolor);
        if(!this._persistentMode) this.emit('end-pick');
    }

    destroy() {
        this._pick = null;
        if(this._enablePreview) this._removePreviewCursor();
        if(this._persistentModeId) gsettings.disconnect(this._persistentModeId), this._persistentModeId = 0;
        if(this._enablePreviewId) gsettings.disconnect(this._enablePreviewId), this._enablePreviewId = 0;

        if(this._onKeyPressedId)    this.disconnect(this._onKeyPressedId), this._onKeyPressedId = 0;
        if(this._onButtonPressedId) this.disconnect(this._onButtonPressedId), this._onButtonPressedId = 0;
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
        if (event.get_button() == 1) {
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

    _fetchSettings() {
        this._menuSize = gsettings.get_uint(Fields.MENUSIZE);
        this._menuStyle = gsettings.get_uint(Fields.MENUSTYLE);
        this._notifyStyle = gsettings.get_uint(Fields.NOTIFYSTYLE);
        this._colorHistory = gsettings.get_strv(Fields.COLORHISTORY);
        this._enableNotify = gsettings.get_boolean(Fields.ENABLENOTIFY);
        this._enableSystray = gsettings.get_boolean(Fields.ENABLESYSTRAY);
        this._colorCollection = gsettings.get_strv(Fields.COLORCOLLECTION);
        this._enableShortcut = gsettings.get_boolean(Fields.ENABLESHORTCUT);
    }

    _loadSettings()  {
        this._area = null;
        this._fetchSettings();
        this._menuSizeId = gsettings.connect(`changed::$Fields.MENUSIZE`, () => {
            this._menuSize = gsettings.get_uint(Fields.MENUSIZE);
        });
        this._menuStyleId = gsettings.connect(`changed::${Fields.MENUSTYLE}`, () => {
            this._menuStyle = gsettings.get_uint(Fields.MENUSTYLE);
            this._updateMenu();
        });
        this._enableNotifyId = gsettings.connect(`changed::${Fields.ENABLENOTIFY}`, () => {
            this._enableNotify = gsettings.get_boolean(Fields.ENABLENOTIFY);
        });
        this._colorHistoryId = gsettings.connect(`changed::${Fields.COLORHISTORY}`, () => {
            this._colorHistory = gsettings.get_strv(Fields.COLORHISTORY);
            if(this._menuStyle == MENU.HISTORY) this._updateMenu();
        });
        this._colorCollectionId = gsettings.connect(`changed::${Fields.COLORCOLLECTION}`, () => {
            this._colorCollection = gsettings.get_strv(Fields.COLORCOLLECTION);
            if(this._menuStyle == MENU.COLLECTION) this._updateMenu();
        });
        this._notifyStyleId = gsettings.connect(`changed::${Fields.NOTIFYSTYLE}`, () => {
            this._notifyStyle = gsettings.get_uint(Fields.NOTIFYSTYLE);
        });
        this._enableSystrayId = gsettings.connect(`changed::${Fields.ENABLESYSTRAY}`, () => {
            this._enableSystray ? this._button.destroy() : this._addButton();
            this._enableSystray = !this._enableSystray;
        });
        this._enableShortcutId = gsettings.connect(`changed::${Fields.ENABLESHORTCUT}`, () => {
            this._toggleKeybindings(!this._enableShortcut);
            this._enableShortcut = !this._enableShortcut;
        });
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
        label.clutter_text.set_markup(`<span background="${color}">     </span>  ${color}`);
        item.add_child(label);

        let button = new St.Button({
            style_class: this._menuStyle == MENU.HISTORY ? 'color-picker-history' : 'color-picker-collection',
            child: new St.Icon({ icon_name: 'emblem-favorite-symbolic', style_class: 'popup-menu-icon', }),
        });
        button.connect('clicked', () => {
            if(this._menuStyle == MENU.HISTORY) {
                if(this._colorCollection.includes(color)) return;
                this._colorCollection.unshift(color);
                gsettings.set_strv(Fields.COLORCOLLECTION, this._colorCollection.slice(0, MENUSIZE));
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

    _toggleKeybindings(tog) {
        if(tog) {
            let ModeType = Shell.hasOwnProperty('ActionMode') ? Shell.ActionMode : Shell.KeyBindingMode;
            Main.wm.addKeybinding(Fields.SHORTCUT, gsettings, Meta.KeyBindingFlags.NONE, ModeType.ALL, () => { this._beginPick(); });
        } else {
            Main.wm.removeKeybinding(Fields.SHORTCUT);
        }
    }

    _addButton() {
        this._button = new ColorButton(null);
        this._button.add_actor(new St.Icon({
            // icon_name: 'gtk-color-picker-symbolic', // NOTE: not symbolic
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(DROPPER_ICON) }),
            style_class: 'color-picker system-status-icon' })
        );
        this._button.connect('left-click', () => {
                this._beginPick();
        });
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
        Main.layoutManager.removeChrome(this._area);
        this._area.destroy();
        this._area = null;
    }

    _notify(actor, color) {
        if(!this._colorHistory.includes(color)) {
            this._colorHistory.unshift(color);
            gsettings.set_strv(Fields.COLORHISTORY, this._colorHistory.slice(0, MENUSIZE));
        }
        if(!this._enableNotify) return;
        if(this._notifyStyle == NOTIFY.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor();
            let icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' });
            let osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style(`color: ${color};`);
            Main.osdWindowManager.show(index, icon, color, null, 2);
            let clearId = osd._label.connect('notify::text', () => {
                if(this._area !== null) return;
                osd._icon.set_style('color: none;');
                osd._label.disconnect(clearId);
                return Clutter.EVENT_STOP;
            });
        }
    }

    enable() {
        this._loadSettings();
        if(this._enableSystray) this._addButton();
        if(this._enableShortcut) this._toggleKeybindings(true);
    }

    disable() {
        this._endPick();
        if(this._enableSystray) this._button.destroy();
        if(this._enableShortcut) this._toggleKeybindings(false);
        for(let x in this)
            if(RegExp(/^_.+Id$/).test(x)) eval(`if(this.%s) gsettings.disconnect(this.%s), this.%s = 0;`.format(x, x, x));
    }
});

function init() {
    ExtensionUtils.initTranslations();
    return new ColorPicker();
}
