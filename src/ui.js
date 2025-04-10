// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import GObject from 'gi://GObject';
import * as Gettext from 'gettext';
import * as Extensions from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as T from './util.js';

const {BIND} = T;

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export const _ = Extensions.gettext;
export const _G = (x, y = 'gtk40') => Gettext.domain(y).gettext(x);
export const me = () => Extensions.ExtensionPreferences.lookupByURL(import.meta.url);

export const setv = Symbol('Set Value');
export const getv = Symbol('Get Default Value');
export const esse = Symbol('Default Binding Key');

export const once = (o, f, s = 'notify::value') => { let id = o.connect(s, () => { o.disconnect(id); f(); }); };
export const gtype = (o, v) => o.constructor[GObject.properties]?.[v]?.value_type;
export const enrol = (c, v) => T.enrol(c, {value: v ?? null});

export class Prefs extends Extensions.ExtensionPreferences {
    constructor(...args) {
        T.load(`${T.ROOT}/resource/prefs.gresource`);
        super(...args);
    }

    getPreferencesWidget() {
        if(this.$klass) return new this.$klass(this.getSettings());
    }
}

export class Page extends Adw.PreferencesPage {
    static {
        T.enrol(this);
    }

    #bind(gset, key, gobj, prop) {
        prop ??= gobj[esse] ?? 'value';
        gobj[getv] = gset.get_default_value(key).recursiveUnpack();
        gobj[setv] = val => { gobj[prop] = val ?? gobj[getv]; };
        if(gtype(gobj, prop) !== GObject.TYPE_JSOBJECT) {
            gset.bind(key, gobj, prop, Gio.SettingsBindFlags.DEFAULT);
        } else { // HACK: workaround for https://gitlab.gnome.org/GNOME/gjs/-/issues/397
            gobj[prop] = gset.get_value(key).recursiveUnpack();
            gobj.connect(`notify::${prop}`, () => gset.set_value(key, gobj.$picklev?.() ?? T.pickle(gobj[prop], false)));
        }
        return gobj;
    }

    #tie = (a, s) => Object.fromEntries(a.map(([k, o, p]) => [k, this.#bind(s, k, o, p)]));

    constructor(gset, param) {
        super({useUnderline: true, ...param});
        this.$tie = (x, s = gset) => { if(Array.isArray(x)) this.$blk = Object.assign(this.#tie(x, s), this.$blk); };
        T.seq(x => x && this.$tie(x), this.$buildWidgets?.(gset));
        T.seq(x => x && this.$add([null, x]), this.$buildUI?.());
    }

    $add(...grps) {
        let sensitize = (a, b) => a.bind_property(a[esse], b, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        grps.forEach(grp => this.add(grp instanceof Adw.PreferencesGroup ? grp : T.str(grp) ? this.$blk[grp] : T.seq(g => {
            let [[[title = '', subtitle = ''], suffix = null], rows, param] = (grp[0] ??= [[]], grp);
            g.set({title, description: subtitle, headerSuffix: T.str(suffix) ? this.$blk[suffix] : suffix, ...param});
            rows = rows.map(row => row instanceof Gtk.Widget ? row : T.str(row) ? this.$blk[row] : T.seq(r => {
                row = row.map(x => T.str(x) ? this.$blk[x] : x);
                let [prefix, [title_, subtitle_ = ''], ...suffix1] = (Array.isArray(row[0]) && row.unshift(null), row);
                r.set({title: title_, subtitle: subtitle_});
                if(prefix) r.add_prefix(prefix);
                if(prefix instanceof Check) {
                    r.set_activatable_widget(prefix);
                    suffix1.forEach(x => { r.add_suffix(x); sensitize(prefix, x); });
                } else if(suffix1.length) {
                    r.set_activatable_widget(suffix1.find(x => !(x instanceof Help)) ?? null);
                    suffix1.forEach(x => r.add_suffix(x));
                }
            }, new Adw.ActionRow({useUnderline: true})));
            if(g.headerSuffix instanceof Switch) rows.forEach(r => { g.add(r); sensitize(g.headerSuffix, r); });
            else rows.forEach(r => g.add(r));
        }, new Adw.PreferencesGroup())));
    }
}

export class Box extends Gtk.Box {
    static {
        T.enrol(this);
    }

    static newV = (cs, p, ...xs) => new Box(cs, {orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.FILL, ...p}, ...xs);

    constructor(children, param, linked = true) {
        super({valign: Gtk.Align.CENTER, ...param});
        children?.forEach(x => x && this.append(x));
        if(linked) this.add_css_class('linked');
    }
}

export class Spin extends Gtk.SpinButton {
    static unit = x => new Gtk.Label({label: x, cssClasses: ['dimmed']}); // TODO: ? embed to Spin

    static {
        T.enrol(this);
    }

    constructor(lower, upper, stepIncrement, tooltipText = '', param) {
        super({tooltipText, valign: Gtk.Align.CENTER, adjustment: new Gtk.Adjustment({lower, upper, stepIncrement}), ...param});
    }
}

export class Switch extends Gtk.Switch {
    static {
        T.enrol(this);
    }

    [esse] = 'active';

    constructor(param) {
        super({valign: Gtk.Align.CENTER, ...param});
    }
}

export class Check extends Gtk.CheckButton {
    static get pad() { return new Gtk.CheckButton({sensitive: false, opacity: 0}); }

    static {
        T.enrol(this);
    }

    [esse] = 'active';
}

export class Drop extends Gtk.DropDown {
    static {
        T.enrol(this);
    }

    [esse] = 'selected';

    constructor(strv, tooltipText = '', param) {
        super({model: Gtk.StringList.new(strv), valign: Gtk.Align.CENTER, tooltipText, ...param});
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        enrol(this, '');
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param});
        this.bind_property_full('font-desc', this, 'value', BIND, (_b, x) => [true, x.to_string()], (_b, x) => [true, Pango.FontDescription.from_string(x)]);
    }
}

export class Help extends Gtk.MenuButton {
    static {
        T.enrol(this);
    }

    static typeset(build, param) {
        let keys = x => new Gtk.ShortcutLabel({accelerator: x}),
            mark = (x, y, z) => new Gtk.Label({label: x, cssClasses: y ? T.unit(y) : [], useMarkup: true, halign: Gtk.Align.START, ...z}),
            dict = (a, n = 2) => T.array(Math.ceil(a.length / n), () => a.splice(0, n).map((x, i) => i % 2 ? x : mark(`<b><tt>${x}</tt></b>`, null, {selectable: true}))),
            head = (x, z) => mark(`<big>${x}</big>`, null, z),
            wrap = x => x instanceof Gtk.Widget ? x : mark(x);
        return Box.newV(build({k: keys, m: mark, d: dict, h: head}).map(x => T.seq(w => T.unit(x).forEach((y, i) =>
            T.unit(y).forEach((z, j) => z && w.attach(wrap(z), j, i, 1, 1))), new Gtk.Grid({vexpand: true, rowSpacing: 4, columnSpacing: 12}))),
        {valign: Gtk.Align.START, spacing: 6, ...param}, false);
    }

    constructor(help, param, param1) {
        super({hasFrame: false, valign: Gtk.Align.CENTER, popover: new Gtk.Popover(), ...param1});
        if(help) this.setup(help, param);
    }

    setup(help, param, error) {
        switch(T.type(help)) {
        case 'function': help = Help.typeset(help, param); break;
        case 'string': help = new Gtk.Label({label: help, ...param}); break;
        }
        this.popover.set_child(help);
        this.set_icon_name(error ? 'dialog-error-symbolic' : 'help-about-symbolic');
    }
}

export class Sign extends Gtk.Box {
    static {
        T.enrol(this);
    }

    constructor(fallbackIcon, reverse, labelParam, iconParam) {
        super({spacing: 5});
        this.$fallbackIcon = fallbackIcon;
        this.$icon = new Gtk.Image(iconParam);
        this.$label = new Gtk.Label(labelParam);
        if(reverse) [this.$label, this.$icon].forEach(x => this.append(x));
        else [this.$icon, this.$label].forEach(x => this.append(x));
    }

    setup(icon, label) {
        this.$label.set_label(label || _G('(None)'));
        if(icon instanceof Gio.Icon) this.$icon.set_from_gicon(icon);
        else this.$icon.iconName = icon || this.$fallbackIcon;
    }
}

export class Dialog extends Adw.Window { // FIXME: revert from Adw.Dialog since https://gitlab.gnome.org/GNOME/libadwaita/-/merge_requests/1415 breaks ECK on close
    static {
        T.enrol(this, null, {Signals: {chosen: {param_types: [GObject.TYPE_JSOBJECT]}}});
    }

    constructor(build, param) {
        super({widthRequest: 360, heightRequest: 320, modal: true, hideOnClose: true, ...param});
        this.connect('chosen', (_d, value) => this.$chosen?.resolve(value));
        this.connect('close-request', () => this.$chosen?.reject(Error('cancelled')));
        this.add_controller(T.hook({'key-pressed': (...xs) => this.$onKeyPress(...xs)}, new Gtk.EventControllerKey()));
        this.$buildContent(build);
    }

    $buildContent(build) {
        this.set_content(build instanceof Gtk.Widget ? T.seq(w => w.add_top_bar(new Adw.HeaderBar({showTitle: false})),
            new Adw.ToolbarView({content: build})) : this.$buildWidgets(build));
    }

    $buildWidgets(build) {
        let {content, filter, title} = build(this), search,
            close = T.hook({clicked: () => this.close()}, Gtk.Button.new_with_mnemonic(_G('_Cancel'))),
            select = T.hook({clicked: () => this.$onChosen()}, Gtk.Button.new_with_mnemonic(_G('_OK'))),
            header = new Adw.HeaderBar({showEndTitleButtons: false, showStartTitleButtons: false, titleWidget: title || null});
        select.add_css_class('suggested-action');
        header.pack_start(close);
        header.pack_end(select);
        if(filter) {
            let button = new Gtk.ToggleButton({iconName: 'system-search-symbolic'});
            let entry = T.hook({'search-changed': x => filter.set_search(x.get_text())}, new Gtk.SearchEntry({halign: Gtk.Align.CENTER}));
            search = new Gtk.SearchBar({showCloseButton: false, child: entry, keyCaptureWidget: this});
            search.connect_entry(entry);
            button.bind_property('active', search, 'search-mode-enabled', BIND);
            this.connect('close-request', () => { button.set_active(false); content.scroll_to(0, Gtk.ListScrollFlags.FOCUS, null); });
            header.pack_end(button);
        }
        return Box.newV([header, search, new Gtk.ScrolledWindow({child: content})], null, false);
    }

    $onKeyPress(_w, key) {
        switch(key) {
        case Gdk.KEY_Escape: this.close(); break;
        case Gdk.KEY_Return:
        case Gdk.KEY_KP_Enter:
        case Gdk.KEY_ISO_Enter: this.$onChosen(); break;
        }
    }

    $onChosen(chosen = this.getChosen?.()) {
        if(chosen !== undefined) this.emit('chosen', [chosen]);
        this.close();
    }

    choose(root, initial) {
        this.$chosen = Promise.withResolvers();
        if(this.transient_for !== root) this.set_transient_for(root);
        this.present();
        this.initChosen?.(initial);
        return this.$chosen.promise;
    }
}

export class DialogButtonBase extends Box {
    static {
        enrol(this, '');
    }

    constructor(opt, child, reset, param) {
        super();
        this.$opt = opt;
        this[setv] = v => { this.value = v; };
        if(reset) this.append(T.hook({clicked: () => this[setv]()}, new Gtk.Button({iconName: 'edit-clear-symbolic', tooltipText: _G('Reset')})));
        this.prepend(this.$btn = T.hook({clicked: () => this.$onClick().then(x => this.$onSetv(x)).catch(T.nop)}, new Gtk.Button({child, ...param})));
        this.$buildDND(gtype(this, 'gvalue'));
    }

    $onClick() {
        return this.dlg.choose(this.get_root(), this.$getInitial?.() ?? this.value);
    }

    $onSetv([value]) {
        value.constructor === this.value?.constructor ? this[setv](value) : this.gvalue = value;
    }

    $buildDND(gType) {
        if(!gType) return;
        this.$onDrop = (_t, v) => { this.gvalue = v; };
        this.$onDrag = src => { T.seq(x => x && src.set_icon(x, 10, 10), this.$genSwatch?.()); return Gdk.ContentProvider.new_for_value(this.gvalue); };
        this.$btn.add_controller(T.hook({drop: (...xs) => this.$onDrop(...xs)}, Gtk.DropTarget.new(gType, Gdk.DragAction.COPY)));
        this.$btn.add_controller(T.hook({prepare: (...xs) => this.$onDrag(...xs)}, new Gtk.DragSource({actions: Gdk.DragAction.COPY})));
        this.$bindv = (to, from) => this.bind_property_full('value', this, 'gvalue', BIND, to, from);
        this.connect('notify::gvalue', () => this.$onGValueSet?.(this.gvalue));
    }

    get dlg() {
        return (this.$dialog ??= this.$genDialog(this.$opt));
    }

    vfunc_mnemonic_activate() {
        this.$btn.activate();
    }
}

export class App extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: Gio.DesktopAppInfo});
    }

    constructor(opt, param) {
        super(opt, new Sign('application-x-executable-symbolic'), true, param);
        this.$bindv((_b, x) => [true, Gio.DesktopAppInfo.new(x)], (_b, x) => [true, x?.get_id() ?? '']);
        this.$onGValueSet = v => this.$btn.child.setup(...v ? [v.get_icon(), v.get_display_name()] : []);
    }

    $genSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).lookup_by_gicon(this.gvalue.get_icon(), 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $genDialog(opt) {
        return new Dialog(dlg => {
            let factory = T.hook({
                    setup: (_f, x) => x.set_child(new Sign('application-x-executable-symbolic')),
                    bind: (_f, x) => x.get_child().setup(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item())),
                }, new Gtk.SignalListItemFactory()),
                filter = Gtk.CustomFilter.new(null),
                list = new Gio.ListStore({itemType: Gio.DesktopAppInfo}),
                select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model: list, filter})}),
                content = T.hook({activate: () => dlg.$onChosen()}, new Gtk.ListView({model: select, factory, vexpand: true}));
            list.splice(0, 0, opt?.noDisplay ? Gio.AppInfo.get_all() : Gio.AppInfo.get_all().filter(x => x.should_show()));
            filter.set_search = s => filter.set_filter_func(s ? (a => x => a.has(x.get_id()))(new Set(Gio.DesktopAppInfo.search(s).flat())) : null);
            dlg.getChosen = () => select.get_selected_item();
            return {content, filter};
        }, {title: _G('Select Application')});
    }
}

export class File extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: Gio.File});
    }

    constructor(opt, param, icon = 'document-open-symbolic') {
        super(opt, new Sign(icon), true, param);
        if(opt?.folder) opt.filter = {mimeTypes:  ['inode/directory']};
        if(opt?.filter) this.$filter = new Gtk.FileFilter(opt.filter);
        if(opt?.size) this.$btn.child.$label.set_use_markup(true);
        if(opt?.open) {
            this.insert_child_after(T.hook({clicked: () => Gtk.FileLauncher.new(this.gvalue).launch(this.get_root(), null, null)},
                new Gtk.Button({iconName: 'document-open-symbolic'})), this.$btn);
        }
        this.$onSetv = x => { this.gvalue = x; };
        this.$bindv((_b, x) => [true, T.fopen(x)], (_b, x) => [true, x.get_path()]);
        this.$onGValueSet = v => T.fquery(v, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
            .then(x => this.setup(x.get_icon(), x.get_display_name())).catch(() => this.setup());
    }

    $genDialog() {
        return new Gtk.FileDialog({modal: true, title: this.$opt?.title ?? null, defaultFilter: this.$filter ?? null});
    }

    $onDrop(_t, file) {
        if(!this.$filter) {
            this.gvalue = file;
        } else {
            T.fquery(file, Gio.FILE_ATTRIBUTE_STANDARD_CONTENT_TYPE).then(y => {
                if(this.$filter.match(y)) this.gvalue = file; else throw Error();
            }).catch(() => {
                this.get_root().add_toast(new Adw.Toast({title: _('Mismatched filetype'), timeout: 7}));
            });
        }
    }

    $onClick() {
        this.dlg.set_initial_file(this.gvalue);
        return this.$opt?.folder ? this.dlg.select_folder(this.get_root(), null) : this.dlg.open(this.get_root(), null);
    }

    setup(icon, text) {
        if(this.$opt.size) {
            let size = T.essay(() => GLib.format_size(this.gvalue.measure_disk_usage(Gio.FileMeasureFlags.NONE, null, null)[1]), () => '');
            text = `${T.escape(text)}${size && ` <span style="italic" alpha="50%">${size}</span>`}`;
        }
        this.$btn.child.setup(icon, text);
    }
}

export class Icon extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: Gio.ThemedIcon});
    }

    static Type = {ALL: 0, NORMAL: 1, SYMBOLIC: 2};

    constructor(opt, param) {
        super(opt, new Sign('image-missing'), true, param);
        this.$bindv((_b, x) => [true, Gio.ThemedIcon.new(x)], (_b, x) => [true, x.to_string()]);
        this.$onGValueSet = v => v ? this.$btn.child.setup(this.gvalue, this.value.replace(/-symbolic$/, '')) : this.$btn.child.setup();
    }

    $genSwatch() {
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).lookup_by_gicon(this.gvalue, 32, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    $genDialog(opt) {
        return new Dialog(dlg => {
            let factory = T.hook({
                    setup: (_f, x) => x.set_child(new Gtk.Image({iconSize: Gtk.IconSize.LARGE})),
                    bind: (_f, {child, item}) => { child.iconName = child.tooltipText = item.string; },
                }, new Gtk.SignalListItemFactory()),
                filter = T.seq(w => [new Gtk.StringFilter({expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string')}),
                    new Gtk.BoolFilter()].forEach(x => w.append(x)), new Gtk.EveryFilter()),
                title = T.seq(w => ['image-missing', 'image-x-generic', 'image-x-generic-symbolic'].forEach(x =>
                    w.add(new Adw.Toggle({iconName: x}))), new Adw.ToggleGroup()),
                model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names()),
                select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
                content = T.hook({activate: () => dlg.$onChosen()}, new Gtk.GridView({model: select, factory, vexpand: true}));
            title.set_active(opt?.type ?? Icon.Type.SYMBOLIC);
            title.bind_property_full('active', filter.get_item(1), 'expression', GObject.BindingFlags.SYNC_CREATE, (_b, x) => {
                switch(x) {
                case Icon.Type.ALL: return [true, Gtk.ConstantExpression.new_for_value(true)];
                case Icon.Type.NORMAL: return [true, new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, y => !y.string.endsWith('-symbolic'), null)];
                case Icon.Type.SYMBOLIC: return [true, new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, y => y.string.endsWith('-symbolic'), null)];
                }
            }, null);
            dlg.getChosen = () => select.get_selected_item().get_string();
            return {content, title, filter: filter.get_item(0)};
        });
    }
}

export class Keys extends DialogButtonBase {
    static genStatusPage() {
        return new Adw.StatusPage({
            iconName: 'preferences-desktop-keyboard-shortcuts-symbolic', title: _G('Enter the new shortcut', 'gnome-control-center-2.0'),
            description: _G('Press Esc to cancel or Backspace to disable the keyboard shortcut', 'gnome-control-center-2.0'),
        });
    }

    static {
        enrol(this);
    }

    constructor(param) {
        super(null, new Gtk.ShortcutLabel({disabledText: _G('New accelerator…')}), false, {hasFrame: false, ...param});
        this.connect('notify::value', () => this.$btn.child.set_accelerator(this.value?.[0] ?? ''));
        this.$picklev = () => new GLib.Variant('as', this.value);
    }

    $validate(mask, keyval, keycode) { // from: https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/main/panels/keyboard/keyboard-shortcuts.c
        return (Gtk.accelerator_valid(keyval, mask) || (keyval === Gdk.KEY_Tab && mask !== 0)) &&
            !(mask === 0 || mask === Gdk.SHIFT_MASK && keycode !== 0 &&
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
                (keyval === Gdk.KEY_space && mask === 0) || [Gdk.KEY_Home, Gdk.KEY_Left, Gdk.KEY_Up, Gdk.KEY_Right, Gdk.KEY_Down, Gdk.KEY_Page_Up,
                    Gdk.KEY_Page_Down, Gdk.KEY_End, Gdk.KEY_Tab, Gdk.KEY_KP_Enter, Gdk.KEY_Return, Gdk.KEY_Mode_switch].includes(keyval)));
    }

    $genDialog() {
        return T.seq(dlg => {
            dlg.$onKeyPress = (_w, keyval, keycode, state) => {
                let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
                if(!mask && keyval === Gdk.KEY_Escape) return dlg.close();
                if(keyval === Gdk.KEY_BackSpace) return dlg.$onChosen([]);
                if(this.$validate(mask, keyval, keycode)) dlg.$onChosen([Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask)]);
            };
        }, new Dialog(Keys.genStatusPage()));
    }
}

export class Entry extends Gtk.Stack {
    static {
        enrol(this, '');
    }

    constructor(placeholder, mime, tooltip, param) {
        super({valign: Gtk.Align.CENTER, hhomogeneous: true, ...param});
        this.$buildWidgets(placeholder, mime, tooltip);
    }

    $buildWidgets(placeholderText = '', mimeTypes, tooltipText = '') {
        let label = new Gtk.Entry({hexpand: true, sensitive: false, placeholderText}),
            apply = w => { label.set_text(w.text); this.set_visible_child(label.parent); },
            entry = mimeTypes ? T.hook({
                activate: w => apply(w),
                'icon-press': w => new Gtk.FileDialog({modal: true, defaultFilter: new Gtk.FileFilter({mimeTypes})})
                                .open(this.get_root(), null).then(x => w.set_text(x.get_path())).catch(T.nop),
            }, new Gtk.Entry({hexpand: true, enableUndo: true, secondaryIconName: 'document-open-symbolic', placeholderText}))
                : T.hook({activate: w => apply(w)}, new Gtk.Entry({hexpand: true, enableUndo: true, placeholderText})),
            edit = T.hook({clicked: () => { entry.set_text(label.text); entry.grab_focus(); this.set_visible_child(entry.parent); }},
                new Gtk.Button({iconName: 'document-edit-symbolic', tooltipText})),
            done = T.hook({clicked: () => apply(entry)}, new Gtk.Button({
                cssClasses: ['suggested-action'], iconName: 'object-select-symbolic', tooltipText: _('Click or press ENTER to apply changes'),
            }));
        [[label, edit], [entry, done]].forEach(x => this.add_child(new Box(x, {hexpand: true})));
        this.$toggle = () => this.get_visible_child() === edit.parent ? edit.activate() : done.activate();
        this.bind_property('value', label, 'text', BIND);
    }

    vfunc_mnemonic_activate() {
        this.$toggle();
    }
}
