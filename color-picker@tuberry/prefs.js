// vim:fdm=syntax
// by:tuberry@github
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const gsettings = ExtensionUtils.getSettings();

var Fields = {
    MENUSIZE:        'menu-size',
    MENUSTYLE:       'menu-style',
    NOTIFYSTYLE:     'notify-style',
    COLORHISTORY:    'color-history',
    ENABLENOTIFY:    'enable-notify',
    PICKSHORTCUT:    'pick-shortcut',
    ENABLEPREVIEW:   'enable-preview',
    ENABLESYSTRAY:   'enable-systray',
    ENABLESHORTCUT:  'enable-shortcut',
    PERSISTENTMODE:  'persistent-mode',
    COLORCOLLECTION: 'color-collection',
};

function buildPrefsWidget() {
    return new ColorPickerPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

const ColorPickerPrefs = GObject.registerClass(
class ColorPickerPrefs extends Gtk.Grid {
    _init() {
        super._init({
            margin: 20,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this._syncStatus();
        this.show_all();
    }

    _bulidWidget() {
        this._field_enable_notify   = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.ENABLENOTIFY) });
        this._field_enable_preview  = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.ENABLEPREVIEW) });
        this._field_enable_systray  = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.ENABLESYSTRAY) });
        this._field_enable_shortcut = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.ENABLESHORTCUT) });
        this._field_persistent_mode = new Gtk.CheckButton({ active: gsettings.get_boolean(Fields.PERSISTENTMODE) });

        this._field_menu_size    = this._spinMaker(5, 12, 1);
        this._field_shortcut     = this._shortCutMaker(Fields.PICKSHORTCUT);
        this._field_notify_style = this._comboMaker([_('MSG'), _('OSD')]);
    }

    _bulidUI() {
        this._row = 0;
        this._add(this._field_enable_preview,  _('Enable preview (middle click to open menu)'));
        this._add(this._field_persistent_mode, _('Persistent mode (right click to exit)'));
        this._add(this._field_enable_shortcut, _('Shortcut to pick (arrow keys to move by pixel)'),  this._field_shortcut);
        this._add(this._field_enable_systray,  _('Enable systray (right click to open menu)'), this._field_menu_size);
        this._add(this._field_enable_notify,   _('Notification style'), this._field_notify_style);
    }

    _syncStatus() {
        this._field_enable_shortcut.connect('notify::active', widget => {
            this._field_shortcut.set_sensitive(widget.active);
        });
        this._field_enable_notify.connect('notify::active', widget => {
            this._field_notify_style.set_sensitive(widget.active);
        });
        this._field_enable_systray.connect('notify::active', widget => {
            this._field_menu_size.set_sensitive(widget.active);
        });

        this._field_shortcut.set_sensitive(this._field_enable_shortcut.active);
        this._field_menu_size.set_sensitive(this._field_enable_systray.active);
        this._field_notify_style.set_sensitive(this._field_enable_notify.active);
    }

    _bindValues() {
        gsettings.bind(Fields.ENABLENOTIFY,   this._field_enable_notify,   'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESHORTCUT, this._field_enable_shortcut, 'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESYSTRAY,  this._field_enable_systray,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLEPREVIEW,  this._field_enable_preview,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.NOTIFYSTYLE,    this._field_notify_style,    'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.MENUSIZE,       this._field_menu_size,       'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.PERSISTENTMODE, this._field_persistent_mode, 'active', Gio.SettingsBindFlags.DEFAULT);
    }

    _add(x, y, z) {
        const hbox = new Gtk.Box();
        if(x) hbox.pack_start(x, false, false, 4);
        if(y) hbox.pack_start(this._labelMaker(y), true, true, 4);
        if(z) hbox.pack_start(z, false, false, 4);
        this.attach(hbox, 0, this._row++, 1, 1);
    }

    _labelMaker(x) {
        return new Gtk.Label({
            label: x,
            hexpand: true,
            halign: Gtk.Align.START,
        });
    }

    _comboMaker(ops) {
        let l = new Gtk.ListStore();
        l.set_column_types([GObject.TYPE_STRING]);
        ops.map(name => ({name})).forEach((p,i) => l.set(l.append(),[0],[p.name]));
        let c = new Gtk.ComboBox({model: l});
        let r = new Gtk.CellRendererText();
        c.pack_start(r, false);
        c.add_attribute(r, "text", 0);
        return c;
    }

    _spinMaker(l, u, s) {
        return new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: l,
                upper: u,
                step_increment: s,
            }),
        });
    }

    _shortCutMaker(hotkey) {
        let model = new Gtk.ListStore();
        model.set_column_types([GObject.TYPE_INT, GObject.TYPE_INT]);

        const row = model.insert(0);
        let [key, mods] = Gtk.accelerator_parse(gsettings.get_strv(hotkey)[0]);
        model.set(row, [0, 1], [mods, key]);

        let treeView = new Gtk.TreeView({model: model});
        treeView.set_headers_visible(false)
        let accelerator = new Gtk.CellRendererAccel({
            'editable': true,
            'accel-mode': Gtk.CellRendererAccelMode.GTK
        });

        accelerator.connect('accel-edited', (r, iter, key, mods) => {
            let value = Gtk.accelerator_name(key, mods);
            let [succ, iterator] = model.get_iter_from_string(iter);
            model.set(iterator, [0, 1], [mods, key]);
            if (key != 0) {
                gsettings.set_strv(hotkey, [value]);
            }
        });

        let column = new Gtk.TreeViewColumn({});
        column.pack_start(accelerator, false);
        column.add_attribute(accelerator, 'accel-mods', 0);
        column.add_attribute(accelerator, 'accel-key', 1);
        treeView.append_column(column);

        return treeView;
    }
});

