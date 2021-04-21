// vim:fdm=syntax
// by: tuberry@github
'use strict';

const { Gtk, Gdk, GObject, Gio } = imports.gi;
const _GTK = imports.gettext.domain('gtk40').gettext;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Uuid = Me.metadata.uuid.replace(/[^a-zA-Z]/g, '_');

var FileButton = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_FileButton'.format(Uuid),
    Properties: {
        'file': GObject.ParamSpec.string('file', 'file', 'file', GObject.ParamFlags.READWRITE, ''),
    },
    Signals: {
        'changed': { param_types: [GObject.TYPE_STRING] },
    },
}, class FileButton extends Gtk.Button {
    _init(params) {
        super._init(); // no 'always-show-image'
        this._icon = new Gtk.Image({ icon_name:  'document-open-symbolic' });
        this._label = new Gtk.Label({ label: _GTK('(None)') });
        this.set_child(new Box().appends([this._icon, this._label]));

        this._buildChooser(params);
    }

    _buildChooser(params) {
        this.chooser = new Gtk.FileChooserNative({
            modal: Gtk.DialogFlags.MODAL,
            title: params?.title ?? _GTK('File'),
            action: params?.action ?? Gtk.FileChooserAction.OPEN,
            accept_label: _GTK('_Select'),
        });
        this.chooser.connect('response', (widget, response) => {
            if(response !== Gtk.ResponseType.ACCEPT) return;
            this.file = widget.get_file().get_path();
            this.emit('changed', this.file);
        });
        if(!params?.filter) return;
        let filter = new Gtk.FileFilter();
        let ft = params.filter;
        ft.includes('/') ? filter.add_mime_type(ft) : filter.add_pattern(ft);
        this.chooser.add_filter(filter);
    }

    vfunc_clicked() {
        this.chooser.set_transient_for(this.get_root());
        this.chooser.show();
    }

    get file() {
        return this?._file ?? '';
    }

    set file(path) {
        let file;
        if(path) file = Gio.File.new_for_path(path);
        if(!file || !file.query_exists(null)) return;
        let info = file.query_info('standard::icon,standard::display-name', Gio.FileQueryInfoFlags.NONE, null);
        this._icon.set_from_gicon(info.get_icon());
        this._label.set_label(info.get_display_name());
        if(!this.file) this.chooser.set_file(file);
        this._file = path;
        this.notify('file');
    }
});

var ColourButton = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_ColourButton'.format(Uuid),
    Properties: {
        'colour': GObject.ParamSpec.string('colour', 'colour', 'colour', GObject.ParamFlags.READWRITE, ''),
    },
}, class ColourButton extends Gtk.ColorButton {
    _init(params) {
        super._init(params);
        this.connect('notify::color', () => { this.notify('colour'); });
    }

    get colour() {
        return this.get_rgba().to_string();
    }

    set colour(value) {
        let color = new Gdk.RGBA();
        if(color.parse(value)) this.set_rgba(color);
    }
});

var Shortcut = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Shortcut'.format(Uuid),
    Properties: {
        'shortcut': GObject.ParamSpec.jsobject('shortcut', 'shortcut', 'shortcut', GObject.ParamFlags.READWRITE, []),
    },
    Signals: {
        'changed': { param_types: [GObject.TYPE_STRING] },
    },
}, class Shortcut extends Gtk.Box {
    _init(shortcut) {
        super._init();
        let model = new Gtk.ListStore();
        model.set_column_types([GObject.TYPE_STRING]);
        let [ok, key, mods] = Gtk.accelerator_parse(shortcut[0]);
        model.set(model.insert(0), [0], [Gtk.accelerator_get_label(key, mods)]);
        let tree = new Gtk.TreeView({ model: model, headers_visible: false });
        let acc = new Gtk.CellRendererAccel({ editable: true, accel_mode: Gtk.CellRendererAccelMode.GTK });
        let column = new Gtk.TreeViewColumn();
        column.pack_start(acc, false);
        column.add_attribute(acc, 'text', 0);
        tree.append_column(column);
        acc.connect('accel-edited', (acce, iter, key, mods) => {
            if(!key) return;
            let name = Gtk.accelerator_name(key, mods);
            let [, iterator] = model.get_iter_from_string(iter);
            model.set(iterator, [0], [Gtk.accelerator_get_label(key, mods)]);
            this.shortcut = [name];
            this.emit('changed', name);
        });
        this.append(tree);
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
        this.attach(new Box().appends([x, y, z]), 0, this._count++, 2, 1);
        if(!(x instanceof Gtk.CheckButton)) return;
        if(y) x.bind_property('active', y, 'sensitive', GObject.BindingFlags.GET), y.set_sensitive(x.active);
        if(z) x.bind_property('active', z, 'sensitive', GObject.BindingFlags.GET), z.set_sensitive(x.active);
    }

    _att(x, y, z) {
        let r = this._count++;
        if(z) {
            this.attach(x, 0, r, 1, 1);
            this.attach(new Box().appends([y, z]), 1, r, 1, 1);
        } else if(y) {
            this.attach(x, 0, r, 1, 1);
            this.attach(y, 1, r, 1, 1);
        } else {
            this.attach(x, 0, r, 2, 1)
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
            placeholder_text: x,
            secondary_icon_sensitive: true,
            secondary_icon_activatable: true,
            secondary_icon_tooltip_text: y || '',
            secondary_icon_name: 'document-edit-symbolic',
        });

        this.connect('icon-press', () => { this.set_edit(!this.get_editable()); });
    }

    set_edit(edit) {
        this.set_editable(edit);
        this.secondary_icon_name = edit ? 'document-edit-symbolic' : 'action-unavailable-symbolic';
    }

    _set_edit() {
        this.set_edit(!this.get_text());
    }

    _set_text(text) {
        this.set_text(text);
        this.set_edit(!text);
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
            margin_end: 60,
            margin_top: 30,
            margin_start: 60,
            margin_bottom: 30,
        });

        this.set_child(widget);
        if(!label) return;
        this.set_label_widget(new Gtk.Label({ use_markup: true, label: '<b><big>' + label + '</big></b>', }));
    }
});

var Box = GObject.registerClass({
    GTypeName: 'Gjs_%s_UI_Box'.format(Uuid),
}, class Box extends Gtk.Box {
    _init(params) {
        super._init();
        if(params?.margins) this.set_margins(params.margins);
        if(params?.spacing) this.set_spacing(params.spacing);
        if(params?.vertical) this.set_orientation(Gtk.Orientation.VERTICAL);
    }

    set_margins(margins) {
        let set_mgns = mgns => {
            this.set_margin_top(mgns[0]);
            this.set_margin_end(mgns[1]);
            this.set_margin_bottom(mgns[2]);
            this.set_margin_start(mgns[3]);
        };
        switch(margins.length) {
        case 4: set_mgns(margins); break;
        case 3: set_mgns(margins.concat(margins[1])); break;
        case 2: set_mgns(margins.concat(margins)); break;
        case 1: set_mgns(Array(4).fill(margins[0])); break;
        }
    }

    appends(widgets) {
        widgets.forEach(w => { if(w) this.append(w); });
        return this;
    }

    appendS(widgets) {
        widgets.forEach((w, i, arr) => {
            if(!w) return;
            this.append(w);
            if(!Object.is(arr.length - 1, i)) this.append(new Gtk.Separator());
        });
        return this;
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
