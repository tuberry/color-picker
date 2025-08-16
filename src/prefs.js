// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import * as T from './util.js';

import Color from './color.js';
import {Key as K, Preset, HEX} from './const.js';

const {$, $$} = T;
const {_, _G} = UI;

class Key extends UI.DialogButtonBase {
    static {
        T.enrol(this);
    }

    constructor(param) {
        super(null, new Adw.ShortcutLabel({disabledText: _('(Key)')}), true, param)
            .bind_property('value', this.$btn.child, 'accelerator', GObject.BindingFlags.SYNC_CREATE);
    }

    $genDialog() {
        return new UI.Dialog(UI.Keys.help)[$].set({
            $onKeyPress(_w, keyval, keycode, state) {
                let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
                if(!mask && keyval === Gdk.KEY_Escape) return this.close();
                this.$onChosen(keyval === Gdk.KEY_BackSpace ? '' : Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
            },
        });
    }
}

class PrefsBasic extends UI.Page {
    static {
        T.enrol(this);
    }

    $buildWidgets(gset) {
        let fmt = () => Preset.concat(gset.get_value(K.CFMT).recursiveUnpack().flatMap(x => x.enable ? [x.name] : []));
        this.$tie([
            [K.QKEY, new Key()],
            [K.MKEY, new Key()],
            [K.KEYS, new UI.Keys()],
            [K.COPY, new UI.Check()],
            [K.NTF,  new UI.Check()],
            [K.FMT,  new UI.Check()],
            [K.PVW,  new UI.Check()],
            [K.KEY,  new UI.Check()],
            [K.SND,  new UI.Check()],
            [K.STRY, new UI.Check()],
            [K.PRST, new UI.Check()],
            [K.MENU, new UI.Check()],
            [K.FMTS, new UI.Drop(fmt())],
            [K.NTFS, new UI.Drop([_('MSG'), _('OSD')])],
            [K.PVWS, new UI.Drop([_('Lens'), _('Label')])],
            [K.TICN, new UI.Icon(null, {tooltipText: _('Systray icon')})],
            [K.MNSZ, new UI.Spin(0, 16, 1, '', _('History and collection size'))],
            [K.SNDS, new UI.Drop([_('Screenshot'), _('Complete')], _('Sound effect'))],
        ]);
        gset.connect(`changed::${K.CFMT}`, () => void T.seq(this[T.hub][K.FMTS].selected,
            x => this[T.hub][K.FMTS][$].set_model(Gtk.StringList.new(fmt()))[$].selected(x)));
    }

    $buildUI() {
        return [
            [K.COPY, [_('_Automatically copy'), _('Copy the color to clipboard after picking')]],
            [K.FMT,  [_('_Default format'), _('Also apply to the first Format menu item')], K.FMTS],
            [K.STRY, [_('_Enable systray'), _('Secondary click to open menu')], new UI.Help(({h, k}) => [h(_('Menu shortcuts')), [
                [_('toggle history/collection'), k('Shift_R')],
                [_('trigger the toolbar button'), k('<alt>1...9')],
            ], h(_('Menu item shortcuts')), [
                [_('copy the color'), k('space Return'), _('primary click')],
                [_('remove the color'), k('BackSpace Delete'), _('middle click')],
                [_('trigger the tail button'), k('Control_L'), _('secondary click')],
            ]]), K.TICN, K.MNSZ],
            [K.KEY,  [_('E_nable shortcut'), _('Primary click or press Enter / Space key to pick')], K.KEYS],
            [K.MENU, [_('F_ormat menu'), _('Middle click or press Menu key to open')], K.MKEY],
            [K.PRST, [_('_Persistent mode'), _('Secondary click or press Esc key to quit')], K.QKEY],
            [K.PVW,  [_('P_review style'), _('Press arrow keys / wasd / hjkl to move by pixel and hold Ctrl key to accelerate')],
                new UI.Help(({h, k}) => [h(_('Shortcuts')), [[_('toggle when picking'), k('<shift>'), _('scroll')]]]), K.PVWS],
            [K.NTF,  [_('No_tification style'), _('Notify the color after picking')], K.NTFS],
            [K.SND,  [_('Not_ification sound'), _('Play the sound after picking')], K.SNDS],
        ];
    }
}

class FormatItem extends GObject.Object {
    static {
        T.enrol(this, {name: '', format: '', enable: false});
    }

    constructor(fmt) {
        super().set(fmt);
    }

    toggle() { this.enable = !this.enable; }
    dump() { return (({enable, name, format}) => ({enable, name, format}))(this); }
}

class FormatRow extends Adw.ActionRow {
    static {
        T.enrol(this, null, {
            Signals: {
                toggled: {param_types: [GObject.TYPE_UINT]},
                changed: {param_types: [GObject.TYPE_UINT]},
                removed: {param_types: [GObject.TYPE_UINT]},
                dropped: {param_types: [GObject.TYPE_UINT, GObject.TYPE_UINT]},
            },
        });
    }

    constructor(item) {
        super();
        let handle = new Gtk.Image({iconName: 'list-drag-handle-symbolic', cssClasses: ['dimmed']}),
            toggle = new Gtk.CheckButton({active: item.enable})[$].connect('toggled', () => this.emit('toggled', this.get_index())),
            change = new Gtk.Button({iconName: 'document-edit-symbolic', hasFrame: false, valign: Gtk.Align.CENTER})[$]
                .connect('clicked', () => this.emit('changed', this.get_index())),
            remove = new Gtk.Button({iconName: 'edit-delete-symbolic', hasFrame: false, valign: Gtk.Align.CENTER})[$]
                .connect('clicked', () => this.emit('removed', this.get_index()));
        this[$$].add_prefix([toggle, handle])[$$].add_suffix([change, remove])[$].set_activatable_widget(change);
        item.bind_property_full('format', this, 'subtitle', GObject.BindingFlags.SYNC_CREATE, (_b, v) => [true, Color.sample(v)], null);
        item.bind_property('name', this, 'title', GObject.BindingFlags.SYNC_CREATE);
        this.#buildDND(item);
    }

    #buildDND(item) {
        this[$$].add_controller([
            new Gtk.DragSource({actions: Gdk.DragAction.MOVE})[$$].connect([
                ['prepare', (_s, ...xs) => Gdk.ContentProvider.new_for_value(this[$].$spot(xs))],
                ['drag-begin', (_s, drag) => {
                    let row = new FormatRow(item);
                    Gtk.DragIcon.get_for_drag(drag).set_child(new Gtk.ListBox({cssClasses: ['boxed-list'], opacity: 0.8})[$]
                        .set_size_request(this.get_width(), this.get_height())[$].append(row)[$].drag_highlight_row(row));
                    drag.set_hotspot(...this.$spot);
                }],
            ]), Gtk.DropTarget.new(FormatRow, Gdk.DragAction.MOVE)[$].connect('drop', (_t, src) => {
                let drag = src.get_index();
                let drop = this.get_index();
                return T.seq(drag !== drop, x => x && this.emit('dropped', drag, drop));
            }),
        ]);
    }
}

class FormatList extends Adw.PreferencesGroup {
    static {
        UI.enrol(this);
    }

    constructor(page, param) {
        super({title: _('Custom'), ...param});
        this.#buildWidgets(page);
    }

    #buildWidgets(page) {
        this.$fmts = new Gio.ListStore();
        this.$save = f => { f(this.$fmts); this[UI.setv]([...this.$fmts].map(x => x.dump())); };
        UI.once(() => this.$fmts.splice(0, 0, this.value.map(x => new FormatItem(x))), this);
        let add = new Gio.ListStore()[$].append(new GObject.Object()),
            fmt = new Gio.ListStore()[$].splice(0, 0, [this.$fmts, add]),
            model = new Gtk.FlattenListModel({model: fmt});
        this.add(new Gtk.ListBox({selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list']})[$]
            .bind_model(model, obj => obj instanceof FormatItem ? new FormatRow(obj)[$$].connect([
                ['toggled', (_w, p) => this.$save(x => x.get_item(p).toggle())],
                ['dropped', (_w, p, q) => this.$save(x => x.insert(q, T.seq(x.get_item(p), () => x.remove(p))))],
                ['removed', (_w, p) => this.$save(x => this.#onRemove(T.seq(x.get_item(p), () => x.remove(p))))],
                ['changed', (_w, p) => page.dlg.choose(this.get_root(), this.$fmts.get_item(p)).then(([x]) => this.$save(y => y.get_item(p).set(x))).catch(T.nop)],
            ]) : new Adw.ButtonRow({title: _('_New Color Format'), startIconName: 'list-add-symbolic', useUnderline: true})[$].connect(
                'activated', () => page.dlg.choose(this.get_root()).then(([x]) => this.$save(y => y.append(new FormatItem({enable: true, ...x})))).catch(T.nop)
            )));
    }

    #onRemove(item) {
        this.get_root().add_toast(new Adw.Toast({title: _('Removed <i>%s</i> format').format(item.name ?? ''), buttonLabel: _G('_Undo')})[$]
            .connect('button-clicked', () => this.$save(x => x.append(new FormatItem(item)))));
    }
}

class PresetRow extends Adw.ActionRow {
    static {
        UI.enrol(this, '');
    }

    constructor(page, name) {
        super({useUnderline: true, title: name.replace(/(.)/, '$&_')})[$]
            .set_activatable_widget(new Gtk.Button({iconName: 'document-edit-symbolic', hasFrame: false, valign: Gtk.Align.CENTER})[$].connect('clicked',
                () => page.dlg.choose(this.get_root(), {name, preset: true, format: this.value}).then(([{format: x}]) => this[UI.setv](x)).catch(T.nop)))[$]
            .bind_property_full('value', this, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, v) => [true, T.esc(Color.sample(v))], null)[$]
            .add_suffix(this.activatableWidget);
    }
}

class PrefsFormat extends UI.Page {
    static {
        T.enrol(this);
    }

    $buildWidgets() {
        return Preset.map(x => [K[x], new PresetRow(this, x)])[$].push([K.CFMT, new FormatList(this)]);
    }

    $buildUI() {
        this.$add([[[_('Preset')]], Preset.map(x => K[x])], K.CFMT);
    }

    get dlg() {
        return (this.$dialog ??= new UI.Dialog(dlg => {
            let title = Adw.WindowTitle.new(_('Edit Color Format'), ''),
                note = ({desc, info}) => info ? `${_(desc)} (${info.replace(/_(.)/, '<span overline="single" weight="bold">$1</span>')})` : _(desc),
                name = new Gtk.Entry({hexpand: true, placeholderText: 'HEX'})[$].connect('activate', () => dlg.$onChosen())[$]
                    .bind_property_full('text', title, 'title', GObject.BindingFlags.DEFAULT, (_b, v) => [true, v || _('Edit Color Format')], null),
                format = new Gtk.Entry({hexpand: true, placeholderText: HEX, cssClasses: ['monospace']})[$].connect('activate', () => dlg.$onChosen())[$]
                    .bind_property_full('text', title, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, v) => [true, Color.sample(v)], null);
            dlg.initChosen = x => { name.set({text: x?.name ?? '', sensitive: !x?.preset}); format.set_text(x?.format ?? ''); format.grab_focus(); };
            dlg.getChosen = () => ({name: name.get_text(), format: format.get_text()});
            return {
                content: UI.Help.typeset(({d}) => [
                    [[_('Name'), name], [_('Format'), format]],
                    _('The following parameters can be used:'),
                    d(Color.forms.keys().flatMap(x => [x, note(Color.Form[x])]).toArray(), 6),
                    _('The color values can be formatted with (optional trailing precision):'),
                    d(Color.types.keys().flatMap(x => [x, _(Color.Type[x].desc)]).toArray(), 4),
                    _('E.g., <tt>{Blf3}</tt> means the normalized blue value accurate to 3 decimal places.'),
                ])[$].set({marginTop: 12, marginBottom: 12, marginStart: 12, marginEnd: 12}), title,
            };
        })[$].set({widthRequest: 550, heightRequest: 470}));
    }
}

export default class extends UI.Prefs {
    $buildWidgets(gset) {
        return [
            new PrefsBasic(gset)[$].set({title: _('_Basic'), iconName: 'applications-system-symbolic'}),
            new PrefsFormat(gset)[$].set({title: _('_Format'), iconName: 'applications-graphics-symbolic'}),
        ];
    }
}
