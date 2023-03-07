// vim:fdm=syntax
// by tuberry
/* exported Block File Color Keys PrefRow Drop LazyEntry Spin */
'use strict';

const { Adw, Gtk, Gdk, GObject, Gio } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { _, _GTK, fl, genParam, fquery } = Me.imports.util;

var Block = class {
    constructor(ws) {
        this.gset = ExtensionUtils.getSettings();
        for(let [k, [x, y, z]] of Object.entries(ws)) { this[k] = z; this.gset.bind(x, z, y, Gio.SettingsBindFlags.DEFAULT); }
    }
};

var File = class extends Gtk.Box {
    static {
        GObject.registerClass({
            Properties: {
                file: genParam('string', 'file', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(params, attr) {
        super({ valign: Gtk.Align.CENTER, css_classes: ['linked'] }); // no 'always-show-image'
        let box = new Gtk.Box({ spacing: 5 });
        this._icon = new Gtk.Image({ icon_name: 'document-open-symbolic' });
        this._label = new Gtk.Label({ label: _GTK('(None)') });
        [this._icon, this._label].forEach(x => box.append(x));
        this._btn = new Gtk.Button({ child: box });
        let reset = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') });
        reset.connect('clicked', () => { this.file = ''; });
        this._btn.connect('clicked', this._onClicked.bind(this));
        [this._btn, reset].forEach(x => this.append(x));
        this._buildChooser(params);
        this._attr = attr ?? [Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON].join(',');
    }

    vfunc_mnemonic_activate() {
        this._btn.activate();
    }

    _buildChooser(params) {
        this.chooser = new Gtk.FileChooserNative({
            modal: Gtk.DialogFlags.MODAL,
            title: params?.title ?? _GTK('File'),
            action: params?.action ?? Gtk.FileChooserAction.OPEN,
        });
        this.chooser.connect('response', (widget, response) => {
            if(response !== Gtk.ResponseType.ACCEPT) return;
            this.file = widget.get_file().get_path();
            this.emit('changed', this.file);
        });
        if(!params?.filter) return;
        let filter = new Gtk.FileFilter();
        params.filter.includes('/') ? filter.add_mime_type(params.filter) : filter.add_pattern(params.filter);
        this.chooser.add_filter(filter);
    }

    _setLabel(label) {
        this._label.set_label(label || _GTK('(None)'));
    }

    _onClicked() {
        this.chooser.set_transient_for(this.get_root());
        this.chooser.show();
    }

    get file() {
        return this._file ?? '';
    }

    async _setFile(path) {
        let file = fl(path);
        let info = await fquery(file, this._attr);
        this._setLabel(info.get_display_name());
        this._icon.set_from_gicon(info.get_icon());
        if(!this.file) this.chooser.set_file(file);
        this._file = path;
    }

    _setEmpty() {
        this._setLabel(null);
        this._icon.icon_name = 'document-open-symbolic';
        this._file = '';
    }

    _emitChange(prev) {
        if(prev === undefined || prev === this.file) return;
        this.emit('changed', this.file);
        this.notify('file');
    }

    set file(path) {
        let prev = this._file;
        this._setFile(path).catch(() => this._setEmpty()).finally(() => this._emitChange(prev));
    }
};

var Color = class extends Gtk.ColorButton {
    static {
        GObject.registerClass({
            Properties: {
                colour: genParam('string', 'colour', ''),
            },
        }, this);
    }

    constructor(text, alpha) {
        super({ use_alpha: !alpha, title: text, tooltip_text: text, valign: Gtk.Align.CENTER });
        this.connect('color-set', () => this.notify('colour'));
    }

    get colour() {
        return this.get_rgba().to_string();
    }

    set colour(value) {
        let color = new Gdk.RGBA();
        if(color.parse(value)) this.set_rgba(color);
    }
};

var Keys = class extends Gtk.Button {
    static {
        GObject.registerClass({
            Properties: {
                shortcut: genParam('string', 'shortcut', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(setting, key) {
        super({ valign: Gtk.Align.CENTER, has_frame: false });
        this._key = key;
        this._setting = setting;
        let label = new Gtk.ShortcutLabel({ disabled_text: _GTK('New accelerator…') });
        this.bind_property('shortcut', label, 'accelerator', GObject.BindingFlags.DEFAULT);
        this.connect('clicked', this._onActivated.bind(this));
        [this.shortcut] = this._setting.get_strv(this._key);
        this.set_child(label);
    }

    _onActivated(widget) {
        let ctl = new Gtk.EventControllerKey();
        let content = new Adw.StatusPage({ title: _GTK('New accelerator…'), icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic' });
        this._editor = new Adw.Window({ modal: true, hide_on_close: true, transient_for: widget.get_root(), width_request: 480, height_request: 320, content });
        this._editor.add_controller(ctl);
        ctl.connect('key-pressed', this._onKeyPressed.bind(this));
        this._editor.present();
    }

    _onKeyPressed(_widget, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) { this._editor.close(); return Gdk.EVENT_STOP; }
        if(!this.isValidBinding(mask, keycode, keyval) || !this.isValidAccel(mask, keyval)) return Gdk.EVENT_STOP;
        this.shortcut = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this.emit('changed', this.shortcut);
        this._setting.set_strv(this._key, [this.shortcut]);
        this._editor.destroy();
        return Gdk.EVENT_STOP;
    }

    keyvalIsForbidden(keyval) {
        return [Gdk.KEY_Home, Gdk.KEY_Left, Gdk.KEY_Up, Gdk.KEY_Right, Gdk.KEY_Down, Gdk.KEY_Page_Up,
            Gdk.KEY_Page_Down, Gdk.KEY_End, Gdk.KEY_Tab, Gdk.KEY_KP_Enter, Gdk.KEY_Return, Gdk.KEY_Mode_switch].includes(keyval);
    }

    isValidBinding(mask, keycode, keyval) {
        // From: https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/master/panels/keyboard/keyboard-shortcuts.c
        return !(mask === 0 || mask === Gdk.SHIFT_MASK && keycode !== 0 &&
            ((keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
                (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
                (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
                (keyval >= Gdk.KEY_kana_fullstop && keyval <= Gdk.KEY_semivoicedsound) ||
                (keyval >= Gdk.KEY_Arabic_comma && keyval <= Gdk.KEY_Arabic_sukun) ||
                (keyval >= Gdk.KEY_Serbian_dje && keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
                (keyval >= Gdk.KEY_Greek_ALPHAaccent && keyval <= Gdk.KEY_Greek_omega) ||
                (keyval >= Gdk.KEY_hebrew_doublelowline && keyval <= Gdk.KEY_hebrew_taf) ||
                (keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
                (keyval >= Gdk.KEY_Hangul_Kiyeog && keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
                (keyval === Gdk.KEY_space && mask === 0) || this.keyvalIsForbidden(keyval))
        );
    }

    isValidAccel(mask, keyval) {
        return Gtk.accelerator_valid(keyval, mask) || (keyval === Gdk.KEY_Tab && mask !== 0);
    }
};

var PrefRow = class extends Adw.ActionRow {
    static {
        GObject.registerClass(this);
    }

    constructor(...args) {
        super();
        if(Array.isArray(args[0])) {
            let [title, ...suffix] = args;
            if(title.length) this.set_title(title[0]), this.set_subtitle(title[1] || '');
            if(suffix.length) suffix.forEach(x => this.add_suffix(x)), this.set_activatable_widget(suffix[0]);
        } else {
            let [prefix, title, ...suffix] = args;
            if(title.length) this.set_title(title[0]), this.set_subtitle(title[1] || '');
            this.add_prefix(prefix);
            if(prefix instanceof Gtk.CheckButton) {
                this.set_activatable_widget(prefix);
                if(suffix.length) {
                    suffix.forEach(x => {
                        this.add_suffix(x);
                        prefix.bind_property('active', x, 'sensitive', GObject.BindingFlags.DEFAULT);
                        x.set_sensitive(prefix.active);
                    });
                }
            } else if(suffix.length) {
                suffix.forEach(x => this.add_suffix(x));
                this.set_activatable_widget(suffix[0]);
            }
        }
    }
};

var Spin = class extends Gtk.SpinButton {
    static {
        GObject.registerClass(this);
    }

    constructor(l, u, s, tip) {
        super({ tooltip_text: tip || '', valign: Gtk.Align.CENTER });
        this.set_adjustment(new Gtk.Adjustment({ lower: l, upper: u, step_increment: s }));
    }
};

var Drop = class extends Gtk.DropDown {
    // NOTE: upstream issue - https://gitlab.gnome.org/GNOME/gtk/-/issues/2877
    static {
        GObject.registerClass(this);
    }

    constructor(args, tip) {
        super({ model: Gtk.StringList.new(args), valign: Gtk.Align.CENTER, tooltip_text: tip || '' });
    }
};

var LazyEntry = class extends Gtk.Stack {
    static {
        GObject.registerClass({
            Properties: {
                text: genParam('string', 'text', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(holder, tip) {
        super({ valign: Gtk.Align.CENTER, hhomogeneous: true });
        this._label = new Gtk.Entry({ hexpand: true, sensitive: false, placeholder_text: holder || '' });
        this._entry = new Gtk.Entry({ hexpand: true, enable_undo: true, placeholder_text: holder || '' });
        this._edit = new Gtk.Button({ icon_name: 'document-edit-symbolic', tooltip_text: tip || '' });
        this._done = new Gtk.Button({ icon_name: 'object-select-symbolic', tooltip_text: _('Click or press ENTER to commit changes'), css_classes: ['suggested-action'] });
        this.add_named(this._mkBox(this._label, this._edit), 'label');
        this.add_named(this._mkBox(this._entry, this._done), 'entry');
        this.bind_property('text', this._label, 'text', GObject.BindingFlags.BIDIRECTIONAL | GObject.BindingFlags.SYNC_CREATE);
        this._edit.connect('clicked', () => this._onEdit());
        this._done.connect('clicked', () => this._onDone());
        this._entry.connect('activate', () => this._onDone());
        this.set_visible_child_name('label');
    }

    _onEdit() {
        this._entry.set_text(this.text);
        this.set_visible_child_name('entry');
    }

    _onDone() {
        let text = this._entry.get_text();
        if(this.set_text(text)) this.emit('changed', text);
    }

    set_text(text) {
        let check = this.text !== text;
        if(check) this._label.set_text(text);
        this.set_visible_child_name('label');
        return check;
    }

    get_text() {
        return this.text;
    }

    vfunc_mnemonic_activate() {
        this.get_visible_child_name() === 'label' ? this._edit.activate() : this._done.activate();
    }

    _mkBox(...ws) {
        let box = new Gtk.Box({ css_classes: ['linked'], hexpand: true });
        ws.forEach(x => box.append(x));
        return box;
    }
};
