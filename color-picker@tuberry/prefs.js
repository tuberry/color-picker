// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GObject, Gdk, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = ExtensionUtils.gettext;
const { Fields } = Me.imports.fields;
const UI = Me.imports.ui;

const genParam = (type, name, ...dflt) => GObject.ParamSpec[type](name, name, name, GObject.ParamFlags.READWRITE, ...dflt);

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

var KeyBtn = class extends Gtk.Box {
    static {
        GObject.registerClass({
            Properties: {
                key: genParam('string', 'key', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor() {
        super({ valign: Gtk.Align.CENTER, css_classes: ['linked'] }); // no 'always-show-image'
        let label = new Gtk.ShortcutLabel({ disabled_text: _('(Key)') });
        this.bind_property('key', label, 'accelerator', GObject.BindingFlags.DEFAULT);
        this._btn = new Gtk.Button({ child: label });
        let reset = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') });
        reset.connect('clicked', () => (this.key = ''));
        this._btn.connect('clicked', this._onActivated.bind(this));
        [this._btn, reset].forEach(x => this.append(x));
    }

    _onActivated(widget) {
        let ctl = new Gtk.EventControllerKey();
        let content = new Adw.StatusPage({ title: _('Press any keys.'), icon_name: 'preferences-desktop-keyboard-symbolic' });
        this._editor = new Adw.Window({ modal: true, hide_on_close: true, transient_for: widget.get_root(), width_request: 480, height_request: 320, content });
        this._editor.add_controller(ctl);
        ctl.connect('key-pressed', this._onKeyPressed.bind(this));
        this._editor.present();
    }

    _onKeyPressed(_widget, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) { this._editor.close(); return Gdk.EVENT_STOP; }
        this.key = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this.emit('changed', this.key);
        this._editor.destroy();

        return Gdk.EVENT_STOP;
    }

    vfunc_mnemonic_activate() {
        this._btn.activate();
    }
};

class ColorPickerPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this._buildWidgets();
        this._buildUI();
    }

    _buildWidgets() {
        let gsettings = ExtensionUtils.getSettings();
        this._field_shortcut = new UI.Short(gsettings, Fields.PICKSHORTCUT);
        this._field = {
            MENUKEY:        ['key',      new KeyBtn()],
            QUITKEY:        ['key',      new KeyBtn()],
            SYSTRAYICON:    ['file',     new IconBtn()],
            AUTOCOPY:       ['active',   new Gtk.CheckButton()],
            ENABLENOTIFY:   ['active',   new Gtk.CheckButton()],
            ENABLEPREVIEW:  ['active',   new Gtk.CheckButton()],
            ENABLESHORTCUT: ['active',   new Gtk.CheckButton()],
            ENABLESYSTRAY:  ['active',   new Gtk.CheckButton()],
            PERSISTENTMODE: ['active',   new Gtk.CheckButton()],
            NOTIFYSTYLE:    ['selected', new UI.Drop([_('MSG'), _('OSD')])],
            PREVIEW:        ['selected', new UI.Drop([_('Icon'), _('Label')], _('preview style'))],
            MENUSIZE:       ['value',    new UI.Spin(1, 16, 1, _('history size'))],
        };
        Object.entries(this._field).forEach(([x, [y, z]]) => gsettings.bind(Fields[x], z, y, Gio.SettingsBindFlags.DEFAULT));
    }

    _buildUI() {
        [
            [this._field.AUTOCOPY[1],       [_('Automatically copy'), _('copy the color to clipboard after picking')]],
            [this._field.ENABLESHORTCUT[1], [_('Shortcut to pick'), _('press arrow keys / wasd / hjkl to move by pixel')], this._field_shortcut],
            [this._field.ENABLENOTIFY[1],   [_('Notification style')], this._field.NOTIFYSTYLE[1]],
            [this._field.PERSISTENTMODE[1], [_('Persistent mode'), _('right click or press Esc key to quit')], this._field.QUITKEY[1]],
            [this._field.ENABLEPREVIEW[1],  [_('Enable preview'), _('middle click or press Menu key to open menu')], this._field.PREVIEW[1], this._field.MENUKEY[1]],
            [this._field.ENABLESYSTRAY[1],  [_('Enable systray'), _('right click to open menu')], this._field.SYSTRAYICON[1], this._field.MENUSIZE[1]],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}
