const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const { Gio, St, Shell, GObject, Clutter, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const gsettings = ExtensionUtils.getSettings();
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const Fields = Me.imports.prefs.Fields;

const SYS_ICON_PATH = Me.dir.get_child('icon').get_child('dropper-symbolic.svg').get_path();
const NOTIFY = { MSG: 0, OSD: 1 };

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

    _loadSettings() {
        this._enableNotify   = gsettings.get_boolean(Fields.ENABLENOTIFY);
        this._persistentMode = gsettings.get_boolean(Fields.PERSISTENTMODE);

        this._enableNotifyId = gsettings.connect(`changed::${Fields.ENABLENOTIFY}`, () => { this._enableNotify = gsettings.get_boolean(Fields.ENABLENOTIFY); });
        this._persistentModeId = gsettings.connect(`changed::${Fields.PERSISTENTMODE}`, () => { this._persistentMode = gsettings.get_boolean(Fields.PERSISTENTMODE); });

        this._onKeyPressedId = this.connect('key-press-event', this._onKeyPressed.bind(this));
        this._onButtonPressedId = this.connect('button-press-event', this._onButtonPressed.bind(this));
    }

    _onKeyPressed() {
        if(!this._persistentMode) this.emit('end-pick');
    }

    _onButtonPressed(actor, event) {
        if(this._persistentMode && event.get_button() == 3) {
            this.emit('end-pick');
            return Clutter.EVENT_STOP;
        }
        let pos = global.get_pointer().slice(0, 2);
        let pick = new Shell.Screenshot();
        pick.pick_color(...pos, (pick, res) => {
            try {
                let [ok, color] = pick.pick_color_finish(res);
                if(ok) {
                    let hexcolor = color.to_string().slice(0, 7);
                    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, hexcolor);
                    if(this._enableNotify) this.emit('notify-color', hexcolor);
                } else {
                    Main.notifyError(Me.metadata.name, _('Failed to pick color.'));
                }
            } catch(e) {
                Main.notifyError(Me.metadata.name, e.message);
            } finally {
                if(!this._persistentMode) this.emit('end-pick');
            }
        });
    }

    destroy() {
        if(this._enableNotifyId)   gsettings.disconnect(this._enableNotifyId), this._enableNotifyId = 0;
        if(this._persistentModeId) gsettings.disconnect(this._persistentModeId), this._persistentModeId = 0;

        if(this._onKeyPressedId)    this.disconnect(this._onKeyPressedId), this._onKeyPressedId = 0;
        if(this._onButtonPressedId) this.disconnect(this._onButtonPressedId), this._onButtonPressedId = 0;
    }
});

const ColorPicker = GObject.registerClass(
class ColorPicker extends GObject.Object {
    _init() {
        super._init();
    }

    _loadSettings()  {
        this._area = null;
        this._notifyStyle = gsettings.get_uint(Fields.NOTIFYSTYLE);
        this._enableSystray = gsettings.get_boolean(Fields.ENABLESYSTRAY);
        this._enableShortcut = gsettings.get_boolean(Fields.ENABLESHORTCUT);

        this._notifyStyleId = gsettings.connect(`changed::${Fields.NOTIFYSTYLE}`, () => { this._notifyStyle = gsettings.get_uint(Fields.NOTIFYSTYLE); });
        this._enableSystrayId = gsettings.connect(`changed::${Fields.ENABLESYSTRAY}`, () => {
            this._enableSystray ? this._button.destroy() : this._addButton();
            this._enableSystray = !this._enableSystray;
        });
        this._enableShortcutId = gsettings.connect(`changed::${Fields.ENABLESHORTCUT}`, () => {
            this._toggleKeybindings(!this._enableShortcut);
            this._enableShortcut = !this._enableShortcut;
        });
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
        this._button = new PanelMenu.Button(0, Me.metadata.name, true);
        this._button.add_actor(new St.Icon({
            gicon: new Gio.FileIcon({ file: Gio.File.new_for_path(SYS_ICON_PATH) }),
            style_class: 'color-picker system-status-icon' })
        );
        this._button.connect('button-press-event', () => { this._beginPick(); });
        Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
    }

    _beginPick() {
        if(this._area !== null) return;
        global.display.set_cursor(Meta.Cursor['CROSSHAIR']);
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
        global.display.set_cursor(Meta.Cursor['DEFAULT']);
        if(this._enableSystray) this._button.remove_style_class_name('active');
        if(this._area.endId) this._area.disconnect(this._area.endId), this._area.endId = 0;
        if(this._area.showId) this._area.disconnect(this._area.showId), this._area.showId = 0;
        if(Main._findModal(this._area) != -1) Main.popModal(this._area);
        Main.layoutManager.removeChrome(this._area);
        this._area.destroy();
        this._area = null;
    }

    _notify(actor, color) {
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
        if(this._notifyStyleId)  gsettings.disconnect(this._notifyStyleId), this._notifyStyleId = 0;
        if(this._enableSystrayId) gsettings.disconnect(this._enableSystrayId), this._enableSystrayId = 0;
        if(this._enableShortcutId) gsettings.disconnect(this._enableShortcutId), this._enableShortcutId = 0;
    }
});

function init() {
    return new ColorPicker();
}
