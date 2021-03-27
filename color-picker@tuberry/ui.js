// vim:fdm=syntax
// by: tuberry@github
'use strict';

const { Pango, GLib, Gtk, Gdk, GObject, Gio } = imports.gi;
const _GTK = imports.gettext.domain('gtk30').gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Uuid = Me.metadata.uuid.replace(/[^a-zA-Z]/g, '_');

var FileButton = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Fileutton'.format(Uuid),
    Properties: {
        'file': GObject.param_spec_string('file', 'file', 'file', '', GObject.ParamFlags.READWRITE),
    },
    Signals: {
        'changed': { param_types: [GObject.TYPE_STRING] },
    },
}, class FileButton extends Gtk.Button {
    _init(path, params) {
        super._init({
            label: _GTK('(None)'),
            always_show_image: true,
            image: new Gtk.Image({ icon_name: 'document-open-symbolic' }),
        });
        this.set_file(path);
        this.params = params;

        this.chooser = new Gtk.FileChooserNative({
            modal: Gtk.DialogFlags.MODAL,
            title: this.params?.title ?? _GTK('File'),
            action: this.params?.action ?? Gtk.FileChooserAction.OPEN,
            accept_label: _GTK('_Select'),
        });
        this.chooser.connect('response', (widget, response) => {
            if(response !== Gtk.ResponseType.ACCEPT) return;
            this.set_file(widget.get_file().get_path());
            this.emit('changed', this.file);
        });
        let [ok, file] = this.check_file();
        if(ok) this.chooser.set_file(file);
        if(this.params?.filter) this.chooser.add_filter(this.get_filter());
    }

    vfunc_clicked() {
        this.chooser.set_transient_for(this.get_toplevel());
        this.chooser.show();
    }

    check_file() {
        if(!this.file) return [false, null];
        let file = Gio.File.new_for_path(this.file);
        return [file.query_exists(null), file];
    }

    get_filter() {
        let filter = new Gtk.FileFilter();
        let ft = this.params.filter;
        ft.includes('/') ? filter.add_mime_type(ft) : filter.add_pattern(ft);
        return filter;
    }

    set_file(path) {
        let file;
        if(path) file = Gio.File.new_for_path(path);
        if(!file || !file.query_exists(null)) return;
        let info = file.query_info('standard::icon,standard::display-name', Gio.FileQueryInfoFlags.NONE, null);
        this.set_image(Gtk.Image.new_from_gicon(info.get_icon(), Gtk.IconSize.BUTTON));
        this.set_label(info.get_display_name());
        this.file = path;
    }
});

var ColorButton = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_ColorButton'.format(Uuid),
    Properties: {
        'colour': GObject.param_spec_string('colour', 'colour', 'colour', '', GObject.ParamFlags.READWRITE),
    },
}, class ColorButton extends Gtk.ColorButton {
    _init(colour, params) {
        super._init(params);
        this.connect('notify::color', widget => { this.colour = this.get_colour(); });
        this.set_colour(colour);
    }

    get_colour() {
        return this.get_rgba().to_string();
    }

    set_colour(value) {
        let color = new Gdk.RGBA();
        if(color.parse(value)) this.set_rgba(color);
    }
});

var ListGrid = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_ListGrid'.format(Uuid),
} ,class ListGrid extends Gtk.Grid {
    _init() {
        super._init({
            hexpand: true,
            margin_end: 10,
            margin_top: 10,
            margin_start: 10,
            margin_bottom: 10,
            column_spacing: 18,
            row_spacing: 12,
        });
        this._count = 0;
    }

    _add(x, y, z) {
        let hbox = new Gtk.Box();
        hbox.pack_start(x, true, true, 0);
        if(y) hbox.pack_start(y, false, false, 0)
        if(z) hbox.pack_start(z, false, false, 0);
        this.attach(hbox, 0, this._count++, 2, 1);
    }

    _att(x, y, z) {
        let r = this._count++;
        if(z) {
            let hbox = new Gtk.Box();
            hbox.pack_start(y, true, true, 0);
            hbox.pack_end(z, false, false, 0);
            this.attach(x, 0, r, 1, 1);
            this.attach(hbox, 1, r, 1, 1);
        } else if(y) {
            this.attach(x, 0, r, 1, 1);
            this.attach(y, 1, r, 1, 1);
        } else {
            this.attach(x, 0, r, 1, 2)
        }
    }
});

var Spin = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Spin'.format(Uuid),
}, class Spin extends Gtk.SpinButton {
    _init(l, u, s, params) {
        super._init(params);
        this.set_adjustment(new Gtk.Adjustment({
            lower: l,
            upper: u,
            step_increment: s,
        }));
    }
});

var Label = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Label'.format(Uuid),
}, class Label extends Gtk.Label {
    _init(x, y, params) {
        super._init(params);
        this.set_label(x);
        this.set_halign(Gtk.Align.START);
        this.set_hexpand(y ? false : true);
    }
});

var Entry = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Entry'.format(Uuid),
}, class Entry extends Gtk.Entry {
    _init(x, y, z) {
        super._init({
            hexpand: !z,
            editable: false,
            placeholder_text: x,
            secondary_icon_sensitive: true,
            secondary_icon_activatable: true,
            secondary_icon_tooltip_text: y || '',
            secondary_icon_name: 'action-unavailable',
        });
        this.connect('icon-press', () => { this.set_edit(!this.get_editable()); });
    }

    set_edit(edit) {
        if(edit) {
            this.set_editable(true);
            this.secondary_icon_name = 'document-edit-symbolic';
        } else {
            this.set_editable(false);
            this.secondary_icon_name = 'action-unavailable'
        }
    }
});

var Combo = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Combo'.format(Uuid),
}, class Combo extends Gtk.ComboBox {
    _init(ops, tip, params) {
        let l = new Gtk.ListStore();
        l.set_column_types([GObject.TYPE_STRING]);
        ops.forEach(op => l.set(l.append(), [0], [op]));
        let c = new Gtk.ComboBox({  });
        super._init({ model: l, tooltip_text: tip || '' });
        let r = new Gtk.CellRendererText();
        this.pack_start(r, false);
        this.add_attribute(r, 'text', 0);
    }
});

var Frame = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Frame'.format(Uuid),
}, class Frame extends Gtk.Frame {
    _init(widget, label) {
        super._init({
            margin_end: 30,
            margin_top: 30,
            margin_start: 30,
            margin_bottom: 30,
        });

        this.add(widget);
        if(!label) return;
        this.set_label_widget(new Gtk.Label({
            use_markup: true,
            label: '<b><big>' + label + '</big></b>',
        }));
    }
});

var Box = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Box'.format(Uuid),
}, class Box extends Gtk.Box {
    _init(vertical, margin) {
        super._init({
            margin_end: margin,
            margin_top: margin,
            margin_start: margin,
            margin_bottom: margin,
            orientation: vertical ? Gtk.Orientation.VERTICAL : Gtk.Orientation.HORIZONTAL,
        });
    }
});

var Check = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Check'.format(Uuid),
}, class Check extends Gtk.CheckButton {
    _init(x, y) {
        super._init({
            label: x,
            hexpand: true,
            halign: Gtk.Align.START,
            tooltip_text: y ? y : '',
        });
    }
});

