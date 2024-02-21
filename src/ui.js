// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';

import * as Gettext from 'gettext';
import {Field} from './const.js';

import {fopen, omap, noop, gprops, fquery, hook, BIND} from './util.js';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export {_};
export const _GTK = Gettext.domain('gtk40').gettext;
export const getSelf = () => ExtensionPreferences.lookupByURL(import.meta.url);
export const wrapValue = (...args) => ({Properties: gprops({value: [...args]})});
export const block = (o, s) => omap(o, ([k, [x, y = 'value']]) => [[k, (s.bind(Field[k], x, y, Gio.SettingsBindFlags.DEFAULT), x)]]);

export class Hook {
    static #map = new WeakMap();
    static attach(cbs, obj) {
        this.detach(obj);
        this.#map.set(obj, cbs);
        return hook(cbs, obj);
    }

    static detach(obj) {
        Object.values(this.#map.get(obj) ?? {}).forEach(x => GObject.signal_handlers_disconnect_by_func(obj, x));
    }
}


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
        super({valign: Gtk.Align.CENTER, ...param});
        children?.forEach(x => x && this.append(x));
        if(linked) this.add_css_class('linked');
    }
}

export class Spin extends Gtk.SpinButton {
    static {
        GObject.registerClass(this);
    }

    constructor(lower, upper, step_increment, tooltip_text = '', param) {
        super({tooltip_text, valign: Gtk.Align.CENTER, ...param});
        this.set_adjustment(new Gtk.Adjustment({lower, upper, step_increment}));
    }
}

export class Switch extends Gtk.Switch {
    static {
        GObject.registerClass(wrapValue('boolean', false), this);
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, ...param});
        this.bind_property('active', this, 'value', BIND);
    }
}

export class Check extends Gtk.CheckButton {
    static {
        GObject.registerClass(wrapValue('boolean', false), this);
    }

    constructor(param) {
        super(param);
        this.bind_property('active', this, 'value', BIND);
    }
}

export class Drop extends Gtk.DropDown {
    static {
        GObject.registerClass(wrapValue('uint', 0, Gtk.INVALID_LIST_POSITION, 0), this);
    }

    constructor(strv, tooltip_text = '', param) {
        super({model: Gtk.StringList.new(strv), valign: Gtk.Align.CENTER, tooltip_text, ...param});
        this.bind_property('selected', this, 'value', BIND);
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        GObject.registerClass(wrapValue('string', ''), this);
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param});
        this.bind_property_full('value', this, 'font-desc', BIND, (_b, data) =>
            [true, Pango.FontDescription.from_string(data)], (_b, data) => [true, data.to_string()]);
    }
}

export class Color extends Gtk.ColorDialogButton {
    static {
        GObject.registerClass(wrapValue('string', ''), this);
    }

    constructor(param) {
        super({tooltip_text: param?.title ?? '', valign: Gtk.Align.CENTER, dialog: new Gtk.ColorDialog(param)});
        this.bind_property_full('value', this, 'rgba', BIND, (_b, data) =>
            (color => [color.parse(data), color])(new Gdk.RGBA()), (_b, data) => [true, data.to_string()]);
    }
}

export class IconLabel extends Gtk.Box {
    static {
        GObject.registerClass(this);
    }

    constructor(fallback_icon) {
        super({spacing: 5});
        this._icon = new Gtk.Image();
        this._label = new Gtk.Label();
        this._fallback_icon = fallback_icon;
        [this._icon, this._label].forEach(x => this.append(x));
    }

    setContent(icon, label) {
        this._label.set_label(label || _GTK('(None)'));
        if(icon instanceof Gio.Icon) this._icon.set_from_gicon(icon);
        else this._icon.icon_name = icon || this._fallback_icon;
    }
}

export class DialogBase extends Adw.Window {
    static {
        GObject.registerClass({
            Signals: {
                selected: {param_types: [GObject.TYPE_STRING]},
            },
        }, this);
    }

    constructor(title, param) {
        super({title, modal: true, hide_on_close: true, width_request: 360, height_request: 320});
        this._buildContent(param);
    }

    _buildContent(param) {
        let {content, filter, title} = this._buildWidgets(param),
            eck = hook({'key-pressed': this._onKeyPress.bind(this)}, new Gtk.EventControllerKey()),
            close = hook({clicked: () => this.close()}, Gtk.Button.new_with_mnemonic(_GTK('_Cancel'))),
            select = hook({clicked: () => this._onSelect()}, Gtk.Button.new_with_mnemonic(_GTK('_OK'))),
            header = new Adw.HeaderBar({show_end_title_buttons: false, show_start_title_buttons: false, title_widget: title || null});
        select.add_css_class('suggested-action');
        this.add_controller(eck);
        header.pack_start(close);
        header.pack_end(select);

        let search;
        if(filter) {
            let button = new Gtk.ToggleButton({icon_name: 'system-search-symbolic'});
            let entry = hook({'search-changed': x => filter.set_search(x.get_text())}, new Gtk.SearchEntry({halign: Gtk.Align.CENTER}));
            search = new Gtk.SearchBar({show_close_button: false, child: entry});
            search.connect_entry(entry);
            search.set_key_capture_widget(this);
            button.bind_property('active', search, 'search-mode-enabled', BIND);
            this.connect('close-request', () => { button.set_active(false); content.scroll_to(0, Gtk.ListScrollFlags.FOCUS, null); });
            header.pack_end(button);
        }
        this.set_content(new Box([header, search, new Gtk.ScrolledWindow({child: content})],
            {orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.FILL}, false));
    }

    _onKeyPress(_w, key) {
        switch(key) {
        case Gdk.KEY_Escape: this.close(); break;
        case Gdk.KEY_Return:
        case Gdk.KEY_KP_Enter:
        case Gdk.KEY_ISO_Enter: this._onSelect(); break;
        }
    }

    _onSelect(selected) {
        selected ??= this.getSelected?.();
        if(selected !== undefined) this.emit('selected', selected);
        this.close();
    }

    choose_sth(root, initial) {
        this.initSelected?.(initial);
        if(this.transient_for !== root) this.set_transient_for(root);
        this.present();
        return new Promise((resolve, reject) => Hook.attach({
            selected: (_d, value) => resolve(value),
            close_request: () => reject(Error('cancelled')),
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

    _buildWidgets(param) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new IconLabel('application-x-executable-symbolic')),
                bind: (_f, x) => x.get_child().setContent(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
            }, new Gtk.SignalListItemFactory()),
            filter = Gtk.CustomFilter.new(null),
            model = new Gio.ListStore({item_type: Gio.DesktopAppInfo}),
            select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
            content = hook({activate: () => this._onSelect()}, new Gtk.ListView({model: select, factory, vexpand: true}));
        if(param?.no_display) Gio.AppInfo.get_all().forEach(x => model.append(x));
        else Gio.AppInfo.get_all().filter(x => x.should_show()).forEach(x => model.append(x));
        filter.set_search = s => filter.set_filter_func(s ? (a => x => a.has(x.get_id()))(new Set(Gio.DesktopAppInfo.search(s).flat())) : null);
        this.getSelected = () => select.get_selected_item().get_id();
        return {content, filter};
    }
}

export class KeysDialog extends DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super('', param);
    }

    _buildContent({title}) {
        this.set_content(new Adw.StatusPage({icon_name: 'preferences-desktop-keyboard-symbolic', title}));
        this.add_controller(hook({'key-pressed': this._onKeyPress.bind(this)}, new Gtk.EventControllerKey()));
    }

    _onKeyPress(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this.close();
        if(!this.isValidBinding(mask, keycode, keyval) || !this.isValidAccel(mask, keyval)) return;
        this._onSelect(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
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

    _buildWidgets(param) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new Gtk.Image({icon_size: Gtk.IconSize.LARGE})),
                bind: (_f, {child, item: {string}}) => { child.icon_name = child.tooltip_text = string; },
            }, new Gtk.SignalListItemFactory()),
            filter = new Gtk.EveryFilter(),
            title = new Drop([_('All'), _('Normal'), _('Symbolic')]),
            model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names()),
            select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
            content = hook({activate: () => this._onSelect()}, new Gtk.GridView({model: select, factory, vexpand: true}));
        filter.append(new Gtk.BoolFilter({expression: this._genIconExp()}));
        filter.append(new Gtk.StringFilter({expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string')}));
        this.connect('notify::icon-type', () => filter.get_item(0).set_expression(this._genIconExp()));
        this.bind_property('icon-type', title, 'selected', BIND);
        if(param?.icon_type) this.icon_type = param.icon_type;
        this.getSelected = () => select.get_selected_item().get_string();
        return {content, title, filter: filter.get_item(1)};
    }

    _genIconExp() {
        switch(this.icon_type) {
        case 1: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => !x.string.endsWith('-symbolic'), null);
        case 2: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => x.string.endsWith('-symbolic'), null);
        default: return Gtk.ConstantExpression.new_for_value(true);
        }
    }
}

export class DialogButtonBase extends Box {
    static {
        GObject.registerClass(wrapValue('string', ''), this);
    }

    constructor(child, gtype, reset) {
        super();
        this._btn = hook({clicked: () => this._onClick().then(x => { this.value = x; }).catch(noop)}, new Gtk.Button({child}));
        if(gtype) this._buildDND(gtype);
        if(reset) this._buildReset();
        this.prepend(this._btn);
        this.value = '';
    }

    _buildReset() {
        this.append(hook({clicked: () => { this.value = ''; }},
            new Gtk.Button({icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear')})));
    }

    _buildDND(gtype) {
        this._btn.add_controller(hook({drop: this._onDrop.bind(this)}, Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY)));
        this._btn.add_controller(hook({prepare: this._onDrag.bind(this)}, new Gtk.DragSource({actions: Gdk.DragAction.COPY})));
    }

    _onDrag(src) {
        let icon = this._genDragSwatch();
        if(icon) src.set_icon(icon, 0, 0);
        return Gdk.ContentProvider.new_for_value(this._gvalue);
    }

    _onDrop(_t, v) {
        this.value = v;
    }

    get _dlg() {
        return (this._dialog ??= this._buildDialog());
    }

    _onClick() {
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
        if(this._gvalue) this._btn.child.setContent(this._gvalue.get_icon(), this._gvalue.get_display_name());
        else this._btn.child.setContent();
    }

    _genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this._gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    _buildDialog() {
        return new AppDialog();
    }
}

export class File extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(new IconLabel('document-open-symbolic'), Gio.File.$gtype, true);
        if(param?.select_folder) param.filter = {mime_types:  ['inode/directory']};
        if(param?.filter) this._filter = new Gtk.FileFilter(param.filter);
        this._param = param;
    }

    _buildDialog() {
        let dialog = new Gtk.FileDialog({modal: true});
        if(this._param?.title) dialog.set_title(this._param.title);
        if(this._filter) dialog.set_default_filter(this._filter);
        return dialog;
    }

    _onDrop(_t, value) {
        if(!this._filter) {
            this.value = value;
        } else {
            fquery(value, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
                if(this._filter.match(y)) this.value = value; else throw Error();
            }).catch(() => {
                this.get_root().add_toast(new Adw.Toast({title: _('Mismatched filetype'), timeout: 5}));
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
        this._dlg.set_initial_file(this._gvalue);
        return this._dlg[this._param?.select_folder ? 'select_folder' : 'open'](this.get_root(), null);
    }

    _setContent(value, icon, text) {
        if(value !== this.value) return;
        this._btn.child.setContent(icon, text);
    }
}

export class Icon extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('image-missing'), Gio.ThemedIcon.$gtype, true);
    }

    _genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this._gvalue, 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    _setValue(v) {
        let type = typeof v === 'string';
        this._gvalue = type ? Gio.ThemedIcon.new(v) : v;
        this._value = type ? v : v.to_string();
        if(this._gvalue) this._btn.child.setContent(this._value, this._value.replace(/-symbolic$/, ''));
        else this._btn.child.setContent();
    }

    _buildDialog() {
        return new IconDialog();
    }
}

export class Keys extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(new Gtk.ShortcutLabel({disabled_text: _GTK('New accelerator…')}));
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
        return new KeysDialog({title: _GTK('New accelerator…')});
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
        GObject.registerClass(wrapValue('string', ''), this);
    }

    constructor(placeholder, tooltip, param) {
        super({valign: Gtk.Align.CENTER, hhomogeneous: true, ...param});
        this._buildWidgets(placeholder, tooltip);
        this.value = '';
    }

    _buildWidgets(placeholder_text = '', tooltip_text = '') {
        this._label = new Gtk.Entry({hexpand: true, sensitive: false, placeholder_text});
        this._entry = hook({activate: () => { this.value = this._entry.get_text(); }},
            new Gtk.Entry({hexpand: true, enable_undo: true, placeholder_text}));
        this._edit = hook({clicked: () => { this._entry.set_text(this.value); this.set_visible_child_name('entry'); }},
            new Gtk.Button({icon_name: 'document-edit-symbolic', tooltip_text}));
        this._done = hook({clicked: () => { this.value = this._entry.get_text(); }},
            new Gtk.Button({icon_name: 'object-select-symbolic', tooltip_text: _('Click or press ENTER to commit changes')}));
        this.add_named(new Box([this._label, this._edit], {hexpand: true}), 'label');
        this.add_named(new Box([this._entry, this._done], {hexpand: true}), 'entry');
        this._done.add_css_class('suggested-action');
    }

    set value(value) {
        if(this.value !== value) {
            this._label.set_text(this._value = value);
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
