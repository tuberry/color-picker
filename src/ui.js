// vim:fdm=syntax
// by tuberry
/* exported Block Box DlgBtnBase File Keys PrefRow
   Drop LazyEntry Spin AppDialog App Font Color Icon
   grgba block conns
 */
'use strict';

const { Adw, Gtk, Gdk, GObject, Gio, Pango, GLib } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { _, _GTK, fl, omap, noop, gparam, fquery } = Me.imports.util;
const { Field } = Me.imports.const;

var grgba = x => (c => [c.parse(x ?? ''), c])(new Gdk.RGBA());
var conns = (a, ...o) => o.forEach(([k, v]) => a.connect(k, v));
var block = (o, s = ExtensionUtils.getSettings()) => omap(o, ([k, [x, y]]) => [[k, (s.bind(Field[k], y, x, Gio.SettingsBindFlags.DEFAULT), y)]]);

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

var Box = class extends Gtk.Box {
    static {
        GObject.registerClass(this);
    }

    constructor(children, params) {
        super(Object.assign({ valign: Gtk.Align.CENTER }, params));
        children?.forEach(x => this.append(x));
        this.add_css_class('linked');
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
    static {
        GObject.registerClass(this);
    }

    constructor(args, tip) {
        super({ model: Gtk.StringList.new(args), valign: Gtk.Align.CENTER, tooltip_text: tip || '' });
    }
};

var Font = class extends Gtk.FontDialogButton {
    static {
        GObject.registerClass({
            Properties: {
                value: gparam('string', 'value', ''),
            },
        }, this);
    }

    constructor(params) {
        super(Object.assign({ valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog() }, params));
        this.connect('notify::font-desc', () => this.notify('value'));
    }

    get value() {
        return this.get_font_desc().to_string();
    }

    set value(value) {
        this.set_font_desc(Pango.FontDescription.from_string(value));
    }
};

var Color = class extends Gtk.ColorDialogButton {
    static {
        GObject.registerClass({
            Properties: {
                value: gparam('string', 'value', ''),
            },
        }, this);
    }

    constructor(params) {
        super({ tooltip_text: params?.title ?? '', valign: Gtk.Align.CENTER, dialog: new Gtk.ColorDialog(params) });
        this.connect('notify::rgba', () => this.notify('value'));
    }

    get value() {
        return this.get_rgba().to_string();
    }

    set value(value) {
        let [ok, rgba] = grgba(value);
        if(ok) this.set_rgba(rgba);
    }
};

var IconLabel = class extends Gtk.Box {
    static {
        GObject.registerClass(this);
    }

    constructor(fallback_icon) {
        super({ spacing: 5 });
        this._icon = new Gtk.Image();
        this._label = new Gtk.Label();
        this._fallback_icon = fallback_icon;
        [this._icon, this._label].forEach(x => this.append(x));
    }

    set_info(icon, text) {
        this._label.set_label(text || _GTK('(None)'));
        if(typeof icon !== 'string') this._icon.set_from_gicon(icon);
        else this._icon.icon_name = icon || this._fallback_icon;
    }
};

var AppDialog = class extends Adw.Window {
    static {
        GObject.registerClass({
            Signals: {
                selected: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(params) {
        super({ title: _GTK('Select Application'), modal: true, hide_on_close: true, width_request: 280, height_request: 320 });
        this._buildContent(params);
    }

    _buildList(params) {
        let factory = new Gtk.SignalListItemFactory();
        conns(factory, ['setup', (_f, x) => { x.set_child(new IconLabel('application-x-executable-symbolic')); }],
            ['bind', (_f, x) => x.get_child().set_info(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item()))]);
        let model = new Gio.ListStore({ item_type: Gio.DesktopAppInfo });
        if(params?.no_display) Gio.AppInfo.get_all().forEach(x => model.append(x));
        else Gio.AppInfo.get_all().filter(x => x.should_show()).forEach(x => model.append(x));
        this._filter = new Gtk.StringFilter({ expression: new Gtk.PropertyExpression(Gio.DesktopAppInfo, null, 'filename') }); // TODO: `get_id()` instead of filename
        this._select = new Gtk.SingleSelection({ model: new Gtk.FilterListModel({ model, filter: this._filter }) });
        let list = new Gtk.ListView({ model: this._select, factory, single_click_activate: false, vexpand: true });
        list.connect('activate', () => this._onSelect());
        return new Gtk.ScrolledWindow({ child: list });
    }

    _buildContent(params) {
        let eck = new Gtk.EventControllerKey(),
            close = Gtk.Button.new_with_mnemonic(_GTK('_Close')),
            select = Gtk.Button.new_with_mnemonic(_GTK('_Select')),
            entry = new Gtk.SearchEntry({ halign: Gtk.Align.CENTER }),
            box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL }),
            bar = new Gtk.SearchBar({ show_close_button: false, child: entry }),
            header = new Adw.HeaderBar({ show_end_title_buttons: false, show_start_title_buttons: false });
        this._search = new Gtk.ToggleButton({ icon_name: 'system-search-symbolic' });
        select.add_css_class('suggested-action');
        close.connect('clicked', () => this.close());
        select.connect('clicked', () => this._onSelect());
        eck.connect('key-pressed', (_w, k) => k === Gdk.KEY_Escape && this.close());
        entry.connect('search-changed', x => this._filter.set_search(x.get_text()));
        this._search.bind_property('active', bar, 'search-mode-enabled', GObject.BindingFlags.BIDIRECTIONAL);
        this.connect('close-request', () => this._search.set_active(false));
        bar.set_key_capture_widget(this);
        bar.connect_entry(entry);
        this.add_controller(eck);
        header.pack_start(close);
        [select, this._search].forEach(x => header.pack_end(x));
        [header, bar, this._buildList(params)].forEach(x => box.append(x));
        this.set_content(box);
    }

    _onSelect() {
        this.close();
        this.emit('selected', this._select.get_selected_item().get_id());
    }
};

var DlgBtnBase = class extends Box {
    static {
        GObject.registerClass({
            Properties: {
                value: gparam('string', 'value', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(child, gtype, reset) {
        super();
        this._btn = new Gtk.Button({ child });
        this._btn.connect('clicked', () => this._onClick().then(x => { this.value = x; }).catch(noop));
        if(gtype) this._buildDND(gtype);
        if(reset) this._buildReset();
        this.prepend(this._btn);
        this.value = '';
    }

    _buildReset() {
        let clear = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') });
        clear.connect('clicked', () => { this.value = ''; });
        this.append(clear);
    }

    _buildDND(gtype) {
        let drop = Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY);
        drop.connect('drop', this._onDrop.bind(this));
        let drag = new Gtk.DragSource({ actions: Gdk.DragAction.COPY });
        drag.connect('prepare', () => Gdk.ContentProvider.new_for_value(this._gvalue));
        [drop, drag].forEach(x => this._btn.add_controller(x));
    }

    _onDrop(_t, x) {
        this.value = x;
    }

    set value(v) {
        if(typeof v === 'string' ? this._value === v : this._gvalue?.equal(v)) return;
        this._setValue(v);
        this.notify('value');
        this.emit('changed', this.value);
    }

    get value() {
        return this._value;
    }

    vfunc_mnemonic_activate() {
        this._btn.activate();
    }
};

var App = class extends DlgBtnBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('application-x-executable-symbolic'), null, true);
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? Gio.DesktopAppInfo.new(v) : v;
        this._value = type ? v : v.get_id();
        this._showValue();
    }

    _showValue() {
        if(this._gvalue) this._btn.child.set_info(this._gvalue.get_icon(), this._gvalue.get_display_name());
        else this._btn.child.set_info('', null);
    }

    _buildDialog() {
        this._dlg = new AppDialog();
        this._dlg.connect('selected', x => { this.value = x._select.get_selected_item(); });
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        this._dlg.present();
        let root = this.get_root();
        if(this._dlg.transient_for !== root) this._dlg.set_transient_for(root);
        return Promise.reject(new Error()); // compatible with super
    }
};

var File = class extends DlgBtnBase {
    static {
        GObject.registerClass(this);
    }

    constructor(params) {
        super(new IconLabel('document-open-symbolic'), Gio.File.$gtype, true);
        if(params?.select_folder) params.filter = { mime_types:  ['inode/directory'] };
        if(params?.filter) this._filter = new Gtk.FileFilter(params.filter);
        this._params = params;
    }

    _buildDialog() {
        this._dlg = new Gtk.FileDialog({ modal: true });
        if(this._params?.title) this._dlg.set_title(this._params.title);
        if(this._filter) this._dlg.set_default_filter(this._filter);
    }

    _onDrop(_t, x) {
        if(!this._filter) {
            this.value = x;
        } else {
            fquery(x, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
                if(this._filter.match(y)) this.value = x; else throw new Error();
            }).catch(() => { // NOTE: issue for folder - https://gitlab.gnome.org/GNOME/gtk/-/issues/5348
                this.get_root().add_toast(new Adw.Toast({ title: _('Mismatched filetype'), timeout: 5 }));
            });
        }
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? fl(v) : v;
        this._value = type ? v : v.get_path() ?? '';
        this._showValue(this._value);
    }

    _showValue(v) {
        fquery(this._gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this._setInfo(x.get_icon(), x.get_display_name(), v)).catch(() => this._setInfo('', null, v));
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        return this._dlg[this._params?.select_folder ? 'select_folder' : 'open'](this.get_root(), null);
    }

    _setInfo(icon, text, value) {
        if(value !== this.value) return;
        this._btn.child.set_info(icon, text);
    }
};

var Icon = class extends File {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({ filter: { mime_types: ['image/svg+xml'] } });
    }

    _showValue(v) {
        fquery(this._gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON).then(x => {
            let name = GLib.basename(x.get_display_name()).replace('.svg', '');
            let icon = Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).has_icon(name) ? name : '';
            this._setInfo(icon || x.get_icon(), x.get_display_name().replace(RegExp(/(-symbolic)*.svg$/), ''), v);
        }).catch(() => this._setInfo('', null, v));
    }
};

var Keys = class extends Gtk.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(gset, key) {
        super({ valign: Gtk.Align.CENTER, has_frame: false });
        this._label = new Gtk.ShortcutLabel({ disabled_text: _GTK('New accelerator…') });
        this._label.set_accelerator(gset.get_strv(key).at(0));
        this.setShortcut = x => { gset.set_strv(key, [x]); this._label.set_accelerator(x); };
        this.connect('clicked', () => this._onClick());
        this.set_child(this._label);
        this._buildDialog();
    }

    _buildDialog() {
        let content = new Adw.StatusPage({ title: _GTK('New accelerator…'), icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic' });
        this._dlg = new Adw.Window({ modal: true, hide_on_close: true, width_request: 480, height_request: 320, content });
        let ctl = new Gtk.EventControllerKey();
        ctl.connect('key-pressed', this._onKeyPressed.bind(this));
        this._dlg.add_controller(ctl);
    }

    _onClick() {
        this._dlg.present();
        let root = this.get_root();
        if(this._dlg.transient_for !== root) this._dlg.set_transient_for(root);
    }

    _onKeyPressed(_widget, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this._dlg.close();
        if(!this.isValidBinding(mask, keycode, keyval) || !this.isValidAccel(mask, keyval)) return;
        this.setShortcut(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
        this._dlg.close();
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

var LazyEntry = class extends Gtk.Stack {
    static {
        GObject.registerClass({
            Properties: {
                text: gparam('string', 'text', ''),
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
        this.add_named(new Box([this._label, this._edit], { hexpand: true }), 'label');
        this.add_named(new Box([this._entry, this._done], { hexpand: true }), 'entry');
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
};
