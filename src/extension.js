// vim:fdm=syntax
// by tuberry
/* exported init */
'use strict';

const Main = imports.ui.main;
const Slider = imports.ui.slider;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const BoxPointer = imports.ui.boxpointer;
const Screenshot = imports.ui.screenshot;
const { Gio, St, Shell, GObject, Clutter, Meta } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const { Fulu, Extension: Ext, DEventEmitter, symbiose, omit, onus } = Me.imports.fubar;
const { StButton, MenuItem, RadioItem, IconItem, TrayIcon } = Me.imports.menu;
const { _, id, ec, omap, bmap, xnor, gerror } = Me.imports.util;
const { Field } = Me.imports.const;

const setCursor = x => global.display.set_cursor(Meta.Cursor[x]);
const setClipboard = x => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, x);
const genSVG = x => ec(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" version="1.1">
  <rect x="2" y="2" width="12" height="12" rx="2" fill="${x}" />
</svg>`);

const Notify = { MSG: 0, OSD: 1 };
const Format = bmap({ HEX: 0, RGB: 1, HSL: 2, hex: 3, HSV: 4, CMYK: 5 });

class Color {
    constructor(text, format) {
        this.text = text || '#fff';
        this.format = format;
    }

    set format(format) {
        this._format = format;
    }

    get format() {
        return this._format ?? this.text_format;
    }

    get text_format() {
        return this._text_format ?? (this._text_format = this.toFormat(this.text));
    }

    toFormat(x) {
        if(x.startsWith('#')) return Format.HEX;
        else if(x.startsWith('rgb')) return Format.RGB;
        else if(x.startsWith('hsl')) return Format.HSL;
        else if(x.startsWith('hsv')) return Format.HSV;
        else if(x.startsWith('cmyk')) return Format.CMYK;
        else return Format.hex;
    }

    toText(format) {
        switch(format ?? this.format) {
        case Format.RGB: return (({ r, g, b }) => `rgb(${r}, ${g}, ${b})`)(this.rgb);
        case Format.HSL: return (({ h, s, l }) => `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`)(this.hsl);
        case Format.HSV: return (({ h, s, v }) => `hsv(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(v * 100)}%)`)(this.hsv);
        case Format.CMYK: return (({ c, m, y, k }) => `cmyk(${c}, ${m}, ${y}, ${k})`)(this.cmyk);
        case Format.hex: return this.color.to_string().slice(1, 7);
        default: return this.color.to_string().slice(0, 7);
        }
    }

    toColor(t, f) {
        switch(f) {
        case Format.HEX:
        case Format.RGB:
            return Clutter.Color.from_string(t).at(1);
        case Format.HSL: {
            let [h, s, l] = t.slice(4, -1).split(',').map((x, i) => parseInt(x) / (i ? 100 : 1));
            return Clutter.Color.from_hls(h, l, s);
        }
        case Format.HSV: {
            let [h, s, v] = t.slice(4, -1).split(',').map((x, i) => parseInt(x) / (i ? 100 : 1));
            let { h: hue, s: sat, l } = this.hsv2hsl({ h, s, v });
            return Clutter.Color.from_hls(hue, l, sat);
        }
        case Format.CMYK: {
            let [c, m, y, k] = t.slice(5, -1).split(',').map(v => parseInt(v));
            let { r, g, b } = this.cmyk2rgb({ c, m, y, k });
            return new Clutter.Color({ red: r, green: g, blue: b });
        }
        default: return Clutter.Color.from_string(`#${t}`).at(1);
        }
    }

    get color() {
        return this._color ?? (this._color = this.toColor(this.text, this.text_format));
    }

    hsv2hsl({ h, s, v }) {
        let l = v * (1 - s / 2);
        let sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
        return { h, l, s: sl };
    }

    // Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
    hsl2hsv({ h, s, l }) {
        let v = l + s * Math.min(l, 1 - l);
        let sv = v === 0 ? 0 : 2 * (1 - l / v);
        return { h, s: sv, v };
    }

    get hsv() {
        return this.hsl2hsv(this.hsl);
    }

    cmyk2rgb({ c, m, y, k }) {
        [c, m, y, k] = [c, m, y, k].map(x => x / 255);
        let [r, g, b] = [c, m, y].map(x => Math.round((1 - x * (1 - k) - k) * 255));
        return { r, g, b };
    }

    // Ref: https://zh.wikipedia.org/wiki/%E5%8D%B0%E5%88%B7%E5%9B%9B%E5%88%86%E8%89%B2%E6%A8%A1%E5%BC%8F
    rgb2cmyk({ r, g, b }) {
        let cmy = [r, g, b].map(x => 1 - x / 255),
            k = Math.min(...cmy),
            [c, m, y, k1] = k === 1 ? [0, 0, 0, 1] : cmy.map(x => (x - k) / (1 - k)).concat(k).map(x => Math.round(x * 255));
        return { c, m, y, k: k1 };
    }

    get cmyk() {
        return this.rgb2cmyk(this.rgb);
    }

    set color(color) {
        this._color = color;
    }

    set rgb(color) {
        Object.assign(this._color, color);
    }

    set hsl(color) { // [h, l, s]
        let hls = this.color.to_hls();
        this._color = Clutter.Color.from_hls(...Object.assign(hls, color));
    }

    get hsl() {
        let [h, l, s] = this.color.to_hls();
        return { h, s, l };
    }

    get rgb() {
        let { red: r, green: g, blue: b } = this.color;
        return { r, g, b };
    }

    toMarkup(fmt) {
        let { l } = this.hsl;
        // NOTE: https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${Math.round(l) ? '#000' : '#fff'}" bgcolor="${this.toText(Format.HEX)}">${this.toText(fmt)}</span>`;
    }
}

class ColorItem extends MenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(item, callback) {
        super('', () => setClipboard(this._color.text));
        this.label.set_x_expand(true);
        this._btn = new StButton({
            child: new St.Icon({ style_class: 'popup-menu-icon' }), style_class: 'color-picker-setting',
        }, () => callback(this._color.text));
        this.add_child(this._btn);
        this.setItem(item);
    }

    setItem(item) {
        if(!item) return;
        let [text, icon] = item;
        this._btn.child.set_icon_name(icon ? 'starred-symbolic' : 'non-starred-symbolic');
        if(this._color?.text === text) return;
        this._color = new Color(text);
        this.label.clutter_text.set_markup(this._color.toMarkup());
    }
}

class ColorSection extends PopupMenu.PopupMenuSection {
    constructor(list, callback) {
        super();
        this.setList(list, callback);
    }

    setList(list, callback) {
        let items = this._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ColorItem(null, callback));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setItem(list[i]));
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(number, base, callback) {
        super(number / base);
        this.base = base;
        this.step = base > 1 ? 1 / base : 0.01;
        this.connect('notify::value', () => (this._dragging || this.get_parent().active) && callback(this.number));
    }

    get number() {
        return this.value * this.base;
    }

    set number(number) {
        this.value = number / this.base;
    }

    vfunc_key_press_event(event) {
        let key = event.keyval;
        if(key === Clutter.KEY_Right || key === Clutter.KEY_Left) {
            let delta = key === Clutter.KEY_Right ? this.step : -this.step;
            this.value = Math.clamp(this._value + delta, 0, this._maxValue);
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }

    scroll(event) {
        if(event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        let delta = (direction => {
            switch(direction) {
            case Clutter.ScrollDirection.UP: return 1;
            case Clutter.ScrollDirection.DOWN: return -1;
            case Clutter.ScrollDirection.SMOOTH: return -event.get_scroll_delta().at(1);
            default: return 0;
            }
        })(event.get_scroll_direction());
        this.value = Math.clamp(this._value + delta * this.step, 0, this._maxValue);
        return Clutter.EVENT_STOP;
    }
}

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, number, base, callback) {
        super({ activate: false });
        let label = new St.Label({ text, x_expand: false });
        this._slider = new ColorSlider(number, base, callback);
        this.connect('button-press-event', (_a, event) => this._slider.startDragging(event));
        this.connect('key-press-event', (_a, event) => this._slider.emit('key-press-event', event));
        this.connect('scroll-event', (_a, event) => this._slider.emit('scroll-event', event));
        [label, this._slider].forEach(x => this.add_child(x));
    }

    setNumber(number) {
        this._slider.number = number;
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(actor, area) {
        super(actor, 0.15, St.Side.LEFT);
        this.color = new Color();
        Main.layoutManager.addTopChrome(this.actor);
        this._manager = new PopupMenu.PopupMenuManager(area);
        this.actor.add_style_class_name('color-picker-menu app-menu');
        this._manager.addMenu(this);
        this._addMenuItems();
        this.actor.hide();
    }

    _addMenuItems() {
        let { h, s, l } = this.color.hsl;
        let { r, g, b } = this.color.rgb;
        this._menus = {
            HEX: this._genHEXItem(),
            RGB: new PopupMenu.PopupSeparatorMenuItem(),
            r: new SliderItem('R', r, 255, red => this.setRGB({ red })),
            g: new SliderItem('G', g, 255, green => this.setRGB({ green })),
            b: new SliderItem('B', b, 255, blue => this.setRGB({ blue })),
            HSL: new PopupMenu.PopupSeparatorMenuItem(),
            h: new SliderItem('H', h, 360, x => this.setHSL({ 0: x })),
            s: new SliderItem('S', s, 1, x => this.setHSL({ 2: x })),
            l: new SliderItem('L', l, 1, x => this.setHSL({ 1: x })),
            other: new PopupMenu.PopupSeparatorMenuItem(_('Others')),
            HSV: new MenuItem('hsv', () => this._emitSelected(Format.HSV)),
            CMYK: new MenuItem('cmyk', () => this._emitSelected(Format.CMYK)),
            clip: this._genClipItem(),
        };
        for(let p in this._menus) this.addMenuItem(this._menus[p]);
    }

    _genClipItem() {
        let item = new PopupMenu.PopupMenuItem(_('Read from clipboard'));
        item.activate = () => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => {
            this.color = new Color(text, Format.HEX);
            this.open(BoxPointer.PopupAnimation.NONE);
            this.setHSL();
        });
        return item;
    }

    _genHEXItem() {
        let item = new MenuItem('', () => this._emitSelected(Format.HEX));
        ['RGB', 'HSL', 'hex'].reverse().forEach(x => item.insert_child_at_index(new StButton({
            x_expand: false, label: x, style_class: 'color-picker-button button',
        }, () => { this.close(); this._emitSelected(Format[x]); }), 0));
        return item;
    }

    openWith(color) {
        if(this.isOpen) this.close();
        this.color = color;
        this.setHSL();
        this.open(BoxPointer.PopupAnimation.NONE);
    }

    _updateLabelText() {
        this._menus.HEX.label.clutter_text.set_markup(this.color.toMarkup(Format.HEX));
        ['RGB', 'HSL', 'HSV', 'CMYK'].forEach(x => this._menus[x].label.set_text(this.color.toText(Format[x])));
    }

    setHSL(color = {}) {
        this.color.hsl = color;
        let  { rgb, hsl } = this.color;
        ['r', 'g', 'b'].forEach(x => this._menus[x].setNumber(rgb[x]));
        ['h', 'l', 's'].forEach((x, i) => !(i in color) && this._menus[x].setNumber(hsl[x]));
        this._updateLabelText();
    }

    setRGB(color) {
        this.color.rgb = color;
        let { hsl } = this.color;
        ['h', 'l', 's'].forEach(x => this._menus[x].setNumber(hsl[x]));
        this._updateLabelText();
    }

    _emitSelected(format) {
        this.color.format = format;
        this.emit('color-selected', this.color);
    }
}

class ColorLabel extends BoxPointer.BoxPointer {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        super(St.Side.TOP);
        this.visible = false;
        this.style_class = 'color-picker-boxpointer';
        Main.layoutManager.addTopChrome(this);
        this._label = new St.Label({ style_class: 'color-picker-label' });
        this.bin.set_child(this._label);
        let s = Math.round(Meta.prefs_get_cursor_size() * 0.8);
        this._cursor = new Clutter.Actor({ opacity: 0, width: s, height: s });
        symbiose(this, () => omit(this, '_cursor'));
        Main.uiGroup.add_actor(this._cursor);
        this.setCursor(true);
    }

    setCursor(cur) {
        setCursor(cur ? 'CROSSHAIR' : 'DEFAULT');
    }

    setColor(x, y, color) {
        this._label.clutter_text.set_markup(`<span bgcolor="${color.toText(Format.HEX)}">\u2001 </span> ${color.toText()}`);
        this._cursor.set_position(x, y);
        this.setPosition(this._cursor, 0);
        this.show();
    }
}

class ColorIcon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        let effect = new Screenshot.RecolorEffect({ chroma: new Clutter.Color({ red: 80, green: 219, blue: 181 }), threshold: 0.03, smoothing: 0.3 });
        super({ visible: false, icon_name: 'color-pick', effect, icon_size: Meta.prefs_get_cursor_size() * 1.45 });
        Main.layoutManager.addTopChrome(this);
        this._effect = effect;
        this.setCursor(true);
    }

    setCursor(cur) {
        setCursor(cur ? 'BLANK' : 'DEFAULT');
    }

    setColor(x, y, color) {
        this._effect.color = color.color;
        this.set_position(x, y);
        this.show();
    }
}

class ColorArea extends St.Widget {
    static {
        GObject.registerClass({
            Signals: {
                end_pick: {},
                notify_color: { param_types: [GObject.TYPE_JSOBJECT] },
            },
        }, this);
    }

    constructor({ fulu, once, format }) {
        super({ reactive: true });
        setCursor('CROSSHAIR');
        this.once = once ?? false;
        this._picker = new Shell.Screenshot();
        this._color = new Color(null, format ?? Format.HEX);
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        symbiose(this, () => { setCursor('DEFAULT'); omit(this, 'preview', '_pointer', '_picker'); });
        this.connect('popup-menu', () => this._menu?.open(this._color));
        this.set_size(...global.display.get_size());
        this._bindSettings(fulu);
    }

    _bindSettings(fulu) {
        this._fulu = fulu.attach({
            pvstyle: [Field.PVWS, 'uint'],
            menukey: [Field.MKEY, 'string'],
            quitkey: [Field.QKEY, 'string'],
            persist: [Field.PRST, 'boolean'],
            preview: [Field.PVW,  'boolean'],
        }, this);
    }

    async _pick(emit) {
        try {
            let [x, y] = global.get_pointer();
            [this._color.color] = await this._picker.pick_color(x, y);
            this._view?.setColor(x, y, this._color);
            if(emit) this._emitColor();
        } catch(e) {
            this.emit('end-pick');
        }
    }

    set preview(preview) {
        if(xnor(preview, this._view)) return;
        if(preview) {
            this._pick();
            this._view = this.pvstyle ? new ColorLabel() : new ColorIcon();
            this._view.setCursor(true);
            this._menu = new ColorMenu(this._view, this);
            this._menu.connectObject('menu-closed', () => this._pick(),
                'open-state-changed', (_a, open) => this._view?.setCursor(!open),
                'color-selected', (_a, color) => this._emitColor(color), onus(this));
        } else {
            omit(this, '_view', '_menu');
        }
    }

    _emitColor(color) {
        this.emit('notify-color', color || this._color);
        if(!this.persist || this.once) this.emit('end-pick');
    }

    vfunc_motion_event() {
        if(this._view) this._pick();
        return Clutter.EVENT_PROPAGATE;
    }

    _moveCursorBy(x, y) {
        let [X, Y] = global.get_pointer();
        this._pointer.notify_absolute_motion(global.get_current_time(), X + x, Y + y);
    }

    _onMoveKeyPressed(keyval) {
        switch(keyval) {
        case Clutter.KEY_a:
        case Clutter.KEY_h:
        case Clutter.KEY_Left:  this._moveCursorBy(-1, 0); break;
        case Clutter.KEY_w:
        case Clutter.KEY_k:
        case Clutter.KEY_Up:    this._moveCursorBy(0, -1); break;
        case Clutter.KEY_d:
        case Clutter.KEY_l:
        case Clutter.KEY_Right: this._moveCursorBy(1, 0); break;
        case Clutter.KEY_s:
        case Clutter.KEY_j:
        case Clutter.KEY_Down:  this._moveCursorBy(0, 1); break;
        }
    }

    vfunc_key_press_event(event) {
        let { keyval } = event;
        if(this.menukey && keyval === Clutter[`KEY_${this.menukey}`]) {
            this._menu?.openWith(this._color);
        } else if(keyval === Clutter.KEY_Escape || this.quitkey && keyval === Clutter[`KEY_${this.quitkey}`]) {
            this.emit('end-pick');
            return Clutter.EVENT_PROPAGATE;
        } else {
            this._onMoveKeyPressed(keyval);
        }
        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event(event) {
        switch(event.button) {
        case Clutter.BUTTON_PRIMARY:  this._view ? this._emitColor() : this._pick(true); break;
        case Clutter.BUTTON_MIDDLE:  this._menu?.openWith(this._color); break;
        default: this.emit('end-pick'); break;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}

class ColorButton extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(fulu, callback, ...args) {
        super(...args);
        this._buildWidgets(callback);
        this._bindSettings(fulu);
        this._addMenuItems();
    }

    _buildWidgets(callback) {
        this._callback = callback;
        this.menu.actor.add_style_class_name('app-menu');
        this.add_style_class_name('color-picker-systray');
        this._icon = new TrayIcon();
        this.add_actor(this._icon);
    }

    _bindSettings(fulu) {
        this._fulu = fulu.attach({
            format:     [Field.FMTS, 'uint'],
            enable_fmt: [Field.FMT,  'boolean'],
            icon_name:  [Field.TICN, 'string'],
            menu_size:  [Field.MSIZ, 'uint'],
        }, this).attach({
            collect:    [Field.CLCT, 'string', x => x.split('|').filter(id)],
            history:    [Field.HIST, 'string', x => x.split('|').filter(id)],
            menu_style: [Field.MSTL, 'boolean'],
        }, this, 'section');
    }

    set section([k, v, out]) {
        this[k] = out ? out(v) : v;
        this._menus?.section.setList(this.getSection());
    }

    set format(format) {
        this._format = format;
        this._menus?.format.setSelected(format);
    }

    set icon_name(path) {
        path ? this._icon.set_gicon(Gio.Icon.new_for_string(path)) : this._icon.set_icon_name('color-select-symbolic');
    }

    set enable_fmt(enable_fmt) {
        this._enable_fmt = enable_fmt;
        if(enable_fmt) ['sep0', 'format'].forEach(x => this._menus?.[x].show());
        else ['sep0', 'format'].forEach(x => this._menus?.[x].hide());
    }

    _addMenuItems() {
        this._menus = {
            format:  new RadioItem(_('Default format'), omap(Format, ([k, v]) => [[v, k]]), this._format, x => this._fulu.set('format', x, this)),
            sep0:    new PopupMenu.PopupSeparatorMenuItem(),
            section: new ColorSection(this.getSection(), x => this._starColor(x)),
            sep1:    new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new IconItem('color-picker-setting', [
                ['find-location-symbolic', () => { this.menu.close(); this._callback(); }],
                ['face-cool-symbolic',     () => this._fulu.set('menu_style', !this.menu_style, this)],
                ['emblem-system-symbolic', () => { this.menu.close(); ExtensionUtils.openPrefs(); }],
            ]),
        };
        for(let p in this._menus) this.menu.addMenuItem(this._menus[p]);
        this.enable_fmt = this._enable_fmt;
    }

    getSection() {
        return this.menu_style ? this.collect.map(x => [x, true]) : this.history.map(x => [x, this.collect.includes(x)]);
    }

    _starColor(color) {
        if(this.collect.includes(color)) {
            this.collect.splice(this.collect.indexOf(color), 1);
            this._fulu.set('collect', this.collect.join('|'), this);
        } else {
            let collect = [color, ...this.collect];
            while(collect.length > this.menu_size) collect.pop();
            this._fulu.set('collect', collect.join('|'), this);
        }
    }

    vfunc_event(event) {
        if(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._callback();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }
}

class ColorPicker extends DEventEmitter {
    constructor() {
        super();
        this._buildWidgets();
        this._bindSettings();
    }

    _buildWidgets() {
        this._picked = [];
        this._fulu = new Fulu({}, ExtensionUtils.getSettings(), this);
        this._sbt = symbiose(this, () => omit(this, 'systray', '_area'), {
            keys: [x => x && Main.wm.removeKeybinding(Field.KEYS), x => x && Main.wm.addKeybinding(Field.KEYS,
                this._fulu.gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this.summon())],
        });
    }

    _bindSettings() {
        this._fulu.attach({
            format:        [Field.FMTS, 'uint'],
            enable_fmt:    [Field.FMT,  'boolean'],
            history:       [Field.HIST, 'string'],
            systray:       [Field.STRY, 'boolean'],
            auto_copy:     [Field.COPY, 'boolean'],
            shortcut:      [Field.KEY,  'boolean'],
            menu_size:     [Field.MSIZ, 'uint'],
            notify_style:  [Field.NTFS, 'uint'],
            enable_notify: [Field.NTF,  'boolean'],
        }, this);
    }

    set shortcut(shortcut) {
        this._sbt.keys.revive(shortcut);
    }

    set systray(systray) {
        if(xnor(systray, this._btn)) return;
        if(systray) this._btn = Main.panel.addToStatusArea(Me.metadata.uuid, new ColorButton(this._fulu, () => this.summon(), 0.5, Me.metadata.uuid));
        else omit(this, '_btn');
    }

    summon() {
        if(this._area) return;
        this._btn?.add_style_pseudo_class('busy');
        this._area = new ColorArea({ format: this.enable_fmt ? this.format : null, fulu: this._fulu });
        this._area.connectObject('end-pick', () => this.dispel(), 'notify-color', this.inform.bind(this), onus(this));
        Main.layoutManager.addChrome(this._area);
        Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
    }

    dispel() {
        if(!this._area) return;
        this._btn?.remove_style_pseudo_class('busy');
        if(this.auto_copy && this._picked.length) { setClipboard(this._picked.join(' ')); this._picked.length = 0; }
        omit(this, '_area');
    }

    inform(_a, cl) {
        let color = cl.toText();
        this._picked.push(color);
        if(this._btn) this._addHistory(color);
        if(!this.enable_notify) return;
        if(this.notify_style === Notify.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let icon = Gio.BytesIcon.new(genSVG(cl.toText(Format.HEX)));
            Main.osdWindowManager.show(global.display.get_current_monitor(), icon, color, null, 2);
        }
    }

    _addHistory(color) {
        let history = [color, ...this.history.split('|').filter(id)];
        while(history.length > this.menu_size) history.pop();
        this._fulu.set('history', history.join('|'), this);
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) throw gerror('FAILED', 'Cannot start picking');
                this._btn?.add_style_pseudo_class('busy');
                this._area = new ColorArea({ once: true, fulu: this._fulu });
                this._area.connectObject('end-pick', () => { this.dispel(); throw gerror('CANCELLED', 'Cancelled'); },
                    'notify-color', (_a, color) => resolve(color.toText(Format.HEX)), onus(this));
                Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
                Main.layoutManager.addTopChrome(this._area);
            } catch(e) {
                reject(e);
            }
        });
    }
}

class Extension extends Ext {
    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync = () => this._delegate.pickAsync();
}

function init() {
    return new Extension(ColorPicker);
}
