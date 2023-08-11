// vim:fdm=syntax
// by tuberry

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';

import * as UI from './ui.js';
import { Field } from './const.js';

const { _ } = UI;

class KeyBtn extends UI.DlgBtnBase {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(new Gtk.ShortcutLabel({ disabled_text: _('(Key)') }), null, true);
    }

    _buildDialog() {
        let content = new Adw.StatusPage({ title: _('Press any key.'), icon_name: 'preferences-desktop-keyboard-symbolic' });
        this._dlg = new Adw.Window({ modal: true, hide_on_close: true, width_request: 480, height_request: 320, content });
        let eck = new Gtk.EventControllerKey();
        eck.connect('key-pressed', this._onKeyPressed.bind(this));
        this._dlg.add_controller(eck);
    }

    _onClick() {
        if(!this._dlg) this._buildDialog();
        this._dlg.present();
        let root = this.get_root();
        if(this._dlg.transient_for !== root) this._dlg.set_transient_for(root);
        return Promise.reject(new Error()); // compatible with super
    }

    _setValue(v) {
        this._value = v;
        this._showValue();
    }

    _showValue() {
        this._btn.child.set_accelerator(this._value);
    }

    _onKeyPressed(_w, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
        if(mask || keyval !== Gdk.KEY_Escape) this.value = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this._dlg.close();
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
            MKEY: ['value',    new KeyBtn()],
            QKEY: ['value',    new KeyBtn()],
            TICN: ['value',    new UI.Icon()],
            COPY: ['active',   new Gtk.CheckButton()],
            NTF:  ['active',   new Gtk.CheckButton()],
            FMT:  ['active',   new Gtk.CheckButton()],
            PVW:  ['active',   new Gtk.CheckButton()],
            KEY:  ['active',   new Gtk.CheckButton()],
            STRY: ['active',   new Gtk.CheckButton()],
            PRST: ['active',   new Gtk.CheckButton()],
            NTFS: ['selected', new UI.Drop([_('MSG'), _('OSD')])],
            MSIZ: ['value',    new UI.Spin(1, 16, 1, _('history size'))],
            FMTS: ['selected', new UI.Drop(['HEX', 'RGB', 'HSL', 'hex', 'HSV', 'CMYK'])],
            PVWS: ['selected', new UI.Drop([_('Icon'), _('Label')], _('preview style'))],
        }, gset);
        this._blk.KEYS = new UI.Keys(gset, Field.KEYS);
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
