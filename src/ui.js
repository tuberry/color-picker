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

import { fopen, raise, omap, noop, gprops, fquery, hook, BIND_FULL } from './util.js';
import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export { _ };
export const _GTK = Gettext.domain('gtk40').gettext;
export const getSelf = () => ExtensionPreferences.lookupByURL(import.meta.url);
export const block = (o, s) => omap(o, ([k, [x, y]]) => [[k, (s.bind(Field[k], y, x, Gio.SettingsBindFlags.DEFAULT), y)]]);

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
        let { view, filter, title } = this._buildList(param),
            search = new Gtk.ToggleButton({ icon_name: 'system-search-symbolic' }),
            close = hook({ clicked: () => this.close() }, Gtk.Button.new_with_mnemonic(_GTK('_Close'))),
            select = hook({ clicked: () => this._onSelect() }, Gtk.Button.new_with_mnemonic(_GTK('_Select'))),
            eck = hook({ key_pressed: (_w, k) => k === Gdk.KEY_Escape && this.close() }, new Gtk.EventControllerKey()),
            entry = hook({ search_changed: x => filter.set_search(x.get_text()) }, new Gtk.SearchEntry({ halign: Gtk.Align.CENTER })),
            header = new Adw.HeaderBar({ show_end_title_buttons: false, show_start_title_buttons: false, title_widget: title || null }),
            bar = new Gtk.SearchBar({ show_close_button: false, child: entry });

        bar.connect_entry(entry);
        bar.set_key_capture_widget(this);
        select.add_css_class('suggested-action');
        search.bind_property('active', bar, 'search-mode-enabled', BIND_FULL);
        this.connect('close-request', () => { search.set_active(false); view.scroll_to(0, Gtk.ListScrollFlags.FOCUS, null); });

        this.add_controller(eck);
        header.pack_start(close);
        [select, search].forEach(x => header.pack_end(x));
        this.set_content(new Box([header, bar, new Gtk.ScrolledWindow({ child: view })],
            { orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.FILL }, false));
    }

    _onSelect() {
        this.emit('selected', this.getSelected());
        this.close();
    }

    choose_sth(root) {
        this.present();
        if(this.transient_for !== root) this.set_transient_for(root);
        return new Promise((resolve, reject) => Hook.attach({
            selected: (_d, value) => resolve(value),
            close_request: () => reject(new Error('cancelled')),
        }, this));
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
                setup: (_f, x) => x.set_child(new IconLabel('application-x-executable-symbolic')),
                bind: (_f, x) => x.get_child().setupContent(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
            }, new Gtk.SignalListItemFactory()),
            filter = Gtk.CustomFilter.new(null),
            model = new Gio.ListStore({ item_type: Gio.DesktopAppInfo }),
            select = new Gtk.SingleSelection({ model: new Gtk.FilterListModel({ model, filter }) }),
            view = hook({ activate: () => this._onSelect() }, new Gtk.ListView({ model: select, factory, vexpand: true }));
        if(param?.no_display) Gio.AppInfo.get_all().forEach(x => model.append(x));
        else Gio.AppInfo.get_all().filter(x => x.should_show()).forEach(x => model.append(x));
        filter.set_search = s => filter.set_filter_func(s ? (a => x => a.has(x.get_id()))(new Set(Gio.DesktopAppInfo.search(s).flat())) : null);
        this.getSelected = () => select.get_selected_item().get_id();
        return { view, filter };
    }
}

export class KeysDialog extends DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super('', param);
    }

    _buildContent({ title }) {
        this.set_content(new Adw.StatusPage({ icon_name: 'preferences-desktop-keyboard-symbolic', title }));
        this.add_controller(hook({ key_pressed: this._onKeyPressed.bind(this) }, new Gtk.EventControllerKey()));
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
        let factory = hook({
                setup: (_f, x) => x.set_child(new Gtk.Image({ icon_size: Gtk.IconSize.LARGE })),
                bind: (_f, { child, item: { string } }) => { child.icon_name = child.tooltip_text = string; },
            }, new Gtk.SignalListItemFactory()),
            filter = new Gtk.EveryFilter(),
            title = new Drop([_('All'), _('Normal'), _('Symbolic')]),
            model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names()),
            select = new Gtk.SingleSelection({ model: new Gtk.FilterListModel({ model, filter }) }),
            view = hook({ activate: () => this._onSelect() }, new Gtk.GridView({ model: select, factory, vexpand: true }));
        filter.append(new Gtk.BoolFilter({ expression: this.icon_expression }));
        filter.append(new Gtk.StringFilter({ expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string') }));
        this.connect('notify::icon-type', () => filter.get_item(0).set_expression(this.icon_expression));
        this.bind_property('icon-type', title, 'selected', BIND_FULL);
        if(param?.icon_type) this.icon_type = param.icon_type;
        this.getSelected = () => select.get_selected_item().get_string();
        return { view, title, filter: filter.get_item(1) };
    }

    get icon_expression() {
        switch(this.icon_type) {
        case 1: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => !x.string.endsWith('-symbolic'), null);
        case 2: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => x.string.endsWith('-symbolic'), null);
        default: return Gtk.ConstantExpression.new_for_value(true);
        }
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
        this._btn = hook({ clicked: () => this._onClick().then(x => { this.value = x; }).catch(noop) }, new Gtk.Button({ child }));
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
        if(this._gvalue) this._btn.child.setupContent(this._gvalue.get_icon(), this._gvalue.get_display_name());
        else this._btn.child.setupContent();
    }

    get _paintable() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this._gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
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
            fquery(value, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
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
        fquery(this._gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this._setContent(this._value, x.get_icon(), x.get_display_name())).catch(() => this._setContent(v));
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        this._dlg.set_initial_file(this._gvalue);
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
        return this._param?.gset.get_strv(this._param?.key).at(0);
    }

    set shortcut(shortcut) {
        if(shortcut !== this.shortcut) this._param?.gset.set_strv(this._param?.key, [shortcut]);
    }

    _setValue(v) {
        this._value = v;
        this.shortcut = v;
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
                value: ['string', ''],
            }),
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor(holder, tip) {
        super({ valign: Gtk.Align.CENTER, hhomogeneous: true });
        this._buildWidgets(holder, tip);
        this.value = '';
    }

    _buildWidgets(holder, tip) {
        this._label = new Gtk.Entry({ hexpand: true, sensitive: false, placeholder_text: holder || '' });
        this._entry = hook({ activate: () => { this.value = this._entry.get_text(); } },
            new Gtk.Entry({ hexpand: true, enable_undo: true, placeholder_text: holder || '' }));
        this._edit = hook({ clicked: () => { this._entry.set_text(this.value); this.set_visible_child_name('entry'); } },
            new Gtk.Button({ icon_name: 'document-edit-symbolic', tooltip_text: tip || '' }));
        this._done = hook({ clicked: () => { this.value = this._entry.get_text(); } },
            new Gtk.Button({ icon_name: 'object-select-symbolic', tooltip_text: _('Click or press ENTER to commit changes') }));
        this.add_named(new Box([this._label, this._edit], { hexpand: true }), 'label');
        this.add_named(new Box([this._entry, this._done], { hexpand: true }), 'entry');
        this._done.add_css_class('suggested-action');
    }

    set value(value) {
        if(this.value !== value) {
            this._label.set_text(this._value = value);
            this.emit('changed', value);
            this.notify('value');
        }
        this.set_visible_child_name('label');
    }

    get value() {
        return this._value;
    }

    vfunc_mnemonic_activate() {
        this[this.get_visible_child_name() === 'label' ? '_edit' : '_done'].activate();
    }
}
