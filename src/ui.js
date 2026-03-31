// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import Json from 'gi://Json';
import Pango from 'gi://Pango';
import GioUnix from 'gi://GioUnix';
import GObject from 'gi://GObject';
import * as Gettext from 'gettext';
import * as Extensions from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as T from './util.js';

const {hub, $, $s, $_, $$} = T;

Gio._promisify(Gtk.FileDialog.prototype, 'open');
Gio._promisify(Gtk.FileDialog.prototype, 'select_folder');

export const _ = Extensions.gettext;
export const _G = (x, y = 'gtk40') => Gettext.domain(y).gettext(x);
export const me = () => Extensions.ExtensionPreferences.lookupByURL(import.meta.url);

export const getv = 'value'; // Fallback Binding Key
export const esse = Symbol('Binding Key');
export const setv = Symbol('Set Binding Value');
export const dflt = Symbol('Default Binding Value');

export const once = (f, o, s = `notify::${o[esse]}`) => { let id = o.connect(s, () => { o.disconnect(id); f(); }); };
export const ptype = (o, p) => T.Y(f => c => c && (c[GObject.properties]?.[p]?.value_type || f(Object.getPrototypeOf(c))))(o.constructor);

export function enrol(klass, value = null, key = getv, pspec, ...args) {
    let proto = klass.prototype;
    let unzip = x => (y => y === Object(y) ? null : y)(T.unit(x).at(-1)); // {v|[..., v]} -> v
    T.enrol(klass, key in proto && !(esse in proto) ? pspec : {[key]: value, ...pspec}, ...args);
    Object.assign(proto, {[esse]: key, [dflt]: unzip(value), [setv](v) { this[this[esse]] = v ?? this[dflt]; }});
};

export class Prefs extends Extensions.ExtensionPreferences {
    static {
        T.load(`${T.ROOT}/resource/prefs.gresource`);
    }

    getPreferencesWidget() {
        if(this.$klass) return new this.$klass(this.getSettings());
    }

    fillPreferencesWindow(win) {
        win.set_search_enabled(true);
        return Promise.try(() => this.$buildWidgets(this.getSettings(), win))
            .then(xs => win[$s].add(xs)).catch(() => super.fillPreferencesWindow(win));
    }
}

export class Page extends Adw.PreferencesPage {
    static {
        T.enrol(this);
        this.sensitize = (a, b) => b.sensitive && a.bind_property(a[esse], b, 'sensitive', T.SYNC);
    }

    [hub] = {};

    #tie(gset, key, gobj, prop = gobj[esse]) {
        gobj[dflt] = gset.get_default_value(key).recursiveUnpack();
        if(ptype(gobj, prop) !== GObject.TYPE_JSOBJECT) {
            gset.bind(key, gobj, prop, Gio.SettingsBindFlags.DEFAULT);
        } else { // HACK: workaround for https://gitlab.gnome.org/GNOME/gjs/-/issues/397
            gobj[prop] = gset.get_value(key).recursiveUnpack();
            gobj.connect(`notify::${prop}`, () => gset.set_value(key, Json.gvariant_deserialize(Json.from_string(JSON.stringify(gobj[prop])), null)));
        }
        this[hub][key] = gobj;
    }

    constructor(gset) {
        super({useUnderline: true})[$]
            .$tie((xs, s = gset) => xs?.forEach?.(x => this.#tie(s, ...x)))[$_]
            .$tie(...Array(2).fill(this.$buildWidgets?.(gset)))[$_]
            .$add(...(x => [x, x && [null, x]])(this.$buildUI?.()));
    }

    $add(...groups) {
        groups.forEach(group => this.add(group instanceof Adw.PreferencesGroup ? group : T.str(group) ? this[hub][group]
            : new Adw.PreferencesGroup()[$$](grp => {
                let [[[title = '', description = ''], suffix = null], actions, param] = group[$_][0](group[0] === null, [[]]);
                grp[$].set({title, description, headerSuffix: T.str(suffix) ? this[hub][suffix] : suffix, ...param})[$s]
                    .add(actions.map(action => action instanceof Gtk.Widget ? action : T.str(action) ? this[hub][action]
                        : new Adw.ActionRow({useUnderline: true})[$$](act => {
                            let [pfx, [title_, subtitle = ''], ...sfx] = action.map(x => T.str(x) ? this[hub][x] : x)[$_].unshift(Array.isArray(action[0]), null);
                            sfx = sfx.flatMap(x => x instanceof Spin && x[hub] ? [x, new Gtk.Label({label: x[hub], cssClasses: ['dimmed']})] : [x]);
                            act[$].set({title: title_, subtitle})[$_].add_prefix(pfx, pfx)[$s]
                                .add_suffix(sfx[$_].forEach(pfx instanceof Check, x => Page.sensitize(pfx, x)))[$]
                                .set_activatable_widget(pfx instanceof Check ? pfx : sfx.find(x => !(x instanceof Help)) ?? null);
                        }))[$_].forEach(grp.headerSuffix instanceof Switch, x => Page.sensitize(grp.headerSuffix, x)));
            })));
    }
}

export class Box extends Gtk.Box {
    static {
        T.enrol(this);
        this.newV = (...xs) => new Box(...xs)[$].set({orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.FILL});
    }

    constructor(children, linked = true) {
        super({valign: Gtk.Align.CENTER})[$s].append(children?.filter(T.id))[$_].add_css_class(linked, 'linked');
    }
}

export class Spin extends Gtk.SpinButton {
    static {
        enrol(this, 0);
    }

    constructor(lower, upper, stepIncrement, unit, tooltipText = '') { // TODO: ? embed unit to Spin
        super({tooltipText, valign: Gtk.Align.CENTER, adjustment: new Gtk.Adjustment({lower, upper, stepIncrement})})[$_][hub](unit, unit);
    }
}

export class Switch extends Gtk.Switch {
    static {
        enrol(this, false, 'active');
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, ...param});
    }
}

export class Check extends Gtk.CheckButton {
    static {
        enrol(this, false, 'active');
    }

    static get pad() { return new Gtk.CheckButton({sensitive: false, opacity: 0}); }
}

export class Drop extends Gtk.DropDown {
    static {
        enrol(this, 0, 'selected');
    }

    constructor(strv, tooltipText = '') {
        super({model: Gtk.StringList.new(strv), valign: Gtk.Align.CENTER, tooltipText});
    }
}

export class Font extends Gtk.FontDialogButton {
    static {
        enrol(this, '');
    }

    constructor(param) {
        super({valign: Gtk.Align.CENTER, dialog: new Gtk.FontDialog(), ...param})
            .bind_property_full('font-desc', this, getv, T.BIND, (_b, v) => [true, v.to_string()],
                (_b, v) => [true, Pango.FontDescription.from_string(v)]);
    }
}

export class Help extends Gtk.MenuButton {
    static {
        T.enrol(this);
    }

    static typeset(build, param) {
        let keys = x => new Adw.ShortcutLabel({accelerator: x}),
            mark = (x, y, z) => new Gtk.Label({label: x, cssClasses: y ? T.unit(y) : [], useMarkup: true, halign: Gtk.Align.START, ...z}),
            dict = (a, n) => T.chunk(a, n).map(xs => xs.map((x, i) => i % 2 ? x : mark(`<b><tt>${x}</tt></b>`, null, {selectable: true}))).toArray(),
            head = (x, z) => mark(`<big>${x}</big>`, null, z)[$][hub](true),
            wrap = x => x instanceof Gtk.Widget ? x : mark(x);
        return Box.newV(build({k: keys, m: mark, d: dict, h: head}).flatMap(x => x[hub] ? [x, new Gtk.Separator()]
            : [new Gtk.Grid({vexpand: true, rowSpacing: 6, columnSpacing: 12, ...param})[$$](it => T.unit(x).forEach((y, i) => T.unit(y)
                .forEach((z, j) => z && it.attach(wrap(z), j, i, 1, 1))))]), false)[$].set({valign: Gtk.Align.START, spacing: 6});
    }

    constructor(build, param) {
        super({hasFrame: false, valign: Gtk.Align.CENTER, popover: new Gtk.Popover()})[$_].setup(build, build, param);
    }

    setup(build, param, error) {
        this.set_icon_name(error ? 'dialog-error-symbolic' : 'help-about-symbolic');
        once(() => {
            switch(T.type(build)) {
            case 'function': build = Help.typeset(build, param); break;
            case 'string': build = new Gtk.Label({label: build, ...param}); break;
            }
            this.popover.set_child(build);
        }, this.popover, 'notify::visible');
    }
}

export class Sign extends Gtk.Box {
    static {
        T.enrol(this);
    }

    constructor(icon, reverse, labelParam, iconParam) {
        super({spacing: 5})[$].set({$fallbackIcon: icon, $icon: new Gtk.Image(iconParam), $label: new Gtk.Label(labelParam)})[$s]
            .append([this.$icon, this.$label][$_].reverse(reverse));
    }

    setup(icon, label) {
        this.$label.set_label(label || _G('(None)'));
        if(icon instanceof Gio.Icon) this.$icon.set_from_gicon(icon);
        else this.$icon.set_from_icon_name(icon || this.$fallbackIcon);
    }
}

export class Dialog extends Adw.Window { // HACK: revert from Adw.Dialog since https://gitlab.gnome.org/GNOME/libadwaita/-/merge_requests/1415 breaks ECK on re-open
    static {
        T.enrol(this, null, {Signals: {chosen: {param_types: [GObject.TYPE_JSOBJECT]}}});
    }

    constructor(build) {
        super({widthRequest: 360, heightRequest: 320, modal: true, hideOnClose: true})[$]
            .add_controller(new Gtk.EventControllerKey()[$].connect('key-pressed', (...xs) => this.$onKeyPress(...xs)))[$s]
            .connect([['chosen', (_d, value) => this.$chosen?.resolve(value)], ['close-request', () => this.$chosen?.reject(Error('cancelled'))]])[$]
            .set_content(build instanceof Function ? this.$buildWidgets(build) : new Adw.ToolbarView({content: build})[$].add_top_bar(new Adw.HeaderBar({showTitle: false})));
    }

    $buildWidgets(build) {
        let {content, filter, title} = build(this), search,
            close = Gtk.Button.new_with_mnemonic(_G('_Cancel'))[$].connect('clicked', () => this.close()),
            select = Gtk.Button.new_with_mnemonic(_G('_OK'))[$].connect('clicked', () => this.$emitChosen())[$].add_css_class('suggested-action'),
            header = new Adw.HeaderBar({showEndTitleButtons: false, showStartTitleButtons: false, titleWidget: title || null})[$].pack_start(close)[$].pack_end(select);
        if(filter) {
            let entry = new Gtk.SearchEntry({halign: Gtk.Align.CENTER})[$].connect('search-changed', x => filter.set_search(x.get_text()));
            search = new Gtk.SearchBar({showCloseButton: false, child: entry, keyCaptureWidget: this})[$].connect_entry(entry);
            let button = new Gtk.ToggleButton({iconName: 'system-search-symbolic'})[$].bind_property('active', search, 'search-mode-enabled', T.BIND);
            this.connect('close-request', () => { button.set_active(false); content.scroll_to(0, Gtk.ListScrollFlags.FOCUS, null); });
            header.pack_end(button);
        }
        return Box.newV([header, search, new Gtk.ScrolledWindow({child: content})], false);
    }

    $onKeyPress(_w, key) {
        switch(key) {
        case Gdk.KEY_Escape: this.close(); break;
        case Gdk.KEY_Return:
        case Gdk.KEY_KP_Enter:
        case Gdk.KEY_ISO_Enter: this.$emitChosen(); break;
        }
    }

    $emitChosen(chosen = this.getChosen?.()) {
        this[$_].emit(chosen !== undefined, 'chosen', [chosen]).close();
    }

    choose(root, init) {
        return this[$_].set_transient_for(this.transientFor !== root, root)[$_]
            .initChosen(init !== undefined, init)[$].present()[$]
            .$chosen(Promise.withResolvers()).$chosen.promise;
    }
}

export class DialogButtonBase extends Box {
    static {
        enrol(this, '');
    }

    constructor(opt, child, reset, param) {
        super()[$].set({$opt: opt})[$]
            .prepend(this.$btn = new Gtk.Button({child, ...param})[$].connect('clicked', () => this.$onClick().then(x => this.$onSetv(x)).catch(T.nop)))[$_]
            .append(reset, reset && new Gtk.Button({iconName: 'edit-undo-symbolic', tooltipText: _G('Reset')})[$$](it => this.bind_property_full(getv, it,
                'visible', T.SYNC, (_b, v) => [true, v !== this[dflt]], null))[$].connect('clicked', () => this[setv]()))[$]
            .connect('mnemonic-activate', () => this.$btn.activate())
            .$buildDND(ptype(this, 'gvalue'));
    }

    $onClick() {
        return this.dlg.choose(this.get_root(), this.$getInitial?.() ?? this[getv]);
    }

    $onSetv([value]) {
        value.constructor === this[getv]?.constructor ? this[setv](value) : this.gvalue = value;
    }

    $buildDND(gtype) {
        if(!gtype) return;
        this.$onDrop ??= (_t, v) => { this.gvalue = v; };
        this.$onDrag ??= src => { let [x, y = this.gvalue] = T.unit(this.$genDrag()); src.set_icon(x, 8, 8); return Gdk.ContentProvider.new_for_value(y); };
        this[$].$bindGValue((to, from) => this.bind_property_full(getv, this, 'gvalue', T.BIND, to, from))[$]
            .connect('notify::gvalue', () => this.$onGValueSet?.(this.gvalue))
            .$btn[$s].add_controller([Gtk.DropTarget.new(gtype, Gdk.DragAction.COPY)[$].connect('drop', (...xs) => this.$onDrop(...xs)),
                new Gtk.DragSource({actions: Gdk.DragAction.COPY})[$].connect('prepare', (...xs) => this.$onDrag(...xs))]);
    }

    get dlg() {
        return (this.$dialog ??= this.$genDialog(this.$opt));
    }
}

export class App extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: GioUnix.DesktopAppInfo});
    }

    constructor(opt, param) {
        super(opt, new Sign('application-x-executable-symbolic'), true, param)[$]
            .$bindGValue((_b, v) => [true, GioUnix.DesktopAppInfo.new(v)], (_b, v) => [true, v?.get_id() ?? ''])[$]
            .$onGValueSet(v => this.$btn.child.setup(...v ? [v.get_icon(), v.get_display_name()] : []));
    }

    $genDrag() {
        return Icon.paintable(this.gvalue.get_icon());
    }

    $genDialog(opt) {
        return new Dialog(dlg => {
            let factory = new Gtk.SignalListItemFactory()[$s].connect([['setup', (_f, x) => x.set_child(new Sign('application-x-executable-symbolic')[$].marginStart(6))],
                    ['bind', (_f, x) => x.get_child().setup(...(y => [y.get_icon() || '', y.get_display_name()])(x.get_item()))]]),
                filter = Gtk.CustomFilter.new(null)[$].set({set_search: s => filter.set_filter_func(s ? (a => x => a.has(x.get_id()))(new Set(GioUnix.DesktopAppInfo.search(s).flat())) : null)}),
                list = new Gio.ListStore()[$].splice(0, 0, opt?.noDisplay ? Gio.AppInfo.get_all() : Gio.AppInfo.get_all().filter(x => x.should_show())),
                select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model: list, filter})}),
                content = new Gtk.ListView({model: select, factory, vexpand: true})[$].connect('activate', () => dlg.$emitChosen());
            dlg.getChosen = () => select.get_selected_item();
            return {content, filter};
        })[$].set({title: _G('Select Application')});
    }
}

export class File extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: Gio.File});
    }

    constructor(opt = {}, param, icon = 'document-open-symbolic') {
        if(opt.folder) opt.filter = {mimeTypes: ['inode/directory']};
        super(opt, new Sign(icon), true, param)[$_]
            .$filter(opt.filter, opt.filter && new Gtk.FileFilter(opt.filter))[$_]
            .insert_child_after(opt.open, opt.open && new Gtk.Button({iconName: 'document-open-symbolic'})[$]
                .connect('clicked', () => Gtk.FileLauncher.new(this.gvalue).launch(this.get_root(), null, null))[$$](it =>
                    this.bind_property_full(getv, it, 'visible', T.SYNC, (_b, v) => [true, !!v], null)), this.$btn)[$]
            .$bindGValue((_b, v) => [true, T.fopen(v)], (_b, v) => [true, v.get_path()])[$]
            .$onGValueSet(v => T.fquery(v, Gio.FILE_ATTRIBUTE_STANDARD_DISPLAY_NAME, Gio.FILE_ATTRIBUTE_STANDARD_ICON)
                .then(x => this.setup(x.get_icon(), x.get_display_name())).catch(() => this.setup()));
        if(opt.size) this.$btn.child.$label.set_use_markup(true);
    }

    $onSetv(v) {
        this.gvalue = v;
    }

    $genDialog() {
        return new Gtk.FileDialog({modal: true, title: this.$opt.title ?? '', defaultFilter: this.$filter ?? null});
    }

    $onClick() {
        return this.dlg[$].set_initial_file(this.gvalue)[this.$opt?.folder ? 'select_folder' : 'open'](this.get_root(), null);
    }

    $genDrag() {
        return [Icon.paintable(this.$btn.child.$icon.gicon), Gdk.FileList.new_from_list([this.gvalue])];
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

    setup(icon, text) {
        if(text && this.$opt.size) {
            let size = T.essay(() => GLib.format_size(this.gvalue.measure_disk_usage(Gio.FileMeasureFlags.NONE, null, null)[1]), () => '');
            text = `${T.esc(text)}${size && ` <span style="italic" alpha="50%">${size}</span>`}`;
        }
        this.$btn.child.setup(icon, text);
    }
}

export class Icon extends DialogButtonBase {
    static {
        T.enrol(this, {gvalue: Gio.ThemedIcon});
        this.Type = {ALL: 0, NORMAL: 1, SYMBOLIC: 2};
        this.paintable = (icon, size = 64) => icon && Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).lookup_by_gicon(icon, size, 1, Gtk.TextDirection.NONE, Gtk.IconLookupFlags.FORCE_SVG);
    }

    constructor(opt, param) {
        super(opt, new Sign('image-missing'), true, param)[$]
            .$bindGValue((_b, v) => [true, Gio.ThemedIcon.new(v)], (_b, v) => [true, v.to_string()])[$]
            .$onGValueSet(v => v ? this.$btn.child.setup(this.gvalue, this[getv].replace(/-symbolic$/, '')) : this.$btn.child.setup());
    }

    $genDrag() {
        return Icon.paintable(this.gvalue);
    }

    $genDialog(opt) {
        return new Dialog(dlg => {
            let factory = new Gtk.SignalListItemFactory()[$s].connect([['setup', (_f, x) => x.set_child(new Gtk.Image({iconSize: Gtk.IconSize.LARGE}))],
                    ['bind', (_f, {child, item}) => { child.iconName = child.tooltipText = item.string; }]]),
                filter = new Gtk.EveryFilter()[$s].append([new Gtk.BoolFilter(),
                    new Gtk.StringFilter({expression: new Gtk.PropertyExpression(Gtk.StringObject, null, 'string')})]),
                title = new Adw.ToggleGroup()[$s].add(['edit-clear-all-symbolic', 'image-x-generic', 'image-x-generic-symbolic'].map(x => new Adw.Toggle({iconName: x})))[$]
                    .set_active(opt?.type ?? Icon.Type.SYMBOLIC)[$]
                    .bind_property_full('active', filter.get_item(0), 'expression', T.SYNC, (_b, v) => {
                        switch(v) {
                        case Icon.Type.ALL: return [true, Gtk.ConstantExpression.new_for_value(true)];
                        case Icon.Type.NORMAL: return [true, new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => !x.string.endsWith('-symbolic'), null)];
                        case Icon.Type.SYMBOLIC: return [true, new Gtk.ClosureExpression(GObject.TYPE_BOOLEAN, x => x.string.endsWith('-symbolic'), null)];
                        }
                    }, null),
                model = Gtk.StringList.new(Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).get_icon_names()),
                select = new Gtk.SingleSelection({model: new Gtk.FilterListModel({model, filter})}),
                content = new Gtk.GridView({model: select, factory, vexpand: true})[$].connect('activate', () => dlg.$emitChosen());
            dlg.getChosen = () => select.get_selected_item().get_string();
            return {content, title, filter: filter.get_item(1)};
        });
    }
}

export class Keys extends DialogButtonBase {
    static {
        enrol(this, ['boxed', GLib.strv_get_type()]);
    }

    static get help() {
        return new Adw.StatusPage({
            iconName: 'preferences-desktop-keyboard-shortcuts-symbolic', title: _G('Enter the new shortcut', 'gnome-control-center-2.0'),
            description: _G('Press Esc to cancel or Backspace to disable the keyboard shortcut', 'gnome-control-center-2.0'),
        });
    }

    static validate(mask, keyval, keycode) { // from: https://gitlab.gnome.org/GNOME/gnome-control-center/-/blob/main/panels/keyboard/keyboard-shortcuts.c
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

    constructor(param) {
        super(null, new Adw.ShortcutLabel({disabledText: _G('New accelerator…')}), false, {hasFrame: false, ...param})
            .bind_property_full(getv, this.$btn.child, 'accelerator', GObject.BindingFlags.DEFAULT, (_b, v) => [true, v.join(' ')], null);
    }

    $genDialog() {
        return new Dialog(Keys.help)[$].set({
            $onKeyPress(_w, keyval, keycode, state) {
                let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
                if(!mask && keyval === Gdk.KEY_Escape) return void this.close();
                if(keyval === Gdk.KEY_BackSpace) return void this.$emitChosen([]);
                if(Keys.validate(mask, keyval, keycode)) this.$emitChosen([Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask)]);
            },
        });
    }
}

export class Entry extends Gtk.Stack {
    static {
        enrol(this, '');
    }

    constructor(placeholder, mime, tip) {
        super({valign: Gtk.Align.CENTER, hhomogeneous: true}).$buildWidgets(placeholder, mime, tip);
    }

    $buildWidgets(placeholderText = '', mime, tip = '') {
        let label = new Gtk.Entry({hexpand: true, sensitive: false, placeholderText}),
            apply = (from, to = label) => this.set_visible_child(to[$].set_text(from.text)[$_].grab_focus(to.sensitive).parent),
            entry = new Gtk.Entry({hexpand: true, enableUndo: true, secondaryIconName: mime ? 'document-open-symbolic' : '', placeholderText})[$_]
                .connect(mime, 'icon-press', mime && (w => new Gtk.FileDialog({modal: true, defaultFilter: new Gtk.FileFilter({mimeTypes: mime})})
                    .open(this.get_root(), null).then(x => w.set_text(x.get_path())).catch(T.nop)))[$].connect('activate', w => apply(w)),
            edit = new Gtk.Button({iconName: 'document-edit-symbolic', tooltipText: tip})[$].connect('clicked', () => apply(label, entry)),
            done = new Gtk.Button({cssClasses: ['suggested-action'], iconName: 'object-select-symbolic', tooltipText: _('Click or press ENTER to apply changes')})[$]
                .connect('clicked', () => apply(entry));
        this[$].add_controller(new Gtk.EventControllerFocus()[$].connect('leave', () => { if(this.get_visible_child() === done.parent) apply(label); }))[$]
            .connect('mnemonic-activate', () => this.get_visible_child() === edit.parent ? edit.activate() : done.activate())[$s]
            .add_child([[label, edit], [entry, done]].map(x => new Box(x)[$].set({hexpand: true})))
            .bind_property(getv, label, 'text', T.BIND);
    }
}
