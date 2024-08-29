// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import * as Gettext from 'gettext';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {Field} from './const.js';
import {BIND, fopen, omap, noop, fquery, hook, string} from './util.js';

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export {_};
export const _GTK = Gettext.domain('gtk40').gettext;
export const myself = () => ExtensionPreferences.lookupByURL(import.meta.url);
export const gprop = o => omap(o, ([k, [x, ...ys]]) => [[k, GObject.ParamSpec[x](k, k, k, GObject.ParamFlags.READWRITE, ...ys)]]);
export const vprop = (...xs) => ({Properties: gprop({value: [...xs]})});

/**
 * @template T
 * @param {T} o
 * @return {T}
 */
export const block = (o, s, p) => omap(o, ([k, v]) => [[k, (s.bind(Field[k], v, p?.[k] ?? 'value', Gio.SettingsBindFlags.DEFAULT), v)]]);

export class Broker {
    static #hooks = new WeakMap();
    static #binds = new WeakMap();

    static #get = (key, value, map) => {
        if(!map.has(key)) map.set(key, new WeakMap());
        if(!map.get(key).has(value)) map.get(key).set(value, []);
        return map.get(key).get(value);
    };

    static tie(source, sourceProp, target, targetProp, to = null, from = null, flag = GObject.BindingFlags.SYNC_CREATE) {
        this.#get(source, target, this.#binds).push(source.bind_property_full(sourceProp, target, targetProp, flag, to, from));
    }

    static untie(source, target) {
        this.#get(source, target, this.#binds).splice(0).forEach(x => x.unbind());
    }

    static attach(tracker, ...args) {
        args.forEach((x, i, a) => i % 2 || this.#get(tracker, x, this.#hooks).push(...Object.entries(a[i + 1]).map(ys => x.connect(...ys))));
    }

    static detach(tracker, ...args) {
        args.forEach(x => this.#get(tracker, x, this.#hooks).splice(0).forEach(y => x.disconnect(y)));
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

    constructor(lower, upper, stepIncrement, tooltipText = '', param) {
        super({tooltipText, valign: Gtk.Align.CENTER, adjustment: new Gtk.Adjustment({lower, upper, stepIncrement}), ...param});
    }
}

export class FoldRow extends Adw.ExpanderRow {
    static {
        GObject.registerClass(vprop('boolean', false), this);
    }

    constructor(title, subtitle, param) {
        super({title, subtitle, showEnableSwitch: true, ...param});
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

    static mock() {
        return new Gtk.CheckButton({inconsistent: true, sensitive: false});
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

    constructor(strv, tooltipText = '', param) {
        super({model: Gtk.StringList.new(strv), valign: Gtk.Align.CENTER, tooltipText, ...param});
        this.bind_property('selected', this, 'value', BIND);
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param});
        this.bind_property_full('value', this, 'font-desc', BIND, (_b, v) =>
            [true, Pango.FontDescription.from_string(v)], (_b, v) => [true, v.to_string()]);
    }
}

export class IconLabel extends Gtk.Box {
    static {
        GObject.registerClass(this);
    }

    constructor(fallbackIcon, reverse, labelParam, iconParam) {
        super({spacing: 5});
        this.$fallbackIcon = fallbackIcon;
        this.$icon = new Gtk.Image(iconParam);
        this.$label = new Gtk.Label(labelParam);
        if(reverse) [this.$label, this.$icon].forEach(x => this.append(x));
        else [this.$icon, this.$label].forEach(x => this.append(x));
    }

    setContent(icon, label) {
        this.$label.set_label(label || _GTK('(None)'));
        if(icon instanceof Gio.Icon) this.$icon.set_from_gicon(icon);
        else this.$icon.iconName = icon || this.$fallbackIcon;
    }
}

export class DialogBase extends Adw.Dialog {
    static {
        GObject.registerClass({
            Signals: {
                selected: {param_types: [GObject.TYPE_STRING]},
            },
        }, this);
    }

    constructor(title, opt, param) {
        super({title, contentWidth: 360, contentHeight: 320, ...param});
        this.connect('selected', (_d, value) => this.$chosen?.resolve(value));
        this.connect('closed', () => this.$chosen?.reject(Error('cancelled')));
        this.$buildContent(opt);
    }

    $buildContent(opt) {
        let {content, filter, title} = this.$buildWidgets(opt),
            eck = hook({'key-pressed': (...xs) => this.$onKeyPress(...xs)}, new Gtk.EventControllerKey()),
            close = hook({clicked: () => this.close()}, Gtk.Button.new_with_mnemonic(_GTK('_Cancel'))),
            select = hook({clicked: () => this.$onSelect()}, Gtk.Button.new_with_mnemonic(_GTK('_OK'))),
            header = new Adw.HeaderBar({showEndTitleButtons: false, showStartTitleButtons: false, titleWidget: title || null});
        select.add_css_class('suggested-action');
        this.add_controller(eck);
        header.pack_start(close);
        header.pack_end(select);

        let search;
        if(filter) {
            let button = new Gtk.ToggleButton({iconName: 'system-search-symbolic'});
            let entry = hook({'search-changed': x => filter.set_search(x.get_text())}, new Gtk.SearchEntry({halign: Gtk.Align.CENTER}));
            search = new Gtk.SearchBar({showCloseButton: false, child: entry, keyCaptureWidget: this});
            search.connect_entry(entry);
            button.bind_property('active', search, 'search-mode-enabled', BIND);
            this.connect('closed', () => { button.set_active(false); content.scroll_to(0, Gtk.ListScrollFlags.FOCUS, null); });
            header.pack_end(button);
        }
        this.set_child(new Box([header, search, new Gtk.ScrolledWindow({child: content})],
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
        this.$chosen = Promise.withResolvers();
        this.initSelected?.(initial);
        this.present(root);
        return this.$chosen.promise;
    }
}

export class AppDialog extends DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(opt, param) {
        super(_GTK('Select Application'), opt, param);
    }

    $buildWidgets(opt) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new IconLabel('application-x-executable-symbolic')),
                bind: (_f, x) => x.get_child().setContent(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
            }, new Gtk.SignalListItemFactory()),
            filter = Gtk.CustomFilter.new(null),
            model = new Gio.ListStore({itemType: Gio.DesktopAppInfo}),
            select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
            content = hook({activate: () => this.$onSelect()}, new Gtk.ListView({model: select, factory, vexpand: true}));
        model.splice(0, 0, opt?.noDisplay ? Gio.AppInfo.get_all() : Gio.AppInfo.get_all().filter(x => x.should_show()));
        filter.set_search = s => filter.set_filter_func(s ? (a => x => a.has(x.get_id()))(new Set(Gio.DesktopAppInfo.search(s).flat())) : null);
        this.getSelected = () => select.get_selected_item().get_id();
        return {content, filter};
    }
}

export class KeysDialog extends DialogBase {
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

    static {
        GObject.registerClass(this);
    }

    constructor(opt, param) {
        super('', opt, param);
    }

    $buildContent({title}) {
        this.set_child(new Adw.StatusPage({iconName: 'preferences-desktop-keyboard-symbolic', title}));
        this.add_controller(hook({'key-pressed': (...xs) => this.$onKeyPress(...xs)}, new Gtk.EventControllerKey()));
    }

    $onKeyPress(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this.close();
        if(keyval === Gdk.KEY_BackSpace) return this.$onSelect('');
        if(this.$validate(mask, keyval, keycode)) this.$onSelect(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
    }

    $validate(mask, keyval, keycode) {
        return KeysDialog.isValidAccel(mask, keyval) && KeysDialog.isValidBinding(mask, keycode, keyval);
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

    constructor(opt, param) {
        super('', opt, param);
    }

    $buildWidgets(opt) {
        let factory = hook({
                setup: (_f, x) => x.set_child(new Gtk.Image({iconSize: Gtk.IconSize.LARGE})),
                bind: (_f, {child, item}) => { child.iconName = child.tooltipText = item.string; },
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
        if(opt?.iconType) this.iconType = opt.iconType;
        this.getSelected = () => select.get_selected_item().get_string();
        return {content, title, filter: filter.get_item(1)};
    }

    $genIconExpression() {
        switch(this.iconType) {
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

    constructor(opt, param, child, gtype, reset) {
        super();
        this.$opt = opt;
        this.$btn = hook({clicked: () => this.$onClick().then(x => { this.value = x; }).catch(noop)}, new Gtk.Button({child, ...param}));
        if(gtype) this.$buildDND(gtype);
        if(reset) this.$buildReset();
        this.prepend(this.$btn);
        this.value = '';
    }

    $buildReset() {
        this.append(hook({clicked: () => { this.value = ''; }},
            new Gtk.Button({iconName: 'edit-clear-symbolic', tooltipText: _('Clear')})));
    }

    $buildDND(gtype) {
        this.$btn.add_controller(hook({drop: (...xs) => this.$onDrop(...xs)}, Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY)));
        this.$btn.add_controller(hook({prepare: (...xs) => this.$onDrag(...xs)}, new Gtk.DragSource({actions: Gdk.DragAction.COPY})));
    }

    $onDrag(src) {
        let icon = this.$genDragSwatch();
        if(icon) src.set_icon(icon, 0, 0);
        return Gdk.ContentProvider.new_for_value(this.$gvalue);
    }

    $onDrop(_t, value) {
        this.value = value;
    }

    get dlg() {
        return (this.$dialog ??= this.$genDialog(this.$opt));
    }

    $onClick() {
        return this.dlg.choose_sth(this.get_root());
    }

    $checkGvalue(gvalue) {
        return this.$gvalue?.equal(gvalue);
    }

    $setValue(value) {
        this.$value = value;
    }

    set value(value) {
        if(string(value) ? this.$value === value : this.$checkGvalue(value)) return;
        this.$setValue(value);
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

    constructor(opt, param) {
        super(opt, param, new IconLabel('application-x-executable-symbolic'), Gio.DesktopAppInfo.$gtype, true);
    }

    $setValue(value) {
        let type = string(value);
        this.$gvalue = type ? Gio.DesktopAppInfo.new(value) : value;
        this.$value = type ? value : value.get_id();
        if(this.$gvalue) this.$btn.child.setContent(this.$gvalue.get_icon(), this.$gvalue.get_display_name());
        else this.$btn.child.setContent();
    }

    $genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this.$gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $genDialog(opt) {
        return new AppDialog(opt);
    }
}

export class File extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(opt, param) {
        super(opt, param, new IconLabel('document-open-symbolic'), Gio.File.$gtype, true);
        if(opt?.folder) opt.filter = {mime_types:  ['inode/directory']};
        if(opt?.filter) this.$filter = new Gtk.FileFilter(opt.filter);
    }

    $genDialog() {
        return new Gtk.FileDialog({modal: true, title: this.$opt?.title ?? null, defaultFilter: this.$filter ?? null});
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

    $setValue(value) {
        let type = string(value);
        this.$gvalue = type ? fopen(value) : value;
        this.$value = type ? value : value.get_path() ?? '';
        fquery(this.$gvalue, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this.$setContent(this.$value, x.get_icon(), x.get_display_name())).catch(() => this.$setContent(value));
    }

    $onClick() {
        this.dlg.set_initial_file(this.$gvalue);
        return this.$opt?.folder ? this.dlg.select_folder(this.get_root(), null) : this.dlg.open(this.get_root(), null);
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

    constructor(opt, param) {
        super(opt, param, new IconLabel('image-missing'), Gio.ThemedIcon.$gtype, true);
    }

    $genDragSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default())
            .lookup_by_gicon(this.$gvalue, 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $setValue(value) {
        let type = string(value);
        this.$gvalue = type ? Gio.ThemedIcon.new(value) : value;
        this.$value = type ? value : value.to_string();
        if(this.$gvalue) this.$btn.child.setContent(this.$value, this.$value.replace(/-symbolic$/, ''));
        else this.$btn.child.setContent();
    }

    $genDialog(opt) {
        return new IconDialog(opt);
    }
}

export class Keys extends DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor({gset, key}, param) {
        super(null, {hasFrame: false, ...param}, new Gtk.ShortcutLabel({disabledText: _GTK('New accelerator…')}));
        this.$getShortcut = () => gset.get_strv(key).at(0);
        this.value = this.$getShortcut();
        this.$setShortcut = x => gset.set_strv(key, [x]);
    }

    $setValue(value) {
        this.$value = value;
        this.$setShortcut?.(value);
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
        let [prefix, [title, subtitle], ...suffix] = Array.isArray(args[0]) ? [null, ...args] : args;
        if(title) this.set_title(title);
        if(subtitle) this.set_subtitle(subtitle);
        if(prefix) this.add_prefix(prefix);
        if(prefix instanceof Gtk.CheckButton && prefix.sensitive) {
            this.set_activatable_widget(prefix);
            suffix.forEach(x => {
                this.add_suffix(x);
                prefix.bind_property('active', x, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
            });
        } else if(suffix.length) {
            suffix.forEach(x => this.add_suffix(x));
            this.set_activatable_widget(suffix.find(x => !(x instanceof Gtk.MenuButton)) ?? null);
        }
    }
}

export class Entry extends Gtk.Stack {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(placeholder, open, tooltip, param) {
        super({valign: Gtk.Align.CENTER, hhomogeneous: true, ...param});
        this.$buildWidgets(placeholder, open, tooltip);
    }

    $buildWidgets(placeholderText = '', open, tooltipText = '') {
        let label = new Gtk.Entry({hexpand: true, sensitive: false, placeholderText}),
            apply = w => { label.set_text(w.text); this.set_visible_child(label.parent); },
            entry = open ? hook({
                activate: w => apply(w),
                'icon-press': w => new Gtk.FileDialog({modal: true}).open(this.get_root(), null).then(x => w.set_text(x.get_path())).catch(noop),
            }, new Gtk.Entry({hexpand: true, enableUndo: true, secondaryIconName: 'document-open-symbolic', placeholderText}))
                : hook({activate: w => apply(w)}, new Gtk.Entry({hexpand: true, enableUndo: true, placeholderText})),
            edit = hook({clicked: () => { entry.set_text(label.text); entry.grab_focus(); this.set_visible_child(entry.parent); }},
                new Gtk.Button({iconName: 'document-edit-symbolic', tooltipText})),
            done = hook({clicked: () => apply(entry)}, new Gtk.Button({
                cssClasses: ['suggested-action'],
                iconName: 'object-select-symbolic',
                tooltipText: _('Click or press ENTER to apply changes'),
            }));
        [[label, edit], [entry, done]].forEach(x => this.add_child(new Box(x, {hexpand: true})));
        this.$toggle = () => this.get_visible_child() === edit.parent ? edit.activate() : done.activate();
        this.bind_property('value', label, 'text', BIND);
    }

    vfunc_mnemonic_activate() {
        this.$toggle();
    }
}
