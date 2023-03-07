// vim:fdm=syntax
// by tuberry
/* exported init buildPrefsWidget */
'use strict';

const { Adw, Gio, Gtk, GObject, Gdk, GLib } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { _, fl, genParam, fquery } = Me.imports.util;
const { Field } = Me.imports.const;
const UI = Me.imports.ui;

function buildPrefsWidget() {
    return new ColorPickerPrefs();
}

function init() {
    ExtensionUtils.initTranslations();
}

class IconBtn extends UI.File {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super({ filter: 'image/svg+xml' }, Gio.FILE_ATTRIBUTE_STANDARD_NAME);
    }

    _checkIcon(path) {
        let name = GLib.basename(path).replace('.svg', '');
        return Gtk.IconTheme.get_for_display(Gdk.Display.get_default()).has_icon(name) ? name : '';
    }

    async _setFile(path) {
        let file = fl(path);
        let info = await fquery(file, this._attr);
        this._setLabel(info.get_name().replace(RegExp(/(-symbolic)*.svg$/), ''));
        let icon = this._checkIcon(path);
        icon ? this._icon.set_from_icon_name(icon) : this._icon.set_from_gicon(Gio.Icon.new_for_string(path));
        if(!this.file) this.chooser.set_file(file);
        this._file = path;
        this._icon.show();
    }

    _setEmpty() {
        this._icon.hide();
        this._setLabel(null);
        this._file = null;
    }
}

var KeyBtn = class extends Gtk.Box {
    static {
        GObject.registerClass({
            Properties: {
                key: genParam('string', 'key', ''),
            },
            Signals: {
                changed: { param_types: [GObject.TYPE_STRING] },
            },
        }, this);
    }

    constructor() {
        super({ valign: Gtk.Align.CENTER, css_classes: ['linked'] }); // no 'always-show-image'
        let label = new Gtk.ShortcutLabel({ disabled_text: _('(Key)') });
        this.bind_property('key', label, 'accelerator', GObject.BindingFlags.DEFAULT);
        this._btn = new Gtk.Button({ child: label });
        let reset = new Gtk.Button({ icon_name: 'edit-clear-symbolic', tooltip_text: _('Clear') });
        reset.connect('clicked', () => { this.key = ''; });
        this._btn.connect('clicked', this._onActivated.bind(this));
        [this._btn, reset].forEach(x => this.append(x));
    }

    _onActivated(widget) {
        let ctl = new Gtk.EventControllerKey();
        let content = new Adw.StatusPage({ title: _('Press any keys.'), icon_name: 'preferences-desktop-keyboard-symbolic' });
        this._editor = new Adw.Window({ modal: true, hide_on_close: true, transient_for: widget.get_root(), width_request: 480, height_request: 320, content });
        this._editor.add_controller(ctl);
        ctl.connect('key-pressed', this._onKeyPressed.bind(this));
        this._editor.present();
    }

    _onKeyPressed(_widget, keyval, keycode, state) {
        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;
        if(!mask && keyval === Gdk.KEY_Escape) { this._editor.close(); return Gdk.EVENT_STOP; }
        this.key = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this.emit('changed', this.key);
        this._editor.destroy();
        return Gdk.EVENT_STOP;
    }

    vfunc_mnemonic_activate() {
        this._btn.activate();
    }
};

class ColorPickerPrefs extends Adw.PreferencesGroup {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super();
        this._buildWidgets();
        this._buildUI();
    }

    _buildWidgets() {
        this._blk = new UI.Block({
            m_key:   [Field.MENUKEY,        'key',      new KeyBtn()],
            q_key:   [Field.QUITKEY,        'key',      new KeyBtn()],
            tray:    [Field.SYSTRAYICON,    'file',     new IconBtn()],
            copy:    [Field.AUTOCOPY,       'active',   new Gtk.CheckButton()],
            en_ntf:  [Field.ENABLENOTIFY,   'active',   new Gtk.CheckButton()],
            en_fmt:  [Field.ENABLEFORMAT,   'active',   new Gtk.CheckButton()],
            en_view: [Field.ENABLEPREVIEW,  'active',   new Gtk.CheckButton()],
            en_keys: [Field.ENABLESHORTCUT, 'active',   new Gtk.CheckButton()],
            en_tray: [Field.ENABLESYSTRAY,  'active',   new Gtk.CheckButton()],
            persist: [Field.PERSISTENTMODE, 'active',   new Gtk.CheckButton()],
            notify:  [Field.NOTIFYSTYLE,    'selected', new UI.Drop([_('MSG'), _('OSD')])],
            m_size:  [Field.MENUSIZE,       'value',    new UI.Spin(1, 16, 1, _('history size'))],
            fmt:     [Field.FORMAT,         'selected', new UI.Drop(['HEX', 'RGB', 'HSL', 'hex', 'HSV', 'CMYK'])],
            view:    [Field.PREVIEW,        'selected', new UI.Drop([_('Icon'), _('Label')], _('preview style'))],
        });
        this._blk.keys = new UI.Keys(this._blk.gset, Field.PICKSHORTCUT);
    }

    _buildUI() {
        [
            [this._blk.copy,    [_('Automatically copy'), _('copy the color to clipboard after picking')]],
            [this._blk.en_fmt,  [_('Default format'), _('hex here means poundless HEX such as “8fd0da”')], this._blk.fmt],
            [this._blk.en_keys, [_('Shortcut to pick'), _('press arrow keys / wasd / hjkl to move by pixel')], this._blk.keys],
            [this._blk.en_ntf,  [_('Notification style'), _('notify the color after picking')], this._blk.notify],
            [this._blk.persist, [_('Persistent mode'), _('right click or press Esc key to quit')], this._blk.q_key],
            [this._blk.en_view, [_('Enable preview'), _('middle click or press Menu key to open menu')], this._blk.view, this._blk.m_key],
            [this._blk.en_tray, [_('Enable systray'), _('right click to open menu')], this._blk.tray, this._blk.m_size],
        ].forEach(xs => this.add(new UI.PrefRow(...xs)));
    }
}
