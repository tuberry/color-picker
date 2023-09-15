// vim:fdm=syntax
// by tuberry

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';

import * as Gettext from 'gettext';
import { Field } from './const.js';

import { fopen, raise, omap, noop, gprops, fquery, BIND_FULL } from './util.js';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export { _ };
export const _GTK = Gettext.domain('gtk40').gettext;
export const getSelf = () => ExtensionPreferences.lookupByURL(import.meta.url);
export const block = (o, s) => omap(o, ([k, [x, y]]) => [[k, (s.bind(Field[k], y, x, Gio.SettingsBindFlags.DEFAULT), y)]]);
export const hook = (o, a) => (Object.entries(o).forEach(([k, v]) => a.connect(k, v)), a);

export const Hook = new class Conns {
    #map = new WeakMap();
    attach(cbs, obj) {
        this.detach(obj);
        this.#map.set(obj, cbs);
        return hook(cbs, obj);
    }

    detach(obj) {
        Object.values(this.#map.get(obj) ?? {}).forEach(x => GObject.signal_handlers_disconnect_by_func(obj, x));
    }
}();


export class Prefs extends ExtensionPreferences {
    getPreferencesWidget() {
        if(this.$klass) return new this.$klass(this.getSettings());
    }
}

export class Box extends Gtk.Box {
    static {
        GObject.registerClass(this);
    }

    constructor(children, param, linked = true) {
        super({ valign: Gtk.Align.CENTER, ...param });
        children?.forEach(x => this.append(x));
        if(linked) this.add_css_class('linked');
    }
}

export class Spin extends Gtk.SpinButton {
    static {
        GObject.registerClass(this);
    }

    constructor(l, u, s, tip) {
        super({ tooltip_text: tip || '', valign: Gtk.Align.CENTER });
        this.set_adjustment(new Gtk.Adjustment({ lower: l, upper: u, step_increment: s }));
    }
}

export class Drop extends Gtk.DropDown {
    static {
        GObject.registerClass({
            Signals: {
                changed: { param_types: [GObject.TYPE_UINT] },
            },
        }, this);
    }

    constructor(opts, tip) {
        super({ model: Gtk.StringList.new(opts), valign: Gtk.Align.CENTER, tooltip_text: tip || '' });
        this.connect('notify::selected', () => this.emit('changed', this.selected));
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        GObject.registerClass({
            Properties: gprops({
                value: ['string', ''],
            }),
        }, this);
    }

    constructor(param) {
        super({ valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param });
        this.bind_property_full('value', this, 'font-desc', BIND_FULL, (_b, data) =>
            [true, Pango.FontDescription.from_string(data)], (_b, data) => [true, data.to_string()]);
    }
}

export class Color extends Gtk.ColorDialogButton {
    static {
        GObject.registerClass({
            Properties: gprops({
                value: ['string', ''],
            }),
        }, this);
    }

    constructor(param) {
        super({ tooltip_text: param?.title ?? '', valign: Gtk.Align.CENTER, dialog: new Gtk.ColorDialog(param) });
        this.bind_property_full('value', this, 'rgba', BIND_FULL, (_b, data) =>
            (color => [color.parse(data), color])(new Gdk.RGBA()), (_b, data) => [true, data.to_string()]);
    }
}

export class IconLabel extends Gtk.Box {
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

    setupContent(icon, label) {
        this._label.set_label(label || _GTK('(None)'));
        if(icon instanceof Gio.Icon) this._icon.set_from_gicon(icon);
        else this._icon.icon_name = icon || this._fallback_icon;
    }
}

export class DialogBase extends Adw.Window {
    static {
        GObject.registerClass({
            Signals: {
                selected: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(title, param) {
        super({ title, modal: true, hide_on_close: true, width_request: 360, height_request: 320 });
        this._buildContent(param);
    }

    _buildContent(param) {
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL }),
            search = new Gtk.ToggleButton({ icon_name: 'system-search-symbolic' }),
            list = hook({ activate: () => this._onSelect() }, this._buildList(param)),
            close = hook({ clicked: () => this.close() }, Gtk.Button.new_with_mnemonic(_GTK('_Close'))),
            select = hook({ clicked: () => this._onSelect() }, Gtk.Button.new_with_mnemonic(_GTK('_Select'))),
            eck = hook({ key_pressed: (_w, k) => k === Gdk.KEY_Escape && this.close() }, new Gtk.EventControllerKey()),
            entry = hook({ search_changed: x => this._filter.set_search(x.get_text()) }, new Gtk.SearchEntry({ halign: Gtk.Align.CENTER })),
            header = new Adw.HeaderBar({ show_end_title_buttons: false, show_start_title_buttons: false }),
            bar = new Gtk.SearchBar({ show_close_button: false, child: entry });

        select.add_css_class('suggested-action');
        search.bind_property('active', bar, 'search-mode-enabled', BIND_FULL);
        this.connect('close-request', () => search.set_active(false));
        bar.set_key_capture_widget(this);
        bar.connect_entry(entry);
        this.add_controller(eck);
        header.pack_start(close);
        if(this._title) header.set_title_widget(this._title);
        [select, search].forEach(x => header.pack_end(x));
        [header, bar, new Gtk.ScrolledWindow({ child: list })].forEach(x => box.append(x));
        this.set_content(box);
    }

    choose_sth(root) {
        this.present();
        if(this.transient_for !== root) this.set_transient_for(root);
        return new Promise((resolve, reject) => Hook.attach({
            selected: (_d, value) => resolve(value),
            close_request: () => reject(new Error('cancelled')),
        }, this));
    }

    _onSelect() {
        this.emit('selected', this._unpack(this._select.get_selected_item()));
        this.close();
    }
}

export class AppDialog extends DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(_GTK('Select Application'), param);
    }

    _buildList(param) {
        let factory = hook({
            setup: (_f, x) => { x.set_child(new IconLabel('application-x-executable-symbolic')); },
            bind: (_f, x) => x.get_child().setupContent(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
        }, new Gtk.SignalListItemFactory());
        this._unpack = x => x.get_id();
        let model = new Gio.ListStore({ item_type: Gio.DesktopAppInfo });
        if(param?.no_display) Gio.AppInfo.get_all().forEach(x => model.append(x));
        else Gio.AppInfo.get_all().filter(x => x.should_show()).forEach(x => model.append(x));
        let expression = new Gtk.ClosureExpression(GObject.TYPE_STRING, x => `${x.get_executable()}:${x.get_display_name()}`, null);
        this._filter = new Gtk.StringFilter({ expression });
        this._select = new Gtk.SingleSelection({ model: new Gtk.FilterListModel({ model, filter: this._filter }) });
        return new Gtk.ListView({ model: this._select, factory, single_click_activate: false, vexpand: true });
    }
}

export class KeysDialog extends DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super('', param);
    }

    _buildContent(param) {
        let page = new Adw.StatusPage({ icon_name: 'preferences-desktop-keyboard-symbolic' });
        if(param?.title) page.set_title(param.title);
        this.set_content(page);
        let eck = hook({ key_pressed: this._onKeyPressed.bind(this) }, new Gtk.EventControllerKey());
        this.add_controller(eck);
    }

    _onKeyPressed(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this.close();
        if(!this.isValidBinding(mask, keycode, keyval) || !this.isValidAccel(mask, keyval)) return;
        this.emit('selected', Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
        this.close();
    }

    keyvalIsForbidden(keyval) {
        return [Gdk.KEY_Home, Gdk.KEY_Left, Gdk.KEY_Up, Gdk.KEY_Right, Gdk.KEY_Down, Gdk.KEY_Page_Up,
            Gdk.KEY_Page_Down, Gdk.KEY_End, Gdk.KEY_Tab, Gdk.KEY_KP_Enter, Gdk.KEY_Return, Gdk.KEY_Mode_switch].includes(keyval);
    }

    isValidBinding(mask, keycode, keyval) {
        // From: https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/main/panels/keyboard/keyboard-shortcuts.c
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
}

class IconDialog extends DialogBase {
    static {
        GObject.registerClass({
            Properties: gprops({
                icon_type: ['uint', 0, 2, 2],
            }),
        }, this);
    }

    constructor(param) {
        super('', param);
    }

    _buildList(param) {
        this._title = new Drop([_('All'), _('Normal'), _('Symbolic')]);
        this.bind_property('icon-type', this._title, 'selected', BIND_FULL);
        if(param?.icon_type) this.icon_type = param?.icon_type ?? 2;
        let factory = hook({
            setup: (_f, x) => { x.set_child(new Gtk.Image({ icon_size: Gtk.IconSize.LARGE })); },
            bind: (_f, x) => x.get_child().set_from_icon_name(x.get_item().get_string()),
        }, new Gtk.SignalListItemFactory());
        this._unpack = x => x.get_string();
        let model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names());
        this._filter = new Gtk.StringFilter({ expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string') });
        this._select = new Gtk.SingleSelection({ model: new Gtk.FilterListModel({ model, filter: this.filters }) });
        this.connect('notify::icon-type', () => this._select.model.set_filter(this.filters));
        return new Gtk.GridView({ model: this._select, factory, single_click_activate: false, vexpand: true });
    }

    get filters() {
        if(this.icon_type === 0) return this._filter;
        let filters = new Gtk.EveryFilter();
        [this._filter, new Gtk.BoolFilter({
            invert: this.icon_type === 1,
            expression: new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => x.string.endsWith('-symbolic'), null),
        })].forEach(x => filters.append(x));
        return filters;
    }
}

export class DialogButtonBase extends Box {
    static {
        GObject.registerClass({
            Properties: gprops({
                value: ['string', ''],
            }),
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(child, gtype, reset) {
        super();
        this._btn = hook({ clicked: () => this._onClick().then(x => this._postClick(x)).catch(noop) }, new Gtk.Button({ child }));
        if(gtype) this._buildDND(gtype);
        if(reset) this._buildReset();
        this.prepend(this._btn);
        this.value = '';
    }

    _buildReset() {
        this.append(hook({ clicked: () => { this.value = ''; } },
            new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') })));
    }

    _buildDND(gtype) {
        let drop = hook({ drop: this._onDrop.bind(this) }, Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY));
        let drag = hook({ prepare: this._onDrag.bind(this) }, new Gtk.DragSource({ actions: Gdk.DragAction.COPY }));
        [drop, drag].forEach(x => this._btn.add_controller(x));
    }

    _onDrag(src) {
        let icon = this._paintable;
        if(icon) src.set_icon(icon, 0, 0);
        return Gdk.ContentProvider.new_for_value(this._gvalue);
    }

    _onDrop(_t, v) {
        this.value = v;
    }

    _postClick(v) {
        this.value = v;
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        return this._dlg.choose_sth(this.get_root());
    }

    _checkGvalue(gvalue) {
        return this._gvalue?.equal(gvalue);
    }

    _setValue(v) {
        this._value = v;
    }

    set value(v) {
        if(typeof v === 'string' ? this._value === v : this._checkGvalue(v)) return;
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
}

export class App extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('application-x-executable-symbolic'), Gio.DesktopAppInfo.$gtype, true);
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? Gio.DesktopAppInfo.new(v) : v;
        this._value = type ? v : v.get_id();
        this._showValue();
    }

    get _paintable() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this._gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    _showValue() {
        if(this._gvalue) this._btn.child.setupContent(this._gvalue.get_icon(), this._gvalue.get_display_name());
        else this._btn.child.setupContent();
    }

    _buildDialog() {
        this._dlg = new AppDialog();
    }
}

export class File extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(new IconLabel('document-open-symbolic'), Gio.File.$gtype, true);
        if(param?.select_folder) param.filter = { mime_types:  ['inode/directory'] };
        if(param?.filter) this._filter = new Gtk.FileFilter(param.filter);
        this._param = param;
    }

    _buildDialog() {
        this._dlg = new Gtk.FileDialog({ modal: true });
        if(this._param?.title) this._dlg.set_title(this._param.title);
        if(this._filter) this._dlg.set_default_filter(this._filter);
    }

    _onDrop(_t, value) {
        if(!this._filter) {
            this.value = value;
        } else {
            fquery(value, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
                if(this._filter.match(y)) this.value = value; else raise();
            }).catch(() => {
                this.get_root().add_toast(new Adw.Toast({ title: _('Mismatched filetype'), timeout: 5 }));
            });
        }
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? fopen(v) : v;
        this._value = type ? v : v.get_path() ?? '';
        this._showValue(this._value);
    }

    _showValue(v) {
        fquery(this._gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this._setContent(v, x.get_icon(), x.get_display_name())).catch(() => this._setContent(v));
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        return this._dlg[this._param?.select_folder ? 'select_folder' : 'open'](this.get_root(), null);
    }

    _setContent(value, icon, text) {
        if(value !== this.value) return;
        this._btn.child.setupContent(icon, text);
    }
}

export class Icon extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('image-missing'), Gio.ThemedIcon.$gtype, true);
    }

    get _paintable() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this._gvalue, 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? Gio.ThemedIcon.new(v) : v;
        this._value = type ? v : v.to_string();
        this._showValue();
    }

    _showValue() {
        if(this._gvalue) this._btn.child.setupContent(this._value, this._value.replace(/-symbolic$/, ''));
        else this._btn.child.setupContent();
    }

    _buildDialog() {
        this._dlg = new IconDialog();
    }
}

export class Keys extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(new Gtk.ShortcutLabel({ disabled_text: _GTK('New accelerator…') }));
        this._btn.set_has_frame(false);
        this._param = param;
        this.value = this.shortcut ?? '';
    }

    get shortcut() {
        return this._param?.gset?.get_strv(this._param?.key).at(0);
    }

    set shortcut(shortcut) {
        if(shortcut !== this.shortcut) this._param?.gset?.set_strv(this._param?.key, [shortcut]);
    }

    _setValue(v) {
        this._value = v;
        this.shortcut = v;
        this._showValue();
    }

    _showValue() {
        this._btn.child.set_accelerator(this._value);
    }

    _buildDialog() {
        this._dlg = new KeysDialog({ title: _GTK('New accelerator…') });
    }
}

export class PrefRow extends Adw.ActionRow {
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
}

export class LazyEntry extends Gtk.Stack {
    static {
        GObject.registerClass({
            Properties: gprops({
                text: ['string', ''],
            }),
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(holder, tip) {
        super({ valign: Gtk.Align.CENTER, hhomogeneous: true });
        this._label = new Gtk.Entry({ hexpand: true, sensitive: false, placeholder_text: holder || '' });
        this._entry = hook({ activate: () => this._onDone() }, new Gtk.Entry({ hexpand: true, enable_undo: true, placeholder_text: holder || '' }));
        this._edit = hook({ clicked: () => this._onEdit() }, new Gtk.Button({ icon_name: 'document-edit-symbolic', tooltip_text: tip || '' }));
        this._done = hook({ clicked: () => this._onDone() }, new Gtk.Button({
            icon_name: 'object-select-symbolic',
            css_classes: ['suggested-action'],
            tooltip_text: _('Click or press ENTER to commit changes'),
        }));
        this.add_named(new Box([this._label, this._edit], { hexpand: true }), 'label');
        this.add_named(new Box([this._entry, this._done], { hexpand: true }), 'entry');
        this.bind_property('text', this._label, 'text', BIND_FULL);
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
        this[this.get_visible_child_name() === 'label' ? '_edit' : '_done'].activate();
    }
}
