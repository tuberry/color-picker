// vim:fdm=syntax
// by:tuberry@github
//
const { Gio, Gtk, GObject } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const UI = Me.imports.ui;
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

        this._bulidUI();
        this._bindValues();
        this.show_all();
    }

    _bulidUI() {
        this._field_menu_size       = new UI.Spin(1, 16, 1);
        this._field_notify_style    = new UI.Combo([_('MSG'), _('OSD')]);
        this._field_enable_notify   = new UI.Check(_('Notification style'));
        this._field_shortcut        = this._shortcutMaker(Fields.PICKSHORTCUT);
        this._field_enable_systray  = new UI.Check(_('Enable systray'), _('right click to open menu'));
        this._field_enable_shortcut = new UI.Check(_('Shortcut to pick'), _('arrow keys to move by pixel'));
        this._field_persistent_mode = new UI.Check(_('Persistent mode'), _('right click or Escape key to exit'));
        this._field_enable_preview  = new UI.Check(_('Enable preview'), _('middle click or MENU key to open menu'));
        this._field_systray_icon    = new UI.FileButton(gsettings.get_string(Fields.SYSTRAYICON), { filter: 'image/svg+xml' });

        let grid = new UI.ListGrid();
        grid._add(this._field_enable_preview);
        grid._add(this._field_persistent_mode);
        grid._add(this._field_enable_shortcut, this._field_shortcut);
        grid._add(this._field_enable_notify,   this._field_notify_style);
        grid._add(this._field_enable_systray,  this._field_systray_icon, this._field_menu_size);

        this.add(new UI.Frame(grid));
    }

    _bindValues() {
        gsettings.bind(Fields.ENABLENOTIFY,   this._field_enable_notify,   'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESHORTCUT, this._field_enable_shortcut, 'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLESYSTRAY,  this._field_enable_systray,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.ENABLEPREVIEW,  this._field_enable_preview,  'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.NOTIFYSTYLE,    this._field_notify_style,    'active', Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.MENUSIZE,       this._field_menu_size,       'value',  Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.SYSTRAYICON,    this._field_systray_icon,    'file',   Gio.SettingsBindFlags.DEFAULT);
        gsettings.bind(Fields.PERSISTENTMODE, this._field_persistent_mode, 'active', Gio.SettingsBindFlags.DEFAULT);

        this._field_shortcut.set_sensitive(this._field_enable_shortcut.active);
        this._field_menu_size.set_sensitive(this._field_enable_systray.active);
        this._field_notify_style.set_sensitive(this._field_enable_notify.active);
        this._field_systray_icon.set_sensitive(this._field_enable_systray.active);

        this._field_enable_shortcut.bind_property('active', this._field_shortcut,     'sensitive', GObject.BindingFlags.GET);
        this._field_enable_notify.bind_property('active',   this._field_notify_style, 'sensitive', GObject.BindingFlags.GET);
        this._field_enable_systray.bind_property('active',  this._field_menu_size,    'sensitive', GObject.BindingFlags.GET);
        this._field_enable_systray.bind_property('active',  this._field_systray_icon, 'sensitive', GObject.BindingFlags.GET);
    }

    _shortcutMaker(shortcut) {
        let model = new Gtk.ListStore();
        model.set_column_types([GObject.TYPE_INT, GObject.TYPE_INT]);
        let [key, mods] = Gtk.accelerator_parse(gsettings.get_strv(shortcut)[0]);
        model.set(model.insert(0), [0, 1], [mods, key]);
        let tree = new Gtk.TreeView({ model: model, headers_visible: false });
        let acc = new Gtk.CellRendererAccel({ editable: true, 'accel-mode': Gtk.CellRendererAccelMode.GTK });
        let column = new Gtk.TreeViewColumn();
        column.pack_start(acc, false);
        column.add_attribute(acc, 'accel-mods', 0);
        column.add_attribute(acc, 'accel-key', 1);
        tree.append_column(column);

        acc.connect('accel-edited', (row, iter, key, mods) => {
            let value = Gtk.accelerator_name(key, mods);
            let [ok, iterator] = model.get_iter_from_string(iter);
            model.set(iterator, [0, 1], [mods, key]);
            if(key) gsettings.set_strv(shortcut, [value]);
        });

        return tree;
    }
});

