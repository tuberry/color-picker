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
import {fopen, omap, noop, fquery, hook, BIND} from './util.js';
import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export {_};
export const _GTK = Gettext.domain('gtk40').gettext;
export const myself = () => ExtensionPreferences.lookupByURL(import.meta.url);
export const gprop = o => omap(o, ([k, [x, ...ys]]) => [[k, GObject.ParamSpec[x](k, k, k, GObject.ParamFlags.READWRITE, ...ys)]]);
export const vprop = (...args) => ({Properties: gprop({value: [...args]})});

/**
 * @template T
 * @param {T} o
 * @return {T}
 */
export const block = (o, s, p) => omap(o, ([k, v]) => [[k, (s.bind(Field[k], v, p?.[k] ?? 'value', Gio.SettingsBindFlags.DEFAULT), v)]]);

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

export class FoldRow extends Adw.ExpanderRow {
    static {
        GObject.registerClass(vprop('boolean', false), this);
    }

    constructor(title, subtitle, param) {
        super({title, subtitle, show_enable_switch: true, ...param});
        this.bind_property('enable-expansion', this, 'value', BIND);
    }
}

export class Switch extends Gtk.Switch {
    static {
        GObject.registerClass(vprop('boolean', false), this);
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, ...param});
        this.bind_property('active', this, 'value', BIND);
    }
}

export class Check extends Gtk.CheckButton {
    static {
        GObject.registerClass(vprop('boolean', false), this);
    }

    constructor(param) {
        super(param);
        this.bind_property('active', this, 'value', BIND);
    }
}

export class Drop extends Gtk.DropDown {
    static {
        GObject.registerClass(vprop('uint', 0, Gtk.INVALID_LIST_POSITION, 0), this);
    }

    constructor(strv, tooltip_text = '', param) {
        super({model: Gtk.StringList.new(strv), valign: Gtk.Align.CENTER, tooltip_text, ...param});
        this.bind_property('selected', this, 'value', BIND);
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param});
        this.bind_property_full('value', this, 'font-desc', BIND, (_b, data) =>
            [true, Pango.FontDescription.from_string(data)], (_b, data) => [true, data.to_string()]);
    }
}

export class Color extends Gtk.ColorDialogButton {
    static {
        GObject.registerClass(vprop('string', ''), this);
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
        this.$icon = new Gtk.Image();
        this.$label = new Gtk.Label();
        this.$fallback_icon = fallback_icon;
        [this.$icon, this.$label].forEach(x => this.append(x));
    }

    setContent(icon, label) {
        this.$label.set_label(label || _GTK('(None)'));
        if(icon instanceof Gio.Icon) this.$icon.set_from_gicon(icon);
        else this.$icon.icon_name = icon || this.$fallback_icon;
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
        this.$buildContent(param);
    }

    $buildContent(param) {
        let {content, filter, title} = this.$buildWidgets(param),
            eck = hook({'key-pressed': this.$onKeyPress.bind(this)}, new Gtk.EventControllerKey()),
            close = hook({clicked: () => this.close()}, Gtk.Button.new_with_mnemonic(_GTK('_Cancel'))),
            select = hook({clicked: () => this.$onSelect()}, Gtk.Button.new_with_mnemonic(_GTK('_OK'))),
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

    $onKeyPress(_w, key) {
        switch(key) {
        case Gdk.KEY_Escape: this.close(); break;
        case Gdk.KEY_Return:
        case Gdk.KEY_KP_Enter:
        case Gdk.KEY_ISO_Enter: this.$onSelect(); break;
        }
    }

    $onSelect(selected) {
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

    $buildWidgets(param) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new IconLabel('application-x-executable-symbolic')),
                bind: (_f, x) => x.get_child().setContent(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
            }, new Gtk.SignalListItemFactory()),
            filter = Gtk.CustomFilter.new(null),
            model = new Gio.ListStore({item_type: Gio.DesktopAppInfo}),
            select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
            content = hook({activate: () => this.$onSelect()}, new Gtk.ListView({model: select, factory, vexpand: true}));
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

    $buildContent({title}) {
        this.set_content(new Adw.StatusPage({icon_name: 'preferences-desktop-keyboard-symbolic', title}));
        this.add_controller(hook({'key-pressed': this.$onKeyPress.bind(this)}, new Gtk.EventControllerKey()));
    }

    $onKeyPress(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this.close();
        if(keyval === Gdk.KEY_BackSpace) return this.$onSelect('');
        if(!KeysDialog.isValidBinding(mask, keycode, keyval) || !KeysDialog.isValidAccel(mask, keyval)) return;
        this.$onSelect(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
    }

    static keyvalIsForbidden(keyval) {
        return [Gdk.KEY_Home, Gdk.KEY_Left, Gdk.KEY_Up, Gdk.KEY_Right, Gdk.KEY_Down, Gdk.KEY_Page_Up,
            Gdk.KEY_Page_Down, Gdk.KEY_End, Gdk.KEY_Tab, Gdk.KEY_KP_Enter, Gdk.KEY_Return, Gdk.KEY_Mode_switch].includes(keyval);
    }

    static isValidBinding(mask, keycode, keyval) {
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
                (keyval === Gdk.KEY_space && mask === 0) || KeysDialog.keyvalIsForbidden(keyval))
        );
    }

    static isValidAccel(mask, keyval) {
        return Gtk.accelerator_valid(keyval, mask) || (keyval === Gdk.KEY_Tab && mask !== 0);
    }
}

class IconDialog extends DialogBase {
    static {
        GObject.registerClass({
            Properties: gprop({
                icon_type: ['uint', 0, 2, 2],
            }),
        }, this);
    }

    constructor(param) {
        super('', param);
    }

    $buildWidgets(param) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new Gtk.Image({icon_size: Gtk.IconSize.LARGE})),
                bind: (_f, {child, item: {string}}) => { child.icon_name = child.tooltip_text = string; },
            }, new Gtk.SignalListItemFactory()),
            filter = new Gtk.EveryFilter(),
            title = new Drop([_('All'), _('Normal'), _('Symbolic')]),
            model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names()),
            select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
            content = hook({activate: () => this.$onSelect()}, new Gtk.GridView({model: select, factory, vexpand: true}));
        filter.append(new Gtk.BoolFilter({expression: this.$genIconExpression()}));
        filter.append(new Gtk.StringFilter({expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string')}));
        this.connect('notify::icon-type', () => filter.get_item(0).set_expression(this.$genIconExpression()));
        this.bind_property('icon-type', title, 'selected', BIND);
        if(param?.icon_type) this.icon_type = param.icon_type;
        this.getSelected = () => select.get_selected_item().get_string();
        return {content, title, filter: filter.get_item(1)};
    }

    $genIconExpression() {
        switch(this.icon_type) {
        case 1: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => !x.string.endsWith('-symbolic'), null);
        case 2: return new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => x.string.endsWith('-symbolic'), null);
        default: return Gtk.ConstantExpression.new_for_value(true);
        }
    }
}

export class DialogButtonBase extends Box {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(child, gtype, reset) {
        super();
        this.$btn = hook({clicked: () => this.$onClick().then(x => { this.value = x; }).catch(noop)}, new Gtk.Button({child}));
        if(gtype) this.$buildDND(gtype);
        if(reset) this.$buildReset();
        this.prepend(this.$btn);
        this.value = '';
    }

    $buildReset() {
        this.append(hook({clicked: () => { this.value = ''; }},
            new Gtk.Button({icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear')})));
    }

    $buildDND(gtype) {
        this.$btn.add_controller(hook({drop: this.$onDrop.bind(this)}, Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY)));
        this.$btn.add_controller(hook({prepare: this.$onDrag.bind(this)}, new Gtk.DragSource({actions: Gdk.DragAction.COPY})));
    }

    $onDrag(src) {
        let icon = this.$genDragSwatch();
        if(icon) src.set_icon(icon, 0, 0);
        return Gdk.ContentProvider.new_for_value(this.$gvalue);
    }

    $onDrop(_t, v) {
        this.value = v;
    }

    get dlg() {
        return (this.$dialog ??= this.$genDialog());
    }

    $onClick() {
        return this.dlg.choose_sth(this.get_root());
    }

    $checkGvalue(gvalue) {
        return this.$gvalue?.equal(gvalue);
    }

    $setValue(v) {
        this.$value = v;
    }

    set value(v) {
        if(typeof v === 'string' ? this.$value === v : this.$checkGvalue(v)) return;
        this.$setValue(v);
        this.notify('value');
    }

    get value() {
        return this.$value;
    }

    vfunc_mnemonic_activate() {
        this.$btn.activate();
    }
}

export class App extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('application-x-executable-symbolic'), Gio.DesktopAppInfo.$gtype, true);
    }

    $setValue(v) {
        let type = typeof v === 'string';
        this.$gvalue = type ? Gio.DesktopAppInfo.new(v) : v;
        this.$value = type ? v : v.get_id();
        if(this.$gvalue) this.$btn.child.setContent(this.$gvalue.get_icon(), this.$gvalue.get_display_name());
        else this.$btn.child.setContent();
    }

    $genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this.$gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $genDialog() {
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
        if(param?.filter) this.$filter = new Gtk.FileFilter(param.filter);
        this.$param = param;
    }

    $genDialog() {
        let dialog = new Gtk.FileDialog({modal: true});
        if(this.$param?.title) dialog.set_title(this.$param.title);
        if(this.$filter) dialog.set_default_filter(this.$filter);
        return dialog;
    }

    $onDrop(_t, value) {
        if(!this.$filter) {
            this.value = value;
        } else {
            fquery(value, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
                if(this.$filter.match(y)) this.value = value; else throw Error();
            }).catch(() => {
                this.get_root().add_toast(new Adw.Toast({title: _('Mismatched filetype'), timeout: 5}));
            });
        }
    }

    $setValue(v) {
        let type = typeof v === 'string';
        this.$gvalue = type ? fopen(v) : v;
        this.$value = type ? v : v.get_path() ?? '';
        fquery(this.$gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this.$setContent(this.$value, x.get_icon(), x.get_display_name())).catch(() => this.$setContent(v));
    }

    $onClick() {
        this.dlg.set_initial_file(this.$gvalue);
        return this.dlg[this.$param?.select_folder ? 'select_folder' : 'open'](this.get_root(), null);
    }

    $setContent(value, icon, text) {
        if(value !== this.value) return;
        this.$btn.child.setContent(icon, text);
    }
}

export class Icon extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new IconLabel('image-missing'), Gio.ThemedIcon.$gtype, true);
    }

    $genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this.$gvalue, 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $setValue(v) {
        let type = typeof v === 'string';
        this.$gvalue = type ? Gio.ThemedIcon.new(v) : v;
        this.$value = type ? v : v.to_string();
        if(this.$gvalue) this.$btn.child.setContent(this.$value, this.$value.replace(/-symbolic$/, ''));
        else this.$btn.child.setContent();
    }

    $genDialog() {
        return new IconDialog();
    }
}

export class Keys extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(new Gtk.ShortcutLabel({disabled_text: _GTK('New accelerator…')}));
        this.$btn.set_has_frame(false);
        this.$param = param;
        this.value = this.shortcut ?? '';
    }

    get shortcut() {
        return this.$param?.gset.get_strv(this.$param?.key).at(0);
    }

    set shortcut(shortcut) {
        if(shortcut !== this.shortcut) this.$param?.gset.set_strv(this.$param?.key, [shortcut]);
    }

    $setValue(v) {
        this.$value = v;
        this.shortcut = v;
        this.$btn.child.set_accelerator(this.$value);
    }

    $genDialog() {
        return new KeysDialog({title: _GTK('New accelerator…')});
    }
}

export class PrefPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass(this);
    }

    constructor(param, prefs = new Adw.PreferencesGroup()) {
        super(param);
        this.addToGroup = row => prefs.add(row);
        this.add(prefs);
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
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(placeholder, tooltip, param) {
        super({valign: Gtk.Align.CENTER, hhomogeneous: true, ...param});
        this.$buildWidgets(placeholder, tooltip);
        this.value = '';
    }

    $buildWidgets(placeholder_text = '', tooltip_text = '') {
        this.$label = new Gtk.Entry({hexpand: true, sensitive: false, placeholder_text});
        this.$entry = hook({activate: () => { this.value = this.$entry.get_text(); }},
            new Gtk.Entry({hexpand: true, enable_undo: true, placeholder_text}));
        this.$edit = hook({clicked: () => { this.$entry.set_text(this.value); this.set_visible_child_name('entry'); }},
            new Gtk.Button({icon_name: 'document-edit-symbolic', tooltip_text}));
        this.$done = hook({clicked: () => { this.value = this.$entry.get_text(); }},
            new Gtk.Button({icon_name: 'object-select-symbolic', tooltip_text: _('Click or press ENTER to commit changes')}));
        this.add_named(new Box([this.$label, this.$edit], {hexpand: true}), 'label');
        this.add_named(new Box([this.$entry, this.$done], {hexpand: true}), 'entry');
        this.$done.add_css_class('suggested-action');
    }

    set value(value) {
        if(this.value !== value) {
            this.$label.set_text(this.$value = value);
            this.notify('value');
        }
        this.set_visible_child_name('label');
    }

    get value() {
        return this.$value;
    }

    vfunc_mnemonic_activate() {
        this.get_visible_child_name() === 'label' ? this.$edit.activate() : this.$done.activate();
    }
}
