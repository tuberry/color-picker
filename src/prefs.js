// vim:fdm=syntax
// by tuberry

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import { Field } from './const.js';

const { _ } = UI;

class KeyDialog extends UI.KeysDialog {
    static {
        GObject.registerClass(this);
    }

    _onKeyPress(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(mask || keyval !== Gdk.KEY_Escape) this.emit('selected', Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask));
        this.close();
    }
}

class Key extends UI.DialogButtonBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new Gtk.ShortcutLabel({ disabled_text: _('(Key)') }), null, true);
    }

    _setValue(v) {
        this._value = v;
        this._btn.child.set_accelerator(this._value);
    }

    _buildDialog() {
        this._dlg = new KeyDialog({ title: _('Press any key.') });
    }
}

class ColorPickerPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor(gset) {
        super();
        this._buildWidgets(gset);
        this._buildUI();
    }

    _buildWidgets(gset) {
        this._blk = UI.block({
            MKEY: [new Key()],
            QKEY: [new Key()],
            TICN: [new UI.Icon()],
            COPY: [new UI.Check()],
            NTF:  [new UI.Check()],
            FMT:  [new UI.Check()],
            PVW:  [new UI.Check()],
            KEY:  [new UI.Check()],
            STRY: [new UI.Check()],
            PRST: [new UI.Check()],
            NTFS: [new UI.Drop([_('MSG'), _('OSD')])],
            MSIZ: [new UI.Spin(1, 16, 1, _('history size'))],
            FMTS: [new UI.Drop(['HEX', 'RGB', 'HSL', 'hex', 'HSV', 'CMYK'])],
            PVWS: [new UI.Drop([_('Icon'), _('Label')], _('preview style'))],
        }, gset);
        this._blk.KEYS = new UI.Keys({ gset, key: Field.KEYS });
    }

    _buildUI() {
        [
            [this._blk.COPY, [_('Automatically copy'), _('copy the color to clipboard after picking')]],
            [this._blk.FMT,  [_('Default format'), _('hex here means poundless HEX such as “8fd0da”')], this._blk.FMTS],
            [this._blk.KEY,  [_('Shortcut to pick'), _('press arrow keys / wasd / hjkl to move by pixel')], this._blk.KEYS],
            [this._blk.NTF,  [_('Notification style'), _('notify the color after picking')], this._blk.NTFS],
            [this._blk.PRST, [_('Persistent mode'), _('right click or press Esc key to quit')], this._blk.QKEY],
            [this._blk.PVW,  [_('Enable preview'), _('middle click or press Menu key to open menu')], this._blk.PVWS, this._blk.MKEY],
            [this._blk.STRY, [_('Enable systray'), _('right click to open menu')], this._blk.TICN, this._blk.MSIZ],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}

export default class PrefsWidget extends UI.Prefs { $klass = ColorPickerPrefs; }
