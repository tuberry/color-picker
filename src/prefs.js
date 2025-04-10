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

const {_, _G} = UI;

class Key extends UI.DialogButtonBase {
    static {
        T.enrol(this);
    }

    constructor(param) {
        super(null, new Gtk.ShortcutLabel({disabledText: _('(Key)')}), true, param);
        this.bind_property('value', this.$btn.child, 'accelerator', GObject.BindingFlags.SYNC_CREATE);
    }

    $genDialog() {
        return T.seq(dlg => {
            dlg.$onKeyPress = (_w, keyval, keycode, state) => {
                let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
                if(!mask && keyval === Gdk.KEY_Escape) return dlg.close();
                dlg.$onChosen(keyval === Gdk.KEY_BackSpace ? '' : Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
            };
        }, new UI.Dialog(UI.Keys.genStatusPage()));
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
            [K.MNSZ, new UI.Spin(0, 16, 1, _('History and collection size'))],
            [K.SNDS, new UI.Drop([_('Screenshot'), _('Complete')], _('Sound effect'))],
        ]);
        gset.connect(`changed::${K.CFMT}`, () => this.$blk[K.FMTS].set_model(Gtk.StringList.new(fmt())));
    }

    $buildUI() {
        return [
            [K.COPY, [_('_Automatically copy'), _('Copy the color to clipboard after picking')]],
            [K.FMT,  [_('_Default format'), _('Also apply to the first Format menu item')], K.FMTS],
            [K.STRY, [_('_Enable systray'), _('Right click to open menu')], new UI.Help(({h, k}) => [h(_('Menu shortcuts')), [
                [_('toggle history/collection'), k('Shift_R')],
                [_('trigger the toolbar button'), k('<alt>1 2 3')],
            ], h(_('Menu item shortcuts')), [
                [_('copy the color'), k('space Return'), _('primary click')],
                [_('remove the color'), k('BackSpace Delete'), _('middle click')],
                [_('trigger the tail button'), k('Control_L'), _('secondary click')],
            ]]), K.TICN, K.MNSZ],
            [K.KEY,  [_('E_nable shortcut'), _('Left click or press Enter / Space key to pick')], K.KEYS],
            [K.MENU, [_('F_ormat menu'), _('Middle click or press Menu key to open')], K.MKEY],
            [K.PRST, [_('_Persistent mode'), _('Right click or press Esc key to quit')], K.QKEY],
            [K.PVW,  [_('P_review style'), _('Press arrow keys / wasd / hjkl to move by pixel and hold Ctrl key to accelerate')], new UI.Help(({h, k}) => [
                [h(_('Shortcuts')), [_('toggle when picking'), k('<shift>'), _('scroll')]],
            ]), K.PVWS],
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
        super();
        this.set(fmt);
        this.toggle = () => { this.enable = !this.enable; };
        this.dump = () => (({enable, name, format}) => ({enable, name, format}))(this);
    }
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
            toggle = T.hook({toggled: () => this.emit('toggled', this.get_index())}, new Gtk.CheckButton({active: item.enable})),
            change = T.hook({clicked: () => this.emit('changed', this.get_index())},
                new Gtk.Button({iconName: 'document-edit-symbolic', hasFrame: false, valign: Gtk.Align.CENTER})),
            remove = T.hook({clicked: () => this.emit('removed', this.get_index())},
                new Gtk.Button({iconName: 'edit-delete-symbolic', hasFrame: false, valign: Gtk.Align.CENTER}));
        [toggle, handle].forEach(x => this.add_prefix(x));
        [change, remove].forEach(x => this.add_suffix(x));
        this.set_activatable_widget(change);
        item.bind_property_full('format', this, 'subtitle', GObject.BindingFlags.SYNC_CREATE, (_b, v) => [true, Color.sample(v)], null);
        item.bind_property('name', this, 'title', GObject.BindingFlags.SYNC_CREATE);
        this.#buildDND(item);
    }

    #buildDND(item) {
        this.add_controller(T.hook({
            prepare: (_s, ...xs) => { this.$spot = xs; return Gdk.ContentProvider.new_for_value(this); },
            drag_begin: (_s, drag) => {
                let {width: widthRequest, height: heightRequest} = this.get_allocation(),
                    box = new Gtk.ListBox({widthRequest, heightRequest, cssClasses: ['boxed-list']}),
                    row = new FormatRow(item);
                box.append(row);
                box.drag_highlight_row(row);
                Gtk.DragIcon.get_for_drag(drag).set_child(box);
                drag.set_hotspot(...this.$spot);
            },
        }, new Gtk.DragSource({actions: Gdk.DragAction.MOVE})));
        this.add_controller(T.hook({
            drop: (_t, src) => {
                let drag = src.get_index();
                let drop = this.get_index();
                return T.seq(x => x && this.emit('dropped', drag, drop), drag !== drop);
            },
        }, Gtk.DropTarget.new(FormatRow, Gdk.DragAction.MOVE)));
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
        this.$fmts = new Gio.ListStore({itemType: FormatItem});
        this.$save = f => { f(this.$fmts); this[UI.setv]([...this.$fmts].map(x => x.dump())); };
        UI.once(this, () => this.$fmts.splice(0, 0, this.value.map(x => new FormatItem(x))));
        let add = new Gio.ListStore({itemType: GObject.Object}),
            fmt = new Gio.ListStore({itemType: Gio.ListStore}),
            model = new Gtk.FlattenListModel({model: fmt}),
            list = new Gtk.ListBox({selectionMode: Gtk.SelectionMode.NONE, cssClasses: ['boxed-list']});
        add.append(new GObject.Object());
        fmt.splice(0, 0, [this.$fmts, add]);
        list.bind_model(model, r => r instanceof FormatItem ? T.hook({
            toggled: (_w, p) => this.$save(x => x.get_item(p).toggle()),
            dropped: (_w, p, a) => this.$save(x => { let item = x.get_item(p); x.remove(p); x.insert(a, item); }),
            removed: (_w, p) => this.$save(x => { let item = x.get_item(p); x.remove(p); this.#onRemove(item); }),
            changed: (_w, p) => page.dlg.choose(this.get_root(), this.$fmts.get_item(p)).then(([x]) => this.$save(y => y.get_item(p).set(x))).catch(T.nop),
        }, new FormatRow(r)) : T.hook({
            activated: () => page.dlg.choose(this.get_root()).then(([x]) => this.$save(y => y.append(new FormatItem({enable: true, ...x})))).catch(T.nop),
        }, new Adw.ButtonRow({title: _('_New Color Format'), startIconName: 'list-add-symbolic', useUnderline: true})));
        this.add(list);
    }

    #onRemove(item) {
        this.get_root().add_toast(T.hook({'button-clicked': () => this.$save(x => x.append(new FormatItem(item)))},
            new Adw.Toast({title: _('Removed <i>%s</i> format').format(item.name ?? ''), buttonLabel: _G('_Undo')})));
    }

    vfunc_unroot() {
        this.get_prev_sibling()?.grab_focus();
        super.vfunc_unroot();
    }
}

class PresetRow extends Adw.ActionRow {
    static {
        UI.enrol(this, '');
    }

    constructor(page, name, param) {
        super({useUnderline: true, title: name.replace(/(.)/, '$&_'), ...param});
        this.set_activatable_widget(T.hook({
            clicked: () => page.dlg.choose(this.get_root(), {name, preset: true, format: this.value}).then(([{format: x}]) => this[UI.setv](x)).catch(T.nop),
        }, new Gtk.Button({iconName: 'document-edit-symbolic', hasFrame: false, valign: Gtk.Align.CENTER})));
        this.bind_property_full('value', this, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, v) => [true, T.escape(Color.sample(v))], null);
        this.add_suffix(this.activatableWidget);
    }
}

class PrefsFormat extends UI.Page {
    static {
        T.enrol(this);
    }

    $buildWidgets() {
        return Preset.map(x => [K[x], new PresetRow(this, x)]).concat([[K.CFMT, new FormatList(this)]]);
    }

    $buildUI() {
        this.$add([[[_('Preset')]], Preset.map(x => K[x])], K.CFMT);
    }

    get dlg() {
        return (this.$dialog ??= new UI.Dialog(dlg => {
            let title = Adw.WindowTitle.new(_('Edit Color Format'), ''),
                note = ({desc, info}) => info ? `${_(desc)} (${info.replace(/_(.)/, '<span overline="single" weight="bold">$1</span>')})` : _(desc),
                name = T.hook({activate: () => dlg.$onChosen()}, new Gtk.Entry({hexpand: true, placeholderText: 'HEX'})),
                format = T.hook({activate: () => dlg.$onChosen()}, new Gtk.Entry({hexpand: true, placeholderText: HEX, cssClasses: ['monospace']}));
            name.bind_property_full('text', title, 'title', GObject.BindingFlags.DEFAULT, (_b, v) => [true, v || _('Edit Color Format')], null);
            format.bind_property_full('text', title, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, v) => [true, Color.sample(v)], null);
            dlg.initChosen = x => { name.set({text: x?.name ?? '', sensitive: !x?.preset}); format.set_text(x?.format ?? ''); format.grab_focus(); };
            dlg.getChosen = () => ({name: name.get_text(), format: format.get_text()});
            return {
                content: UI.Help.typeset(({d}) => [
                    [[_('Name'), name], [_('Format'), format]],
                    _('The following parameters can be used:'),
                    d(Array.from(Color.forms.keys()).flatMap(x => [x, note(Color.Form[x])]), 6),
                    _('The color values can be formatted with (optional trailing precision):'),
                    d(Array.from(Color.types.keys()).flatMap(x => [x, _(Color.Type[x].desc)]), 4),
                    _('E.g., <tt>{Blf3}</tt> means the normalized blue value accurate to 3 decimal places.'),
                ], {marginTop: 12, marginBottom: 12, marginStart: 12, marginEnd: 12}), title,
            };
        }, {widthRequest: 550, heightRequest: 450}));
    }
}

export default class extends UI.Prefs {
    fillPreferencesWindow(win) {
        let gset = this.getSettings();
        [
            new PrefsBasic(gset, {title: _('_Basic'), iconName: 'applications-system-symbolic'}),
            new PrefsFormat(gset, {title: _('_Format'), iconName: 'applications-graphics-symbolic'}),
        ].forEach(x => win.add(x));
    }
}
