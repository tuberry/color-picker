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
import {BIND, array, hook, noop, pickle} from './util.js';

const {_, vprop, gprop} = UI;

class KeyDialog extends UI.KeysDialog {
    static {
        GObject.registerClass(this);
    }

    $onKeyPress(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) return this.close();
        this.$onSelect(Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
    }
}

class Key extends UI.DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new Gtk.ShortcutLabel({disabled_text: _('(Key)')}), null, true);
    }

    $setValue(v) {
        this.$value = v;
        this.$btn.child.set_accelerator(this.$value);
    }

    $genDialog() {
        return new KeyDialog({title: _('Press any key.')});
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
            TICN: new UI.Icon(),
            COPY: new UI.Check(),
            NTF:  new UI.Check(),
            FMT:  new UI.Check(),
            PVW:  new UI.Check(),
            KEY:  new UI.Check(),
            SND:  new UI.Check(),
            STRY: new UI.Check(),
            PRST: new UI.Check(),
            FMTS: new UI.Drop(this.getFormats()),
            NTFS: new UI.Drop([_('MSG'), _('OSD')]),
            MSIZ: new UI.Spin(1, 16, 1, _('History size')),
            SNDS: new UI.Drop([_('Screenshot'), _('Complete')], _('Sound effect')),
            PVWS: new UI.Drop([_('Lens'), _('Label')], _('Scroll or press Ctrl key to toggle preview style when picking')),
        }, gset);
        this.$blk.KEYS = new UI.Keys({gset, key: Field.KEYS});
        gset.connect(`changed::${Field.CFMT}`, () => this.$blk.FMTS.set_model(Gtk.StringList.new(this.getFormats())));
    }

    $buildUI() {
        [
            [this.$blk.COPY, [_('Automatically copy'), _('Copy the color to clipboard after picking')]],
            [this.$blk.FMT,  [_('Default format'), _('Support custom color formats')], this.$blk.FMTS],
            [this.$blk.SND,  [_('Notification sound'), _('Play the sound after picking')], this.$blk.SNDS],
            [this.$blk.NTF,  [_('Notification style'), _('Notify the color after picking')], this.$blk.NTFS],
            [this.$blk.KEY,  [_('Shortcut to pick'), _('Press arrow keys / wasd / hjkl to move by pixel')], this.$blk.KEYS],
            [this.$blk.PRST, [_('Persistent mode'), _('Right click or press Esc key to quit')], this.$blk.QKEY],
            [this.$blk.PVW,  [_('Enable preview'), _('Middle click or press Menu key to open menu')], this.$blk.PVWS, this.$blk.MKEY],
            [this.$blk.STRY, [_('Enable systray'), _('Right click to open menu')], this.$blk.TICN, this.$blk.MSIZ],
        ].forEach(xs => this.addToGroup(new UI.PrefRow(...xs)));
    }
}

class FormatDialog extends UI.DialogBase {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super('', param);
        this.width_request = 400;
        this.height_request = 485;
    }

    $buildWidgets(param) {
        let genLabel = (label, end) => new Gtk.Label({label, use_markup: true, halign: end ? Gtk.Align.END : Gtk.Align.START}),
            [edit, type, base] = array(3, () => new Gtk.Grid({vexpand: true, row_spacing: 12, column_spacing: 12})),
            title = Adw.WindowTitle.new(_('New Color Format'), ''),
            format = hook({activate: () => this.$onSelect()}, new Gtk.Entry({hexpand: true, placeholder_text: '#%Rex%Grx%Blx'})),
            name = hook({activate: () => this.$onSelect()}, new Gtk.Entry({hexpand: true, placeholder_text: 'HEX', sensitive: !param?.preset}));
        name.bind_property_full('text', title, 'title', GObject.BindingFlags.DEFAULT, (_b, data) => [true, data || _('New Color Format')], null);
        format.bind_property_full('text', title, 'subtitle', GObject.BindingFlags.DEFAULT, (_b, data) => [true, Color.toSample(data)], null);
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

class NewFormatItem extends GObject.Object {
    static {
        GObject.registerClass(this);
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
        this.update_property([Gtk.AccessibleProperty.LABEL], [_('Add Format')]);
    }
}

class NewFormatModel extends GObject.Object {
    static {
        GObject.registerClass({
            Implements: [Gio.ListModel],
        }, this);
    }

    #items = [new NewFormatItem()];

    vfunc_get_item_type() {
        return NewFormatItem;
    }

    vfunc_get_n_items() {
        return this.#items.length;
    }

    vfunc_get_item(_p) {
        return this.#items[0];
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
    }
}

class FormatModel extends GObject.Object {
    static {
        GObject.registerClass({
            Implements: [Gio.ListModel],
        }, this);
    }

    #items = [];

    constructor(gset, key) {
        super();
        let sync = () => {
            let items = gset.get_value(key).recursiveUnpack().map(x => new FormatItem(x));
            this.$splice(this.#items, 0, this.#items.length, items);
        };
        let handler = gset.connect(`changed::${key}`, () => sync());
        this.$saveFormats = callback => {
            callback(this.#items);
            gset.block_signal_handler(handler);
            gset.set_value(key, pickle(this.#items.map(({name, enable, format}) => ({name, enable, format})), false));
            gset.unblock_signal_handler(handler);
        };
        sync();
    }

    $splice(items, pos, del = 0, add = []) {
        if(pos < 0) return [];
        let removed = items.splice(pos, del, ...add);
        this.items_changed(pos, del, add.length);
        return removed;
    }

    move(drag, drop) {
        this.$saveFormats(x => this.$splice(x, drop, 0, this.$splice(x, drag, 1)));
    }

    append(fmt) {
        this.$saveFormats(x => this.$splice(x, x.length, 0, [new FormatItem(fmt)]));
    }

    remove(pos) {
        this.$saveFormats(x => this.$splice(x, pos, 1));
    }

    toggle(pos) {
        this.$saveFormats(x => { x[pos].toggle(); this.$splice(x, pos); });
    }

    change(pos, edit) {
        this.$saveFormats(x => { x[pos].set(edit); this.$splice(x, pos); });
    }

    vfunc_get_item_type() {
        return FormatItem;
    }

    vfunc_get_n_items() {
        return this.#items.length;
    }

    vfunc_get_item(pos) {
        return this.#items[pos] ?? null;
    }
}

class FormatRow extends Adw.ActionRow {
    static {
        GObject.registerClass({
            Signals: {
                toggled: {param_types: [GObject.TYPE_UINT]},
                changed: {param_types: [GObject.TYPE_UINT]},
                removed: {param_types: [GObject.TYPE_UINT]},
                moved: {param_types: [GObject.TYPE_UINT, GObject.TYPE_UINT]},
            },
        }, this);
    }

    constructor(fmt) {
        super();
        let handle = new Gtk.Image({icon_name: 'list-drag-handle-symbolic', css_classes: ['drag-handle']}),
            toggle = hook({toggled: () => this.emit('toggled', this.get_index())}, new Gtk.CheckButton({active: fmt.enable})),
            change = hook({clicked: () => this.emit('changed', this.get_index())}, new Gtk.Button({
                icon_name: 'document-edit-symbolic', has_frame: false, valign: Gtk.Align.CENTER,
            })),
            remove = hook({clicked: () => this.emit('removed', this.get_index())}, new Gtk.Button({
                icon_name: 'edit-delete-symbolic', has_frame: false, valign: Gtk.Align.CENTER,
            }));
        [toggle, handle].forEach(x => this.add_prefix(x));
        [change, remove].forEach(x => this.add_suffix(x));
        this.set_activatable_widget(change);
        fmt.bind_property('name', this, 'title', BIND);
        fmt.bind_property_full('format', this, 'subtitle', BIND, (_b, data) => [true, Color.toSample(data)], null);
        this.$buildDND(fmt);
    }

    $buildDND(fmt) {
        this.add_controller(hook({
            prepare: (_s, x, y) => {
                this.$drag_x = x; this.$drag_y = y;
                return Gdk.ContentProvider.new_for_value(this);
            },
            drag_begin: (_s, drag) => {
                let {width: width_request, height: height_request} = this.get_allocation(),
                    box = new Gtk.ListBox({width_request, height_request}),
                    row = new FormatRow(fmt);
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
                this.emit('moved', drag, drop);
                return true;
            },
        }, Gtk.DropTarget.new(FormatRow, Gdk.DragAction.MOVE)));
    }
}

class FormatList extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
        this.install_action('format.add', null, self => self.$newFormat());
    }

    constructor(gset) {
        super({title: _('Custom')});
        this.$fmts = new FormatModel(gset, Field.CFMT);
        let store = new Gio.ListStore({item_type: Gio.ListModel}),
            model = new Gtk.FlattenListModel({model: store}),
            list = new Gtk.ListBox({selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list']});
        store.append(this.$fmts);
        store.append(new NewFormatModel());
        list.bind_model(model, x => x instanceof NewFormatItem ? new NewFormatRow() : hook({
            moved: (_w, src, aim) => this.$fmts.move(src, aim),
            changed: (_w, pos) => this.$editFormat(pos),
            removed: (_w, pos) => this.$fmts.remove(pos),
            toggled: (_w, pos) => this.$fmts.toggle(pos),
        }, new FormatRow(x)));
        this.add(list);
    }

    get $dlg() {
        return (this.$dialog ??= new FormatDialog());
    }

    $editFormat(pos) {
        this.$dlg.choose_sth(this.get_root(), this.$fmts.get_item(pos))
            .then(x => this.$fmts.change(pos, JSON.parse(x))).catch(noop);
    }

    $newFormat() {
        this.$dlg.choose_sth(this.get_root()).then(x => this.$fmts.append({enable: true, ...JSON.parse(x)})).catch(noop);
    }
}

class PresetRow extends Adw.ActionRow {
    static {
        GObject.registerClass(vprop('string', ''), this);
    }

    constructor(param, callback) {
        super(param);
        this.bind_property_full('value', this, 'subtitle', GObject.BindingFlags.DEFAULT,
            (_b, data) => [true, Color.toSample(data)], null);
        let btn = hook({clicked: () => callback(this.value)}, new Gtk.Button({
            icon_name: 'document-edit-symbolic', has_frame: false, valign: Gtk.Align.CENTER,
        }));
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
            let row = new PresetRow({title: name}, format => this.$dlg.choose_sth(this.get_root(), {name, format})
                                    .then(x => gset.set_string(key, JSON.parse(x).format)).catch(noop));
            gset.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            this.add(row);
        });
    }

    get $dlg() {
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
