// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Gio, Gtk, GObject } = imports.gi;

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

const ColorPickerPrefs = GObject.registerClass(
class ColorPickerPrefs extends Gtk.ScrolledWindow {
    _init() {
        super._init({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        this._buildWidgets();
        this._bindValues();
        this._buildUI();
    }

    _buildWidgets() {
        this._field_notify_style    = new UI.Combo([_('MSG'), _('OSD')]);
        this._field_enable_notify   = new UI.Check(_('Notification style'));
        this._field_systray_icon    = new UI.FileButton({ filter: 'image/svg+xml' });
        this._field_shortcut        = new UI.Shortcut(gsettings.get_strv(Fields.PICKSHORTCUT));
        this._field_menu_size       = new UI.Spin(1, 16, 1, { tooltip_text: _('history size') });
        this._field_enable_systray  = new UI.Check(_('Enable systray'), _('right click to open menu'));
        this._field_enable_shortcut = new UI.Check(_('Shortcut to pick'), _('arrow keys to move by pixel'));
        this._field_persistent_mode = new UI.Check(_('Persistent mode'), _('right click or Escape key to exit'));
        this._field_enable_preview  = new UI.Check(_('Enable preview'), _('middle click or MENU key to open menu'));
        this._field_auto_copy       = new UI.Check(_('Automatically copy'), _('copy the color to clipboard after picking'));
    }

    _buildUI() {
        let grid = new UI.ListGrid();
        grid._add(this._field_enable_preview);
        grid._add(this._field_persistent_mode);
        grid._add(this._field_auto_copy);
        grid._add(this._field_enable_shortcut, this._field_shortcut);
        grid._add(this._field_enable_notify,   this._field_notify_style);
        grid._add(this._field_enable_systray,  this._field_systray_icon, this._field_menu_size);
        this.set_child(new UI.Frame(grid));
    }

    _bindValues() {
        gsettings.bind(Fields.ENABLENOTIFY,   this._field_enable_notify,   'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESHORTCUT, this._field_enable_shortcut, 'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESYSTRAY,  this._field_enable_systray,  'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLEPREVIEW,  this._field_enable_preview,  'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.NOTIFYSTYLE,    this._field_notify_style,    'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.AUTOCOPY,       this._field_auto_copy,       'active',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.MENUSIZE,       this._field_menu_size,       'value',    Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SYSTRAYICON,    this._field_systray_icon,    'file',     Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.PERSISTENTMODE, this._field_persistent_mode, 'active',   Gio.SettingsBindFlags.DEFAULT);
        this._field_shortcut.connect('changed', (widget, keys) => { gsettings.set_strv(Fields.PICKSHORTCUT, [keys]); });
    }
});

