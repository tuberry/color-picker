// vim:fdm=syntax
// by:tuberry@github
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const gsettings = ExtensionUtils.getSettings();

var Fields = {
    MENUSIZE:       'menu-size',
    MENUSTYLE:      'menu-style',
    NOTIFYSTYLE:    'notify-style',
    ENABLENOTIFY:   'enable-notify',
    COLORSHISTORY:  'colors-history',
    ENABLEPREVIEW:  'enable-preview',
    ENABLESYSTRAY:  'enable-systray',
    ENABLESHORTCUT: 'enable-shortcut',
    PERSISTENTMODE: 'persistent-mode',
    COLORSCOLLECT:  'colors-collection',
    SYSTRAYICON:    'systray-dropper-icon',
    PICKSHORTCUT:   'color-picker-shortcut',
};

function buildPrefsWidget() {
    return new ColorPickerPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

const ColorPickerPrefs = GObject.registerClass(
class ColorPickerPrefs extends Gtk.ScrolledWindow {
    _init() {
        super._init({
            hscrollbar_policy: Gtk.PolicyType.NEVER,
        });

        this._bulidWidget();
        this._bulidUI();
        this._bindValues();
        this._syncStatus();
        this.show_all();
    }

    _bulidWidget() {
        this._field_enable_notify   = this._checkMaker(_('Notification style'));
        this._field_persistent_mode = this._checkMaker(_('Persistent mode (right click to exit)'));
        this._field_systray_icon    = this._fileChooser(_('Choose a symbolic icon'), 'image/svg+xml');
        this._field_enable_systray  = this._checkMaker(_('Enable systray (right click to open menu)'));
        this._field_enable_preview  = this._checkMaker(_('Enable preview (middle click to open menu)'));
        this._field_enable_shortcut = this._checkMaker(_('Shortcut to pick (arrow keys to move by pixel)'));


        this._field_menu_size    = this._spinMaker(1, 16, 1);
        this._field_shortcut     = this._shortCutMaker(Fields.PICKSHORTCUT);
        this._field_notify_style = this._comboMaker([_('MSG'), _('OSD')]);
    }

    _bulidUI() {
        this._box = new Gtk.Box({
            margin: 30,
            orientation: Gtk.Orientation.VERTICAL,
        });
        this.add(this._box);

        let frame = this._listFrameMaker();
        frame._add(this._field_enable_preview);
        frame._add(this._field_persistent_mode);
        frame._add(this._field_enable_shortcut,  this._field_shortcut);
        frame._add(this._field_enable_notify, this._field_notify_style);
        frame._add(this._field_enable_systray, this._field_systray_icon, this._field_menu_size);
    }

    _syncStatus() {
        this._field_systray_icon.set_filename(gsettings.get_string(Fields.SYSTRAYICON));
        this._field_systray_icon.connect('file-set', widget => {
            gsettings.set_string(Fields.SYSTRAYICON, widget.get_filename());
        });
        this._field_enable_shortcut.connect('notify::active', widget => {
            this._field_shortcut.set_sensitive(widget.active);
        });
        this._field_enable_notify.connect('notify::active', widget => {
            this._field_notify_style.set_sensitive(widget.active);
        });
        this._field_enable_systray.connect('notify::active', widget => {
            this._field_menu_size.set_sensitive(widget.active);
            this._field_systray_icon.set_sensitive(widget.active);
        });

        this._field_shortcut.set_sensitive(this._field_enable_shortcut.active);
        this._field_menu_size.set_sensitive(this._field_enable_systray.active);
        this._field_systray_icon.set_sensitive(this._field_enable_systray.active);
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

    _listFrameMaker() {
        let frame = new Gtk.Frame({
            label_yalign: 1,
        });
        this._box.add(frame);

        frame.grid = new Gtk.Grid({
            margin: 10,
            hexpand: true,
            row_spacing: 12,
            column_spacing: 18,
            row_homogeneous: false,
            column_homogeneous: false,
        });

        frame.grid._row = 0;
        frame.add(frame.grid);
        frame._add = (x, y, z) => {
            const hbox = new Gtk.Box();
            hbox.pack_start(x, true, true, 4);
            if(y) hbox.pack_start(y, false, false, 4);
            if(z) hbox.pack_start(z, false, false, 4)
            frame.grid.attach(hbox, 0, frame.grid._row++, 1, 1);
        }
        return frame;
    }

    _checkMaker(x) {
        return new Gtk.CheckButton({
            label: x,
            hexpand: true,
            halign: Gtk.Align.START,
        });
    }

    _comboMaker(ops) {
        let l = new Gtk.ListStore();
        l.set_column_types([GObject.TYPE_STRING]);
        ops.forEach(op => l.set(l.append(), [0], [op]));
        let c = new Gtk.ComboBox({ model: l });
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

    _fileChooser(title, mime) {
        let button = Gtk.FileChooserButton.new(title, Gtk.FileChooserAction.OPEN);
        if(!mime) return button;
        let filter = new Gtk.FileFilter();
        filter.add_mime_type(mime);
        button.add_filter(filter);
        return button;
    }
});

