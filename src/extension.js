// vim:fdm=syntax
// by tuberry

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Cairo from 'gi://cairo';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import { Color } from './color.js';
import { Field, Format } from './const.js';
import { encode, omap, xnor, gerror, gprops, hook } from './util.js';
import { IconButton, MenuItem, RadioItem, IconItem, TrayIcon } from './menu.js';
import { Fulu, ExtensionBase, Destroyable, manageSource, omit, connect, _, getSelf } from './fubar.js';

const setCursor = x => x && global.display.set_cursor(Meta.Cursor[x]);
const setClipboard = x => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, x);
const genColorSwatch = x => encode(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" version="1.1">
  <rect x="8" y="8" width="48" height="48" rx="8" fill="${x}" />
</svg>`); // 8 = 64 >> 3

const Notify = { MSG: 0, OSD: 1 };

class ColorItemLabel extends St.Label {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super({ can_focus: true, y_expand: true, y_align: Clutter.ActorAlign.CENTER, style_class: 'color-picker-item-label', ...param });
    }

    setMarkup(markup) {
        this._markup = markup;
        this.clutter_text.set_markup(markup);
    }

    vfunc_key_focus_in() {
        super.vfunc_key_focus_in();
        this.clutter_text.set_use_markup(false);
    }

    vfunc_key_focus_out() {
        super.vfunc_key_focus_out();
        this.clutter_text.set_use_markup(true);
        if(this._markup) this.clutter_text.set_markup(this._markup);
    }
}

class ColorItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(callback, item) {
        super({ can_focus: false });
        this.connect('activate', () => setClipboard(this._color.toText()));
        this.label = new ColorItemLabel({ x_expand: true });
        this._btn = new IconButton({ style_class: 'color-picker-iconbtn' }, () => callback(this._color.toRaw()));
        [this.label, this._btn].forEach(x => this.add_child(x));
        this.setItem(item);
    }

    setItem(item) {
        if(!item) return;
        let [icon, raw] = item;
        this._btn.setIcon(icon ? 'starred-symbolic' : 'non-starred-symbolic');
        if(this._color?.equal(raw)) return;
        this._color = new Color(raw);
        this.label.setMarkup(this._color.toMarkup());
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
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ColorItem(callback));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setItem(list[i]));
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(type, number, base, color, callback) {
        super(number / base);
        this._type = type;
        this._base = base;
        this._color = color;
        this._step = base > 1 ? 1 / base : 0.01;
        this.connect('notify::value', () => (this._dragging || this.get_parent().active) && callback(this.number));
    }

    get number() {
        return this.value * this._base;
    }

    set number(number) {
        let value = number / this._base;
        if(value === this.value) this.queue_repaint();
        else this.value = value;
    }

    vfunc_repaint() { // ignore border on colorful bg
        let cr = this.get_context(),
            themeNode = this.get_theme_node(),
            [width, height] = this.get_surface_size(),
            gradient = new Cairo.LinearGradient(0, 0, width, 0),
            barLevelHeight = themeNode.get_length('-barlevel-height'),
            barLevelRadius = Math.min(width, barLevelHeight) / 2;
        // draw background
        cr.arc(barLevelRadius, height / 2, barLevelRadius, Math.PI * (1 / 2), Math.PI * (3 / 2));
        cr.arc(width - barLevelRadius, height / 2, barLevelRadius, Math.PI * 3 / 2, Math.PI / 2);
        this._color.toStops(this._type).forEach(x => gradient.addColorStopRGBA(...x));
        cr.setSource(gradient);
        cr.fill();

        let handleRadius = themeNode.get_length('-slider-handle-radius'),
            ceiledHandleRadius = Math.ceil(handleRadius),
            handleX = ceiledHandleRadius + (width - 2 * ceiledHandleRadius) * this._value / this._maxValue,
            handleY = height / 2;
        // draw handle
        cr.setSourceRGBA(...this._color.toRGBA());
        cr.arc(handleX, handleY, handleRadius, 0, 2 * Math.PI);
        cr.fill();
        Clutter.cairo_set_source_color(cr, themeNode.get_foreground_color());
        cr.arc(handleX, handleY, barLevelRadius, 0, 2 * Math.PI);
        cr.fill();
        cr.$dispose();
    }

    _updateValue(delta) {
        this.value = Math.clamp(this._value + delta, 0, this._maxValue);
    }

    vfunc_key_press_event(event) {
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Left: this._updateValue(-this._step); break;
        case Clutter.KEY_Right: this._updateValue(this._step); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_STOP;
    }

    scroll(event) {
        if(event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        switch(event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: this._updateValue(this._step); break;
        case Clutter.ScrollDirection.DOWN: this._updateValue(-this._step); break;
        case Clutter.ScrollDirection.SMOOTH: this._updateValue(-event.get_scroll_delta().at(1) * this._step); break;
        }
        return Clutter.EVENT_STOP;
    }
}

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(type, number, base, color, callback) {
        super({ activate: false });
        let label = new St.Label({ text: type.toUpperCase(), x_expand: false });
        this._slider = new ColorSlider(type, number, base, color, callback);
        this.connect('key-press-event', (_a, event) => this._slider.vfunc_key_press_event(event));
        [label, this._slider].forEach(x => this.add_child(x));
    }

    setNumber(number) {
        this._slider.number = number;
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(area) {
        super(area._view, 0.15, St.Side.LEFT);
        this.color = area._color;
        Main.layoutManager.addTopChrome(this.actor);
        this._manager = new PopupMenu.PopupMenuManager(area);
        this.actor.add_style_class_name('color-picker-menu');
        this._manager.addMenu(this);
        this._addMenuItems();
        this.actor.hide();
    }

    _addMenuItems() {
        let { r, g, b, h, s, l } = this.color.toRGBHSL();
        this._menus = {
            HEX: this._genHEXItem(),
            RGB: new PopupMenu.PopupSeparatorMenuItem(),
            r: this._genSliderItem({ r }, 255),
            g: this._genSliderItem({ g }, 255),
            b: this._genSliderItem({ b }, 255),
            HSL: new PopupMenu.PopupSeparatorMenuItem(),
            h: this._genSliderItem({ h }, 360),
            s: this._genSliderItem({ s }, 1),
            l: this._genSliderItem({ l }, 1),
            other: new PopupMenu.PopupSeparatorMenuItem(_('Others')),
            HSV: new MenuItem('hsv', () => this._emitSelected(Format.HSV)),
            CMYK: new MenuItem('cmyk', () => this._emitSelected(Format.CMYK)),
            clip: this._genClipItem(),
        };
        Object.values(this._menus).forEach(x => this.addMenuItem(x));
    }

    _genSliderItem(initial, base) {
        let [[type, value]] = Object.entries(initial);
        return new SliderItem(type, value, base, this.color, x => this.updateSlider(type, x));
    }

    updateSlider(type, value) {
        this.color.update(type, value);
        Object.entries(this.color.toRGBHSL()).forEach(([k, v]) => k === type || this._menus[k].setNumber(v));
        this._updateLabelText();
    }

    _updateLabelText() {
        this._menus.HEX.label.setMarkup(this.color.toMarkup(Format.HEX));
        ['RGB', 'HSL', 'HSV', 'CMYK'].forEach(x => this._menus[x].label.set_text(this.color.toText(Format[x])));
    }

    _genClipItem() {
        let item = new PopupMenu.PopupMenuItem(_('Read from clipboard'));
        item.activate = () => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => {
            this.open(BoxPointer.PopupAnimation.NONE);
            if(this.color.fromString(text ?? '')) this.updateSlider();
            else console.error(`[${getSelf().metadata.name}]`, `Unknown color format: ${text}`);
        });
        return item;
    }

    _genHEXItem() {
        let item = new PopupMenu.PopupBaseMenuItem({ can_focus: false });
        item.connect('activate', () => this._emitSelected(Format.HEX));
        item.label = new ColorItemLabel();
        item.add_child(item.label);
        ['RGB', 'HSL', 'hex'].forEach((x, i) => item.insert_child_at_index(hook({
            clicked: () => { this.close(); this._emitSelected(Format[x]); },
        }, new St.Button({ x_expand: false, can_focus: true, label: x, style_class: 'color-picker-button button' })), i));
        return item;
    }

    summon() {
        if(this.isOpen) this.close();
        this.updateSlider();
        this.open(BoxPointer.PopupAnimation.NONE);
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
        this.cursor_type = 'CROSSHAIR';
        this.style_class = 'color-picker-boxpointer';
        Main.layoutManager.addTopChrome(this);
        this._label = new St.Label({ style_class: 'color-picker-label' });
        this.bin.set_child(this._label);
        let len = Math.round(Meta.prefs_get_cursor_size() * 0.8);
        this._cursor = new Clutter.Actor({ opacity: 0, width: len, height: len });
        manageSource(this, () => omit(this, '_cursor'));
        Main.uiGroup.add_child(this._cursor);
    }

    setColor(x, y, color) {
        this.hide(); // HACK: workaround for box-shadow afterimage since 45.beta
        this._label.clutter_text.set_markup(`<span bgcolor="${color.toText(Format.HEX)}">\u2001 </span> ${color.toText()}`);
        this._cursor.set_position(x, y);
        this.setPosition(this._cursor, 0);
        this.show();
    }
}

class RecolorEffect extends Shell.GLSLEffect {
    // copy from js/ui/screenshot.js since it's private since 45.beta
    static {
        GObject.registerClass({
            Properties: gprops({
                threshold: ['float', 0, 1, 0.12],
                smoothing: ['float', 0, 1, 0.10], // 0.2 + 0.02 - threshold
                color: ['boxed', Clutter.Color.$gtype],
                chroma: ['boxed', Clutter.Color.$gtype],
            }), // chroma -> color
        }, this);
    }

    constructor(param) {
        super({ chroma: new Clutter.Color({ red: 80, green: 219, blue: 181 }), ...param });
        this.color ??= this.chroma.copy();
        ['color', 'chroma', 'threshold', 'smoothing'].forEach(x => {
            let _x = `_${x}`;
            let location = this.get_uniform_location(x);
            this._updateUniform(x, _x, location);
            this.connect(`notify::${x}`, () => this._updateUniform(x, _x, location));
        });
    }

    _updateUniform(key, _key, location) {
        if(isNaN(this[key])) {
            if(this[_key]?.equal(this[key])) return;
            let { red, green, blue } = this[_key] = this[key].copy();
            this.set_uniform_float(location, 3, [red / 255, green / 255, blue / 255]);
        } else {
            if(this[_key] === this[key]) return;
            this.set_uniform_float(location, 1, [this[_key] = this[key]]);
        }
        this.queue_repaint();
    }

    vfunc_build_pipeline() {
        // Conversion parameters from https://en.wikipedia.org/wiki/YCbCr
        let dcl = `
            vec3 rgb2yCrCb(vec3 c) {                                \n
                float y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;  \n
                float cr = 0.7133 * (c.r - y);                      \n
                float cb = 0.5643 * (c.b - y);                      \n
                return vec3(y, cr, cb);                             \n
            }                                                       \n
            uniform vec3 chroma;                                    \n
            uniform vec3 color;                                     \n
            uniform float threshold;                                \n
            uniform float smoothing;                                \n`;
        let src = `
            vec3 mask = rgb2yCrCb(chroma.rgb);                      \n
            vec3 yCrCb = rgb2yCrCb(cogl_color_out.rgb);             \n
            float blend = smoothstep(threshold,                     \n
                                    threshold + smoothing,          \n
                                    distance(yCrCb.gb, mask.gb));   \n
            cogl_color_out.rgb =                                    \n
              mix(color, cogl_color_out.rgb, blend);                \n`;
        this.add_glsl_snippet(Shell.SnippetHook.FRAGMENT, dcl, src, false);
    }
}

class ColorIcon extends St.Icon {
    static {
        GObject.registerClass(this);
    }

    constructor() {
        let effect = new RecolorEffect(); // chroma default to the color-pick.svg below
        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_uri('resource:///org/gnome/shell/icons/scalable/actions/color-pick.svg') });
        super({ visible: false, gicon, effect, icon_size: Meta.prefs_get_cursor_size() * 1.45 });
        Main.layoutManager.addTopChrome(this);
        this.cursor_type = 'BLANK';
        this._effect = effect;
    }

    setColor(x, y, color) {
        this._effect.color = color;
        this.set_position(x, y);
        this.show();
    }
}

class ColorArea extends St.Widget {
    static {
        GObject.registerClass({
            Signals: {
                end_pick: { param_types: [GObject.TYPE_BOOLEAN] },
                notify_color: { param_types: [GObject.TYPE_JSOBJECT] },
            },
        }, this);
    }

    constructor({ fulu, once, format }) {
        super({ reactive: true });
        Main.layoutManager.addTopChrome(this);
        Main.pushModal(this, { actionMode: Shell.ActionMode.NORMAL });
        this.add_constraint(new Clutter.BindConstraint({ source: global.stage, coordinate: Clutter.BindCoordinate.ALL }));

        this.once = once ?? false;
        this._color = new Color(format);
        this._picker = new Shell.Screenshot();
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        manageSource(this, () => { omit(this, 'preview', '_pointer', '_picker'); });
        this.connect('popup-menu', () => this._menu?.summon());
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

    async _pickAt([x, y]) {
        try {
            let [color] = await this._picker.pick_color(x, y);
            this._color.fromClutter(color);
            this._view?.setColor(x, y, this.pvstyle ? this._color : color);
        } catch(e) {
            this.emit('end-pick', true);
        }
    }

    set preview(preview) {
        if(!xnor(preview, this._view)) {
            if(preview) {
                this._view = this.pvstyle ? new ColorLabel() : new ColorIcon();
                this._menu = new ColorMenu(this);
                connect(this, [this._menu, 'color-selected', (_a, color) => this._emitColor(color),
                    'open-state-changed', (_a, open) => setCursor(open ? 'DEFAULT' : this._view?.cursor_type)]);
            } else {
                omit(this, '_view', '_menu');
            }
        }
        setCursor(preview === null ? 'DEFAULT' : this._view?.cursor_type ?? 'CROSSHAIR');
    }

    _emitColor(color) {
        this.emit('notify-color', color || this._color);
        if(!this.persist || this.once) this.emit('end-pick', false);
    }

    vfunc_enter_event(event) {
        this._pickAt(event.get_coords());
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_motion_event(event) {
        this._pickAt(event.get_coords());
        return Clutter.EVENT_PROPAGATE;
    }

    _movePointerBy(dx, dy) {
        this._pointer.notify_relative_motion(global.get_current_time(), dx, dy);
    }

    vfunc_key_press_event(event) {
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Escape:
        case Clutter[`KEY_${this.quitkey}`]: this.emit('end-pick', true); break;
        case Clutter[`KEY_${this.menukey}`]: this._menu?.summon(); break;
        case Clutter.KEY_a:
        case Clutter.KEY_h:
        case Clutter.KEY_Left: this._movePointerBy(-1, 0); break;
        case Clutter.KEY_w:
        case Clutter.KEY_k:
        case Clutter.KEY_Up: this._movePointerBy(0, -1); break;
        case Clutter.KEY_d:
        case Clutter.KEY_l:
        case Clutter.KEY_Right: this._movePointerBy(1, 0); break;
        case Clutter.KEY_s:
        case Clutter.KEY_j:
        case Clutter.KEY_Down: this._movePointerBy(0, 1); break;
        case Clutter.KEY_space:
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter: this._emitColor(); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_press_event(event) {
        switch(event.get_button()) {
        case Clutter.BUTTON_PRIMARY: this._emitColor(); break;
        case Clutter.BUTTON_MIDDLE: this._menu?.summon(); break;
        default: this.emit('end-pick', true); break;
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
        this.menu.actor.add_style_class_name('color-picker-menu');
        this.add_style_class_name('color-picker-systray');
        this._icon = new TrayIcon();
        this.add_child(this._icon);
    }

    _bindSettings(fulu) {
        this._fulu = fulu.attach({
            format:     [Field.FMTS, 'uint'],
            enable_fmt: [Field.FMT,  'boolean'],
            icon_name:  [Field.TICN, 'string'],
            menu_size:  [Field.MSIZ, 'uint'],
        }, this).attach({
            collect:    [Field.CLCT, 'value', x => x.deepUnpack()],
            history:    [Field.HIST, 'value', x => x.deepUnpack()],
            menu_style: [Field.MSTL, 'boolean'],
        }, this, 'section');
    }

    set section([k, v, out]) {
        this[k] = out ? out(v) : v;
        this._menus?.section.setList(...this.getSection());
    }

    set format(format) {
        this._format = format;
        this._menus?.format.setSelected(format);
    }

    set icon_name(icon) {
        this._icon.set_icon_name(icon || 'color-select-symbolic');
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
            section: new ColorSection(...this.getSection()),
            sep1:    new PopupMenu.PopupSeparatorMenuItem(),
            prefs:   new IconItem('color-picker-iconbtn', {
                pick: [() => { this.menu.close(); this._callback(); }, 'find-location-symbolic'],
                star: [() => this._fulu.set('menu_style', !this.menu_style, this), [this.menu_style, 'semi-starred-symbolic', 'starred-symbolic']],
                gear: [() => { this.menu.close(); getSelf().openPreferences(); }, 'emblem-system-symbolic'],
            }),
        };
        Object.values(this._menus).forEach(x => this.menu.addMenuItem(x));
        this.enable_fmt = this._enable_fmt;
    }

    getSection() {
        return [this.menu_style ? this.collect.map(x => [true, x]) : this.history.map(x => [this.collect.includes(x), x]), x => this._starColor(x)];
    }

    _starColor(color) {
        let collect = this.collect.includes(color)
            ? this.collect.filter(x => x !== color)
            : [color].concat(this.collect).slice(0, this.menu_size);
        this._fulu.set('collect', new GLib.Variant('at', collect), this);
    }

    _addHistory(color) {
        let history = [color, ...this.history].slice(0, this.menu_size);
        this._fulu.set('history', new GLib.Variant('at', history), this);
    }

    vfunc_event(event) {
        if(event.type() === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._callback();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }
}

class ColorPicker extends Destroyable {
    constructor(gset) {
        super();
        this._buildWidgets(gset);
        this._bindSettings();
    }

    _buildWidgets(gset) {
        this._picked = [];
        this._fulu = new Fulu({}, gset, this);
        this._src = manageSource(this, () => omit(this, 'systray', '_area'), {
            keys: [x => x && Main.wm.removeKeybinding(Field.KEYS), x => x && Main.wm.addKeybinding(Field.KEYS,
                this._fulu.gset, Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this.summon())],
        });
    }

    _bindSettings() {
        this._fulu.attach({
            format:        [Field.FMTS, 'uint'],
            enable_fmt:    [Field.FMT,  'boolean'],
            systray:       [Field.STRY, 'boolean'],
            auto_copy:     [Field.COPY, 'boolean'],
            shortcut:      [Field.KEY,  'boolean'],
            menu_size:     [Field.MSIZ, 'uint'],
            notify_style:  [Field.NTFS, 'uint'],
            enable_notify: [Field.NTF,  'boolean'],
        }, this);
    }

    set shortcut(shortcut) {
        this._src.keys.refreshSource(shortcut);
    }

    set systray(systray) {
        if(xnor(systray, this._btn)) return;
        if(systray) this._btn = Main.panel.addToStatusArea(getSelf().uuid, new ColorButton(this._fulu, () => this.summon(), 0.5));
        else omit(this, '_btn');
    }

    summon() {
        if(this._area) return;
        this._btn?.add_style_pseudo_class('busy');
        this._area = new ColorArea({ format: this.enable_fmt ? this.format : null, fulu: this._fulu });
        connect(this, [this._area, 'end-pick', () => this.dispel(), 'notify-color', this.inform.bind(this)]);
    }

    dispel() {
        if(!this._area) return;
        this._btn?.remove_style_pseudo_class('busy');
        if(this.auto_copy && this._picked.length) setClipboard(this._picked.join(' '));
        this._picked.length = 0;
        omit(this, '_area');
    }

    inform(_a, color) {
        let text = color.toText();
        this._picked.push(text);
        this._btn?._addHistory(color.toRaw());
        if(!this.enable_notify) return;
        let icon = Gio.BytesIcon.new(genColorSwatch(color.toText(Format.HEX)));
        if(this.notify_style === Notify.MSG) {
            let source = new MessageTray.SystemNotificationSource();
            source.getIcon = () => icon;
            source.iconUpdated();
            Main.messageTray.add(source);
            let notification = new MessageTray.Notification(source, getSelf().metadata.name, _('%s is picked.').format(text));
            notification.setTransient(true);
            source.showNotification(notification);
        } else {
            Main.osdWindowManager.show(global.display.get_current_monitor(), icon, text);
        }
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            try {
                if(this._area) throw gerror('FAILED', 'Cannot start picking');
                this._btn?.add_style_pseudo_class('busy');
                this._area = new ColorArea({ once: true, fulu: this._fulu });
                connect(this, [this._area, 'end-pick', (_a, aborted) => { this.dispel(); if(aborted) reject(Error('aborted')); },
                    'notify-color', (_a, color) => resolve(color.toText(Format.HEX))]);
            } catch(e) {
                reject(e);
            }
        });
    }
}

export default class Extension extends ExtensionBase {
    $klass = ColorPicker;
    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        if(!this.$delegate) throw Error('disabled');
        return this.$delegate.pickAsync();
    }
}
