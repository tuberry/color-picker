// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GObject, Gdk, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const gsettings = ExtensionUtils.getSettings();
const Fields = Me.imports.fields.Fields;
const UI = Me.imports.ui;

function buildPrefsWidget() {
    return new ColorPickerPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

class IconBtn extends UI.File {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({ filter: 'image/svg+xml' });
    }

    set_icon(icon) {
        this.file = icon;
    }

    get file() {
        return this._file ?? '';
    }

    _checkIcon(path) {
        let name = GLib.basename(path).replace('.svg', '');
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).has_icon(name) ? name : '';
    }

    set file(path) {
        let file = Gio.File.new_for_path(path);
        file.query_info_async(Gio.FILE_ATTRIBUTE_STANDARD_NAME,
            Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (src, res) => {
                let prev = this._file;
                try {
                    let info = src.query_info_finish(res);
                    this._setLabel(info.get_name().replace(RegExp(/(-symbolic)*.svg$/), ''));
                    let icon = this._checkIcon(path);
                    icon ? this._icon.set_from_icon_name(icon) : this._icon.set_from_gicon(Gio.Icon.new_for_string(path));
                    if(!this.file) this.chooser.set_file(file);
                    this._file = path;
                    this._icon.show();
                } catch(e) {
                    this._icon.hide();
                    this._setLabel(null);
                    this._file = null;
                } finally {
                    if(prev !== undefined && prev !== this.file) {
                        this.notify('file');
                        this.emit('changed', this.file);
                    }
                }
            });
    }
}

class ColorPickerPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this._buildWidgets();
        this._bindValues();
        this._buildUI();
    }

    _buildWidgets() {
        this._field_systray_icon    = new IconBtn();
        this._field_auto_copy       = new Gtk.CheckButton();
        this._field_enable_preview  = new Gtk.CheckButton();
        this._field_enable_shortcut = new Gtk.CheckButton();
        this._field_persistent_mode = new Gtk.CheckButton();
        this._field_enable_notify   = new Gtk.CheckButton();
        this._field_enable_systray  = new Gtk.CheckButton();
        this._field_notify_style    = new UI.Drop(_('MSG'), _('OSD'));
        this._field_menu_size       = new UI.Spin(1, 16, 1, _('history size'));
        this._field_shortcut        = new UI.Short(gsettings, Fields.PICKSHORTCUT);
    }

    _buildUI() {
        [
            [this._field_enable_preview, [_('Enable preview'), _('middle click or MENU key to open menu')]],
            [this._field_persistent_mode, [_('Persistent mode'), _('right click or Escape key to exit')]],
            [this._field_auto_copy, [_('Automatically copy'), _('copy the color to clipboard after picking')]],
            [this._field_enable_shortcut, [_('Shortcut to pick'), _('arrow keys to move by pixel')], this._field_shortcut],
            [this._field_enable_notify, [_('Notification style')],  this._field_notify_style],
            [this._field_enable_systray, [_('Enable systray'), _('right click to open menu')], this._field_systray_icon, this._field_menu_size],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }

    _bindValues() {
        [
            [Fields.ENABLENOTIFY,   this._field_enable_notify,   'active'],
            [Fields.ENABLESHORTCUT, this._field_enable_shortcut, 'active'],
            [Fields.ENABLESYSTRAY,  this._field_enable_systray,  'active'],
            [Fields.ENABLEPREVIEW,  this._field_enable_preview,  'active'],
            [Fields.NOTIFYSTYLE,    this._field_notify_style,    'selected'],
            [Fields.AUTOCOPY,       this._field_auto_copy,       'active'],
            [Fields.MENUSIZE,       this._field_menu_size,       'value'],
            [Fields.SYSTRAYICON,    this._field_systray_icon,    'file'],
            [Fields.PERSISTENTMODE, this._field_persistent_mode, 'active'],
        ].forEach(xs => gsettings.bind(...xs, Gio.SettingsBindFlags.DEFAULT));
    }
}

