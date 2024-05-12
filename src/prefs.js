// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import {Color} from './color.js';
import {Field, Preset} from './const.js';
import {array, hook, noop, pickle} from './util.js';

const {_, vprop, gprop} = UI;

class Key extends UI.DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super(param, new Gtk.ShortcutLabel({disabled_text: _('(Key)')}), null, true);
    }

    $setValue(v) {
        this.$value = v;
        this.$btn.child.set_accelerator(this.$value);
    }

    $genDialog() {
        let key = new UI.KeysDialog({title: _('Press any key.')});
        key.$onKeyPress = (_w, keyval, keycode, state) => {
            let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
            if(!mask && keyval === Gdk.KEY_Escape) return key.close();
            key.$onSelect(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
        };
        return key;
    }
}

class PrefsBasic extends UI.PrefPage {
    static {
        GObject.registerClass(this);
    }

    constructor(param, gset) {
        super(param);
        this.getFormats = () => Preset.concat(gset.get_value(Field.CFMT).recursiveUnpack().flatMap(x => x.enable ? [x.name] : []));
        this.$buildWidgets(gset);
        this.$buildUI();
    }

    $buildWidgets(gset) {
        this.$blk = UI.block({
            MKEY: new Key(),
            QKEY: new Key(),
            COPY: new UI.Check(),
            NTF:  new UI.Check(),
            FMT:  new UI.Check(),
            PVW:  new UI.Check(),
            KEY:  new UI.Check(),
            SND:  new UI.Check(),
            STRY: new UI.Check(),
            PRST: new UI.Check(),
            MENU: new UI.Check(),
            FMTS: new UI.Drop(this.getFormats()),
            NTFS: new UI.Drop([_('MSG'), _('OSD')]),
            PVWS: new UI.Drop([_('Lens'), _('Label')]),
            MSIZ: new UI.Spin(1, 16, 1, _('History size')),
            TICN: new UI.Icon({tooltip_text: _('Systray icon')}),
            SNDS: new UI.Drop([_('Screenshot'), _('Complete')], _('Sound effect')),
        }, gset);
        this.$blk.KEYS = new UI.Keys({gset, key: Field.KEYS});
        gset.connect(`changed::${Field.CFMT}`, () => this.$blk.FMTS.set_model(Gtk.StringList.new(this.getFormats())));
    }

    $buildUI() {
        [
            [this.$blk.COPY, [_('Automatically copy'), _('Copy the color to clipboard after picking')]],
            [this.$blk.FMT,  [_('Default format'), _('Support custom color formats')], this.$blk.FMTS],
            [this.$blk.KEY,  [_('Enable shortcut'), _('Press arrow keys / wasd / hjkl to move by pixel')], this.$blk.KEYS],
            [this.$blk.STRY, [_('Enable systray'), _('Right click to open menu')], this.$blk.TICN, this.$blk.MSIZ],
            [this.$blk.MENU, [_('Format menu'), _('Middle click or press Menu key to open menu')], this.$blk.MKEY],
            [this.$blk.PRST, [_('Persistent mode'), _('Right click or press Esc key to quit')], this.$blk.QKEY],
            [this.$blk.PVW,  [_('Preview style'), _('Scroll or press Ctrl key to toggle when picking')], this.$blk.PVWS],
            [this.$blk.NTF,  [_('Notification style'), _('Notify the color after picking')], this.$blk.NTFS],
            [this.$blk.SND,  [_('Notification sound'), _('Play the sound after picking')], this.$blk.SNDS],
        ].forEach(xs => this.addToGroup(new UI.PrefRow(...xs)));
    }
}

class FormatDialog extends UI.DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(opt) {
        super('', opt, {width_request: 400, height_request: 485});
    }

    $buildWidgets(opt) {
        let title = Adw.WindowTitle.new(_('New Color Format'), ''),
            genLabel = (label, end) => new Gtk.Label({label, use_markup: true, halign: end ? Gtk.Align.END : Gtk.Align.START}),
            [edit, type, base] = array(3, () => new Gtk.Grid({vexpand: true, row_spacing: 12, column_spacing: 12})),
            format = hook({activate: () => this.$onSelect()}, new Gtk.Entry({hexpand: true, placeholder_text: '#%Rex%Grx%Blx'})),
            name = hook({activate: () => this.$onSelect()}, new Gtk.Entry({hexpand: true, placeholder_text: 'HEX', sensitive: !opt?.preset}));
        name.bind_property_full('text', title, 'title', GObject.BindingFlags.DEFAULT, (_b, v) => [true, v || _('New Color Format')], null);
        format.bind_property_full('text', title, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, v) => [true, Color.sample(v)], null);
        this.initSelected = x => { name.set_text(x?.name ?? ''); format.set_text(x?.format ?? ''); };
        this.getSelected = () => JSON.stringify({name: name.get_text(), format: format.get_text()});
        [genLabel(_('Name'), true), name, genLabel(_('Format'), true), format]
            .forEach((x, i) => edit.attach(x, i % 2, i / 2 >> 0, 1, 1));
        Object.entries({
            Re: 'red', Gr: 'green', Bl: 'blue', Hu: 'hue', Sl: 'saturation', Ll: 'lightness',
            Va: 'value', Cy: 'cyan', Ma: 'magenta', Ye: 'yellow', Bk: 'black',
        }).forEach(([x, y], i) => type.attach(genLabel(`<b>%${x}</b> ${y}`), i % 3, i / 3 >> 0, 1, 1));
        Object.entries({
            h: 'hex lowercase 1 digit', H: 'hex uppercase 1 digit', x: 'hex lowercase 2 digits', X: 'hex uppercase 2 digits',
            f: 'float with leading zero', F: 'float without leading zero', b: 'byte value (default)',
        }).forEach(([x, y], i) => base.attach(genLabel(`<b>${x}</b> ${y}`), i % 2, i / 2 >> 0, 1, 1));
        return {
            content: new UI.Box([edit, genLabel(_('The following parameters can be used:')),
                type, genLabel(_('The red/green/blue value can be formatted with:')),
                base, genLabel(_('i.e. <b>%Blx</b> means hex lowercase 2 digits blue value.'))], {
                orientation: Gtk.Orientation.VERTICAL, valign: Gtk.Align.START, spacing: 12,
                margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12,
            }, false), title,
        };
    }
}

// FIXME: ButtonRow - https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.ButtonRow.html
class NewFormatRow extends Gtk.ListBoxRow {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({
            action_name: 'format.add',
            child: new Gtk.Image({
                icon_name: 'list-add-symbolic', pixel_size: 16, hexpand: true,
                margin_top: 16, margin_bottom: 16, margin_start: 16, margin_end: 16,
            }),
        });
        this.update_property([Gtk.AccessibleProperty.LABEL], [_('New Color Format')]);
    }
}

class FormatItem extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: gprop({
                name: ['string', ''],
                format: ['string', ''],
                enable: ['boolean', false],
            }),
        }, this);
    }

    constructor(fmt) {
        super();
        this.set(fmt);
        this.toggle = () => { this.enable = !this.enable; };
        this.dump = () => (({enable, name, format}) => ({enable, name, format}))(this);
        this.copy = () => new FormatItem(this.dump());
    }
}

class FormatRow extends Adw.ActionRow {
    static {
        GObject.registerClass({
            Signals: {
                toggled: {param_types: [GObject.TYPE_UINT]},
                changed: {param_types: [GObject.TYPE_UINT]},
                removed: {param_types: [GObject.TYPE_UINT]},
                dropped: {param_types: [GObject.TYPE_UINT, GObject.TYPE_UINT]},
            },
        }, this);
    }

    constructor(item) {
        super();
        let handle = new Gtk.Image({icon_name: 'list-drag-handle-symbolic', css_classes: ['drag-handle']}),
            toggle = hook({toggled: () => this.emit('toggled', this.get_index())}, new Gtk.CheckButton({active: item.enable})),
            change = hook({clicked: () => this.emit('changed', this.get_index())},
                new Gtk.Button({icon_name: 'document-edit-symbolic', has_frame: false, valign: Gtk.Align.CENTER})),
            remove = hook({clicked: () => this.emit('removed', this.get_index())},
                new Gtk.Button({icon_name: 'edit-delete-symbolic', has_frame: false, valign: Gtk.Align.CENTER}));
        [toggle, handle].forEach(x => this.add_prefix(x));
        [change, remove].forEach(x => this.add_suffix(x));
        this.set_activatable_widget(change);
        item.bind_property_full('format', this, 'subtitle', GObject.BindingFlags.SYNC_CREATE, (_b, v) => [true, Color.sample(v)], null);
        item.bind_property('name', this, 'title', GObject.BindingFlags.SYNC_CREATE);
        this.$buildDND(item);
    }

    $buildDND(item) {
        this.add_controller(hook({
            prepare: (_s, x, y) => {
                this.$drag_x = x; this.$drag_y = y;
                return Gdk.ContentProvider.new_for_value(this);
            },
            drag_begin: (_s, drag) => {
                let {width: width_request, height: height_request} = this.get_allocation(),
                    box = new Gtk.ListBox({width_request, height_request}),
                    row = new FormatRow(item);
                box.append(row);
                box.drag_highlight_row(row);
                Gtk.DragIcon.get_for_drag(drag).set_child(box);
                drag.set_hotspot(this.$drag_x, this.$drag_y);
            },
        }, new Gtk.DragSource({actions: Gdk.DragAction.MOVE})));
        this.add_controller(hook({
            drop: (_t, src) => {
                let drag = src.get_index();
                let drop = this.get_index();
                if(drag === drop) return false;
                this.emit('dropped', drag, drop);
                return true;
            },
        }, Gtk.DropTarget.new(FormatRow, Gdk.DragAction.MOVE)));
    }
}

class FormatList extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
        this.install_action('format.add', null, self => self.$onAppend());
    }

    constructor(gset) {
        super({title: _('Custom')});
        this.$fmts = new Gio.ListStore({item_type: FormatItem});
        this.$fmts.splice(0, 0, gset.get_value(Field.CFMT).recursiveUnpack().map(x => new FormatItem(x)));
        this.$save = func => { func(this.$fmts); gset.set_value(Field.CFMT, pickle([...this.$fmts].map(x => x.dump()), false)); };
        let neo = new Gio.ListStore({item_type: GObject.Object}),
            store = new Gio.ListStore({item_type: Gio.ListStore}),
            model = new Gtk.FlattenListModel({model: store}),
            list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
        neo.append(new GObject.Object());
        store.splice(0, 0, [this.$fmts, neo]);
        list.bind_model(model, x => x instanceof FormatItem ? hook({
            dropped: this.$onDrop.bind(this),
            removed: this.$onRemove.bind(this),
            toggled: this.$onToggle.bind(this),
            changed: this.$onChange.bind(this),
        }, new FormatRow(x)) : new NewFormatRow());
        this.add(list);
    }

    get dlg() {
        return (this.$dialog ??= new FormatDialog());
    }

    $onChange(_w, pos) {
        this.dlg.choose_sth(this.get_root(), this.$fmts.get_item(pos)).then(x => this.$save(y => y.get_item(pos).set(JSON.parse(x)))).catch(noop);
    }

    $onAppend() {
        this.dlg.choose_sth(this.get_root()).then(x => this.$save(y => y.append(new FormatItem({enable: true, ...JSON.parse(x)})))).catch(noop);
    }

    $onDrop(_w, pos, aim) {
        this.$save(x => { let item = x.get_item(pos).copy(); x.remove(pos); x.insert(aim, item); });
    }

    $onToggle(_w, pos) {
        this.$save(x => x.get_item(pos).toggle());
    }

    $onRemove(_w, pos) {
        this.$save(x => x.remove(pos));
    }
}

class PresetRow extends Adw.ActionRow {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(param, callback) {
        super(param);
        this.bind_property_full('value', this, 'subtitle', GObject.BindingFlags.DEFAULT,
            (_b, v) => [true, Color.sample(v)], null);
        let btn = hook({clicked: () => callback(this.value)},
            new Gtk.Button({icon_name: 'document-edit-symbolic', has_frame: false, valign: Gtk.Align.CENTER}));
        this.set_activatable_widget(btn);
        this.add_suffix(btn);
    }
}

class PresetList extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super({title: _('Preset')});
        Preset.forEach(name => {
            let key = Field[name];
            let row = new PresetRow({title: name}, format => this.dlg.choose_sth(this.get_root(), {name, format})
                                    .then(x => gset.set_string(key, JSON.parse(x).format)).catch(noop));
            gset.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            this.add(row);
        });
    }

    get dlg() {
        return (this.$dialog ??= new FormatDialog({preset: true}));
    }
}

class PrefsFormat extends UI.PrefPage {
    static {
        GObject.registerClass(this);
    }

    constructor(param, gset) {
        super(param, new PresetList(gset));
        this.add(new FormatList(gset));
    }
}

export default class PrefsWidget extends UI.Prefs {
    fillPreferencesWindow(win) {
        let gset = this.getSettings();
        [
            new PrefsBasic({title: _('Basic'), icon_name: 'applications-system-symbolic'}, gset),
            new PrefsFormat({title: _('Format'), icon_name: 'applications-graphics-symbolic'}, gset),
        ].forEach(x => win.add(x));
    }
}
