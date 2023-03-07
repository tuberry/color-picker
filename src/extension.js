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
const { Field } = Me.imports.const;
const { _, xnor } = Me.imports.util;
const { Fulu, Extension: Ext, Symbiont, DEventEmitter } = Me.imports.fubar;

const setCursor = x => global.display.set_cursor(Meta.Cursor[x]);
const setClipboard = x => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, x);

const Notify = { MSG: 0, OSD: 1 };
const Format = { HEX: 0, RGB: 1, HSL: 2, hex: 3, HSV: 4, CMYK: 5 };

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
        return ` <span fgcolor="${Math.round(l) ? '#000' : '#fff'}" bgcolor="${this.toText(Format.HEX)}">${this.toText(fmt)}</span>`;
    }
}

class MenuItem extends PopupMenu.PopupMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(text, callback, params) {
        super(text, params);
        this.connect('activate', callback);
    }

    setLabel(label) {
        if(this.label.text !== label) this.label.set_text(label);
    }
}

class RadioItem extends PopupMenu.PopupSubMenuMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(name, modes, index, callback) {
        super('');
        this._name = name;
        this._list = Object.keys(modes);
        this._list.map((x, i) => new MenuItem(_(x), () => callback(i))).forEach(x => this.menu.addMenuItem(x));
        this.setSelected(index);
    }

    setSelected(index) {
        if(!(index in this._list)) return;
        this.label.set_text(`${this._name}：${this._list[index]}`);
        this.menu._getMenuItems().forEach((y, i) => y.setOrnament(index === i ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE));
    }
}

class IconItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(style_class, cbs) {
        super({ activate: false });
        let hbox = new St.BoxLayout({ x_align: St.Align.START, x_expand: true });
        cbs.map(([icon_name, callback]) => {
            let btn = new St.Button({ x_expand: true, style_class, child: new St.Icon({ icon_name, style_class: 'popup-menu-icon' }) });
            btn.connect('clicked', callback);
            return btn;
        }).forEach(x => hbox.add_child(x));
        this.add_child(hbox);
    }
}

class ColorItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(item, callback) {
        super();
        this._call = callback;
        this._label = new St.Label({ x_expand: true });
        this._button = new St.Button({ child: new St.Icon({ style_class: 'popup-menu-icon' }), style_class: 'color-picker-setting' });
        this._button.connect('clicked', () => this._call(this._color.text));
        [this._label, this._button].forEach(x => this.add_child(x));
        this.connect('activate', () => setClipboard(this._color.text));
        this.setItem(item);
    }

    setItem(item) {
        if(!item) return;
        let [text, icon] = item;
        if(this._icon !== icon) {
            this._icon = icon;
            this._button.child.set_icon_name(icon ? 'starred-symbolic' : 'non-starred-symbolic');
        }
        if(this._color?.text !== text) {
            this._color = new Color(text);
            this._label.clutter_text.set_markup(this._color.toMarkup());
        }
    }
}

class ColorSection extends PopupMenu.PopupMenuSection {
    constructor(list, callback) {
        super();
        this._call = callback;
        this.setList(list);
    }

    setList(list) {
        let items = this._getMenuItems();
        let diff = list.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ColorItem(null, this._call));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setItem(list[i]));
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(numb, base) {
        super(numb / base);
        this.base = base;
        this.step = base > 1 ? 1 / base : 0.01;
    }

    get numb() {
        return this.value * this.base;
    }

    set numb(numb) {
        this.value = numb / this.base;
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

    constructor(text, numb, base, callback) {
        super({ activate: false });
        let label = new St.Label({ text, x_expand: false });
        this._slider = new ColorSlider(numb, base);
        this._slider.connect('notify::value', () => { if(this._slider._dragging || this.active) callback(this._slider.numb); });
        this.connect('button-press-event', (_a, event) => this._slider.startDragging(event));
        this.connect('key-press-event', (_a, event) => this._slider.emit('key-press-event', event));
        this.connect('scroll-event', (_a, event) => this._slider.emit('scroll-event', event));
        [label, this._slider].forEach(x => this.add_child(x));
    }

    setNumber(numb) {
        this._slider.numb = numb;
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(actor, area) {
        super(actor, 0.15, St.Side.LEFT);
        this.color = new Color();
        this._manager = new PopupMenu.PopupMenuManager(area);
        this._manager.addMenu(this);
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.add_style_class_name('color-picker-menu app-menu');
        this.actor.hide();
        this._addMenuItems();
    }

    _addMenuItems() {
        let { h, s, l } = this.color.hsl;
        let { r, g, b } = this.color.rgb;
        this._menus = {
            hex: this._genHEXItem(),
            rgb: new PopupMenu.PopupSeparatorMenuItem(),
            r: new SliderItem('R', r, 255, red => this.setRGB({ red })),
            g: new SliderItem('G', g, 255, green => this.setRGB({ green })),
            b: new SliderItem('B', b, 255, blue => this.setRGB({ blue })),
            hsl: new PopupMenu.PopupSeparatorMenuItem(),
            h: new SliderItem('H', h, 360, x => this.setHSL({ 0: x })),
            s: new SliderItem('S', s, 1, x => this.setHSL({ 2: x })),
            l: new SliderItem('L', l, 1, x => this.setHSL({ 1: x })),
            other: new PopupMenu.PopupSeparatorMenuItem(_('Others')),
            hsv: new MenuItem('hsv', () => this._emitSelected(Format.HSV)),
            cmyk: new MenuItem('cmyk', () => this._emitSelected(Format.CMYK)),
            clip: this._genClipItem(),
        };
        for(let p in this._menus) this.addMenuItem(this._menus[p]);
    }

    _genClipItem() {
        let item = new PopupMenu.PopupMenuItem(_('Read from clipboard'));
        item.activate = () => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clip, text) => {
            this.open(BoxPointer.PopupAnimation.NONE);
            this.color = new Color(text, Format.HEX);
            this.setHSL();
        });
        return item;
    }

    _genHEXItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ style_class: 'color-picker-item' });
        item.connect('activate', () => this._emitSelected(Format.HEX));
        ['RGB', 'HSL', 'hex'].forEach(x => {
            let btn = new St.Button({ x_expand: false, label: x, style_class: 'color-picker-button button' });
            btn.connect('clicked', () => { this.close(); this._emitSelected(Format[x]); });
            item.add_child(btn);
        });
        item.label = new St.Label({ x_expand: true });
        item.add_child(item.label);
        return item;
    }

    openWith(color) {
        if(this.isOpen) this.close();
        this.color = color;
        this.setHSL();
        this.open(BoxPointer.PopupAnimation.NONE);
    }

    _updateLabelText() {
        this._menus.hex.label.clutter_text.set_markup(this.color.toMarkup(Format.HEX));
        ['rgb', 'hsl', 'hsv', 'cmyk'].forEach(x => this._menus[x].label.set_text(this.color.toText(Format[x.toUpperCase()])));
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
        new Symbiont(() => { this._cursor.destroy(); this._cursor = null; }, this);
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
        let gicon = Gio.Icon.new_for_string(Me.dir.get_child('icons').get_child('color-pick.svg').get_path());
        let effect = new Screenshot.RecolorEffect({ chroma: new Clutter.Color({ red: 80, green: 219, blue: 181 }), threshold: 0.03, smoothing: 0.3 });
        super({ visible: false, gicon, effect, icon_size: Meta.prefs_get_cursor_size() * 1.45 });
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
        new Symbiont(() => { this.preview = this._pointer = this._picker = null; setCursor('DEFAULT'); }, this);
        this.connect('popup-menu', () => this._menu?.open(this._color));
        this.set_size(...global.display.get_size());
        this._bindSettings(fulu);
    }

    _bindSettings(fulu) {
        this._fulu = fulu.attach({
            pvstyle: [Field.PREVIEW,        'uint'],
            menukey: [Field.MENUKEY,        'string'],
            quitkey: [Field.QUITKEY,        'string'],
            persist: [Field.PERSISTENTMODE, 'boolean'],
            preview: [Field.ENABLEPREVIEW,  'boolean'],
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
                'color-selected', (_a, color) => this._emitColor(color), this);
        } else {
            ['_view', '_menu'].forEach(x => { this[x].destroy(); this[x] = null; });
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

    _moveCursorTo(x, y) {
        let [X, Y] = global.get_pointer();
        this._pointer.notify_absolute_motion(global.get_current_time(), X + x, Y + y);
    }

    _onMoveKeyPressed(keyval) {
        switch(keyval) {
        case Clutter.KEY_a:
        case Clutter.KEY_h:
        case Clutter.KEY_Left:  this._moveCursorTo(-1, 0); break;
        case Clutter.KEY_w:
        case Clutter.KEY_k:
        case Clutter.KEY_Up:    this._moveCursorTo(0, -1); break;
        case Clutter.KEY_d:
        case Clutter.KEY_l:
        case Clutter.KEY_Right: this._moveCursorTo(1, 0); break;
        case Clutter.KEY_s:
        case Clutter.KEY_j:
        case Clutter.KEY_Down:  this._moveCursorTo(0, 1); break;
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
        GObject.registerClass({
            Signals: {
                left_click: {},
            },
        }, this);
    }

    constructor(fulu, ...params) {
        super(...params);
        this._buildWidgets();
        this._bindSettings(fulu);
        this._addMenuItems();
    }

    _buildWidgets() {
        this.menu.actor.add_style_class_name('app-menu');
        this.add_style_class_name('color-picker-systray');
        this._icon = new St.Icon({ style_class: 'system-status-icon' });
        this.add_actor(this._icon);
    }

    _bindSettings(fulu) {
        this._fulu = fulu.attach({
            format:     [Field.FORMAT,        'uint'],
            enable_fmt: [Field.ENABLEFORMAT,  'boolean'],
            icon_name:  [Field.SYSTRAYICON,   'string'],
            menu_size:  [Field.MENUSIZE,      'uint'],
        }, this).attach({
            collect:    [Field.COLORSCOLLECT, 'string', x => x.split('|').filter(y => y)],
            history:    [Field.COLORSHISTORY, 'string', x => x.split('|').filter(y => y)],
            menu_style: [Field.MENUSTYLE,     'boolean'],
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
            format:  new RadioItem(_('Default format'), Format, this._format, x => this.setf('format', x)),
            sep0:    new PopupMenu.PopupSeparatorMenuItem(),
            section: new ColorSection(this.getSection(), x => this._starColor(x)),
            sep1:    new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new IconItem('color-picker-setting', [
                ['find-location-symbolic', () => { this.menu.close(); this.emit('left-click'); }],
                ['face-cool-symbolic',     () => this.setf('menu_style', !this.menu_style)],
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
            this.setf('collect', this.collect.join('|'));
        } else {
            let collect = [color, ...this.collect];
            while(collect.length > this.menu_size) collect.pop();
            this.setf('collect', collect.join('|'));
        }
    }

    vfunc_event(event) {
        if(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this.emit('left-click');
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
        this._fulu = new Fulu({}, ExtensionUtils.getSettings(), this);
        this._sbt_s = new Symbiont(x => x && Main.wm.removeKeybinding(Field.PICKSHORTCUT), this,
            x => x && Main.wm.addKeybinding(Field.PICKSHORTCUT, this._fulu.gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this.summon()));
        new Symbiont(() => { this.dispel(); this.systray = null; }, this);
    }

    _bindSettings() {
        this._fulu.attach({
            format:        [Field.FORMAT,         'uint'],
            enable_fmt:    [Field.ENABLEFORMAT,   'boolean'],
            history:       [Field.COLORSHISTORY,  'string'],
            systray:       [Field.ENABLESYSTRAY,  'boolean'],
            auto_copy:     [Field.AUTOCOPY,       'boolean'],
            shortcut:      [Field.ENABLESHORTCUT, 'boolean'],
            menu_size:     [Field.MENUSIZE,       'uint'],
            notify_style:  [Field.NOTIFYSTYLE,    'uint'],
            enable_notify: [Field.ENABLENOTIFY,   'boolean'],
        }, this);
    }

    set shortcut(shortcut) {
        this._sbt_s.reset(shortcut);
    }

    set systray(systray) {
        if(xnor(systray, this._button)) return;
        if(systray) {
            this._button = new ColorButton(this._fulu, 0.5, Me.metadata.uuid);
            this._button.connect('left-click', () => this.summon());
            Main.panel.addToStatusArea(Me.metadata.uuid, this._button);
        } else {
            this._button.destroy();
            this._button = null;
        }
    }

    summon() {
        if(this._area) return;
        if(this._button) this._button.add_style_pseudo_class('busy');
        this._area = new ColorArea({ format: this.enable_fmt ? this.format : null, fulu: this._fulu });
        this._area.connectObject('end-pick', () => this.dispel(), 'notify-color', this.inform.bind(this), this);
        Main.layoutManager.addChrome(this._area);
        this._grab = Main.pushModal(this._area, { actionMode: Shell.ActionMode.NORMAL });
    }

    dispel() {
        if(!this._area) return;
        if(this._button) this._button.remove_style_pseudo_class('busy');
        Main.popModal(this._grab);
        this._area.destroy();
        this._grab = this._area = null;
    }

    inform(_a, cl) {
        let color = cl.toText();
        if(this.auto_copy) setClipboard(color);
        if(this._button) this._addHistory(color);
        if(!this.enable_notify) return;
        if(this.notify_style === Notify.MSG) {
            Main.notify(Me.metadata.name, _('%s is picked.').format(color));
        } else {
            let index = global.display.get_current_monitor(),
                icon = new Gio.ThemedIcon({ name: 'media-playback-stop-symbolic' }),
                osd = Main.osdWindowManager._osdWindows[index];
            osd._icon.set_style(`color: ${cl.toText(Format.HEX)};`);
            Main.osdWindowManager.show(index, icon, color, null, 2);
            osd._hbox.connectObject('notify::mapped', box => {
                if(box.mapped) return Clutter.EVENT_STOP;
                osd._icon.set_style('');
                osd._hbox.disconnectObject(this);
                return Clutter.EVENT_STOP;
            }, this);
        }
    }

    _addHistory(color) {
        let history = [color, ...this.history.split('|').filter(x => x)];
        while(history.length > this.menu_size) history.pop();
        this.setf('history', history.join('|'));
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) throw new Gio.IOErrorEnum({ code: Gio.IOErrorEnum.FAILED, message: 'Cannot start picking' });
                if(this._button) this._button.add_style_pseudo_class('busy');
                this._area = new ColorArea({ once: true, fulu: this._fulu });
                this._area.connect('end-pick', () => { this.dispel(); throw new Gio.IOErrorEnum({ code: Gio.IOErrorEnum.CANCELLED, message: 'Cancelled' }); });
                this._area.connect('notify-color', (_a, color) => resolve(color.toText(Format.HEX)));
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
