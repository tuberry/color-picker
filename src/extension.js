// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

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
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {Color} from './color.js';
import {Field, Format} from './const.js';
import {encode, omap, xnor, gprops, hook, execute} from './util.js';
import {IconButton, MenuItem, RadioItem, IconItem, PanelButton} from './menu.js';
import {Fulu, ExtensionBase, Destroyable, symbiose, omit, _, getSelf, copy, paste} from './fubar.js';

const setCursor = x => global.display.set_cursor(x);

const Notify = {MSG: 0, OSD: 1};
const Sound = {SCREENSHOT: 0, COMPLETE: 1};
const Preview = {LENS: 0, ICON: 1, LABEL: 2};
const CP_IFACE = `<node>
    <interface name="org.gnome.Shell.Extensions.ColorPicker">
        <method name="Pick">
            <arg type="a{sv}" direction="out" name="result"/>
        </method>
    </interface>
</node>`; // same result as XDG ColorPicker portal

const genColorSwatch = x => encode(`<svg width="64" height="64" fill="${x}" viewBox="0 0 1 1">
    <rect width=".75" height=".75" x=".125" y=".125" rx=".15"/>
</svg>`);

function hookNoMarkupOnKeyFocus(label) { // HACK: workaround for low discoverability of the inner-border(box-shadow) around the markup
    label.setMarkup = x => { label._markup = x; label.clutter_text.set_markup(x); };
    label.connect('key-focus-out', a => { a.clutter_text.set_use_markup(true); a.setMarkup(a._markup); });
    label.connect('key-focus-in', a => a.clutter_text.set_use_markup(false));
}

class ColorItem extends MenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(callback, item) {
        super('', () => copy(this._color.toText()), {can_focus: false});
        hookNoMarkupOnKeyFocus(this.label);
        this.label.set_x_expand(true);
        this.label.set_can_focus(true);
        this.label.add_style_class_name('color-picker-item-label');
        this._btn = new IconButton({style_class: 'color-picker-icon'}, () => callback(this._color.toRaw()));
        this.add_child(this._btn);
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
    constructor(colors, callback) {
        super();
        this.setColors(colors, callback);
    }

    setColors(colors, callback) {
        let items = this._getMenuItems();
        let diff = colors.length - items.length;
        if(diff > 0) for(let a = 0; a < diff; a++) this.addMenuItem(new ColorItem(callback));
        else if(diff < 0) for(let a = 0; a > diff; a--) items.at(a - 1).destroy();
        this._getMenuItems().forEach((x, i) => x.setItem(colors[i]));
    }
}

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
    }

    constructor(type, value, step, color, callback) {
        super(value);
        this._data = {type, step, color};
        this.connect('notify::value', () => callback(type, this.value));
    }

    vfunc_repaint() { // ignore border on colorful bg
        let cr = this.get_context(),
            themeNode = this.get_theme_node(),
            [width, height] = this.get_surface_size(),
            gradient = new Cairo.LinearGradient(0, 0, width, 0),
            barLevelRadius = Math.min(width, this._barLevelHeight) / 2;
        // draw background
        cr.arc(barLevelRadius, height / 2, barLevelRadius, Math.PI * (1 / 2), Math.PI * (3 / 2));
        cr.arc(width - barLevelRadius, height / 2, barLevelRadius, Math.PI * 3 / 2, Math.PI / 2);
        this._data.color.toStops(this._data.type).forEach(x => gradient.addColorStopRGBA(...x));
        cr.setSource(gradient);
        cr.fill();

        let ceiledHandleRadius = Math.ceil(this._handleRadius),
            handleX = ceiledHandleRadius + (width - 2 * ceiledHandleRadius) * this._value / this._maxValue,
            handleY = height / 2;
        // draw handle
        cr.setSourceRGB(...this._data.color.rgb);
        cr.arc(handleX, handleY, this._handleRadius, 0, 2 * Math.PI);
        cr.fill();
        cr.setSourceColor(themeNode.get_foreground_color());
        cr.arc(handleX, handleY, barLevelRadius, 0, 2 * Math.PI);
        cr.fill();
        cr.$dispose();
    }

    _updateValue(delta) {
        this.value = Math.clamp(this._value + delta, 0, this._maxValue);
    }

    vfunc_key_press_event(event) {
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Left: this._updateValue(-this._data.step); break;
        case Clutter.KEY_Right: this._updateValue(this._data.step); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_STOP;
    }

    scroll(event) {
        if(event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        switch(event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: this._updateValue(this._data.step); break;
        case Clutter.ScrollDirection.DOWN: this._updateValue(-this._data.step); break;
        case Clutter.ScrollDirection.SMOOTH: this._updateValue(-event.get_scroll_delta().at(1) * this._data.step); break;
        }
        return Clutter.EVENT_STOP;
    }
}

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        GObject.registerClass(this);
    }

    constructor(type, value, step, color, callback) {
        super({activate: false});
        let slider = new ColorSlider(type, value, step, color, callback);
        let label = new St.Label({text: type.toUpperCase(), x_expand: false});
        this.connect('key-press-event', (_a, event) => slider.vfunc_key_press_event(event));
        this._setValue = v => { slider._value = v; slider.queue_repaint(); };
        [label, slider].forEach(x => this.add_child(x));
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
        let {r, g, b, h, s, l} = this.color.toRGBHSL();
        this._menus = {
            HEX: this._genHEXItem(),
            RGB: new PopupMenu.PopupSeparatorMenuItem(),
            r: this._genSliderItem({r}, 1 / 255),
            g: this._genSliderItem({g}, 1 / 255),
            b: this._genSliderItem({b}, 1 / 255),
            HSL: new PopupMenu.PopupSeparatorMenuItem(),
            h: this._genSliderItem({h}, 1 / 360),
            s: this._genSliderItem({s}, 1 / 100),
            l: this._genSliderItem({l}, 1 / 100),
            other: new PopupMenu.PopupSeparatorMenuItem(_('Others')),
            HSV: new MenuItem('hsv', () => this._emitSelected(Format.HSV)),
            CMYK: new MenuItem('cmyk', () => this._emitSelected(Format.CMYK)),
            clip: this._genClipItem(),
        };
        Object.values(this._menus).forEach(x => this.addMenuItem(x));
    }

    _genSliderItem(initial, step) {
        let [[type, value]] = Object.entries(initial);
        return new SliderItem(type, value, step, this.color, this._updateSlider.bind(this));
    }

    _updateSlider(type, value) {
        this.color.update(type, value);
        Object.entries(this.color.toRGBHSL()).forEach(([k, v]) => k === type || this._menus[k]._setValue(v));
        this._updateLabelText();
    }

    _updateLabelText() {
        this._menus.HEX.label.setMarkup(this.color.toMarkup(Format.HEX));
        ['RGB', 'HSL', 'HSV', 'CMYK'].forEach(x => this._menus[x].label.set_text(this.color.toText(Format[x])));
    }

    _genClipItem() {
        let item = new PopupMenu.PopupMenuItem(_('Read from clipboard'));
        item.activate = () => paste().then(text => {
            if(this.color.fromText(text)) this._updateSlider();
            else console.warn(`[${getSelf().uuid}]`, `Unknown color format: ${text}`);
        }); // override to keep the menu open after activated
        return item;
    }

    _genHEXItem() {
        let item = new MenuItem('', () => this._emitSelected(Format.HEX), {can_focus: false});
        item.label.add_style_class_name('color-picker-item-label');
        item.label.set_can_focus(true);
        hookNoMarkupOnKeyFocus(item.label);
        ['RGB', 'HSL', 'hex'].forEach((x, i) => item.insert_child_at_index(hook({
            clicked: () => { this.close(); this._emitSelected(Format[x]); },
        }, new St.Button({x_expand: false, can_focus: true, label: x, style_class: 'color-picker-button button'})), i));
        return item;
    }

    summon() {
        this._updateSlider();
        this.open(BoxPointer.PopupAnimation.FULL);
    }

    _emitSelected(format) {
        this.color.format = format;
        this.emit('color-selected', this.color);
    }
}

class ColorLens extends St.DrawingArea {
    static {
        GObject.registerClass(this);
    }

    constructor(param) {
        super({style_class: 'color-picker-lens', ...param});
        this._zoom = 8;
        this._unit = 1 / this._zoom;
        this._data = {color: new Color(), pixels: [], scale: 1, area: [0, 0, 0, 0, 0]};
    }

    setColor(x, y, color, pixels, [w, h, c_x, c_y, r]) {
        let s = this._zoom * St.ThemeContext.get_for_stage(global.stage).scaleFactor; // grid length
        this._data = {color, pixels, scale: s, area: [w, h, c_x, c_y, r]};
        this.set_position(x - (c_x + 1) * s, y - (c_y + 1) * s);
        this.set_size((w + 2) * s, (h + 2) * s);
        this.queue_repaint();
    }

    vfunc_repaint() {
        let cr = this.get_context();
        let {color, pixels, scale: s, area: [w, h, c_x, c_y, r]} = this._data;
        cr.scale(s, s);
        cr.translate(1, 1);
        this._clipRing(cr, color, c_x, c_y, r);
        this._fillGrid(cr, pixels, w, h, c_x, c_y, r + 1);
        this._lineGrid(cr, Math.max(w, h));
        this._showPixel(cr, color, c_x, c_y);
        cr.$dispose();
    }

    _clipRing(cr, color, c_x, c_y, r) {
        cr.save();
        cr.setLineWidth(1);
        cr.setSourceRGB(...color.rgb);
        cr.arc(c_x + 1 / 2, c_y + 1 / 2, r + 1 / 2, 0, Math.PI * 2);
        cr.strokePreserve();
        cr.setLineWidth(1 / 2);
        cr.setSourceRGBA(1, 1, 1, 0.4);
        cr.strokePreserve();
        cr.restore();
        cr.clip();
    }

    _fillGrid(cr, pixels, w, h, c_x, c_y, r) {
        for(let i = 0; i < w; i++) {
            for(let j = 0; j < h; j++) {
                if(Math.hypot(i - c_x, j - c_y) > r) continue;
                let [red, g, b] = pixels.slice((j * w + i) * 4, -1);
                cr.setSourceRGBA(red / 255, g / 255, b / 255, 1);
                cr.rectangle(i, j, 1, 1);
                cr.fill();
            }
        }
    }

    _lineGrid(cr, l) {
        cr.setLineWidth(this._unit);
        cr.setSourceRGBA(0, 0, 0, 0.4);
        for(let i = 0; i <= l; i++) {
            cr.moveTo(i, 0);
            cr.lineTo(i, l);
            cr.moveTo(0, i);
            cr.lineTo(l, i);
        }
        cr.stroke();
    }

    _showPixel(cr, color, c_x, c_y) {
        cr.setLineWidth(this._unit * 2);
        cr.setSourceRGB(...color.toComplement());
        cr.rectangle(c_x, c_y, 1, 1);
        cr.stroke();
    }
}

class ColorLabel extends BoxPointer.BoxPointer {
    static {
        GObject.registerClass(this);
    }

    constructor(lens) {
        super(St.Side.TOP);
        this._lens = lens;
        this.visible = false;
        Main.layoutManager.addTopChrome(this);
        this.style_class = 'color-picker-boxpointer';
        this.cursor_type = lens ? Meta.Cursor.BLANK : Meta.Cursor.CROSSHAIR;
        this._cursor = lens ? new ColorLens({width: 1, height: 1}) : new Clutter.Actor({opacity: 0, width: 20, height: 20});
        Main.layoutManager.addTopChrome(this._cursor);
        this._label = new St.Label({style_class: 'color-picker-label'});
        this.bin.set_child(this._label);
        symbiose(this, () => omit(this, '_cursor'));
    }

    setColor(x, y, color, pixels, area) {
        this.close(BoxPointer.PopupAnimation.NONE);
        this._label.clutter_text.set_markup(`<span bgcolor="${color.toText(Format.HEX)}">\u2001 </span> ${color.toText()}`);
        if(this._lens) {
            this._cursor.setColor(x, y, color, pixels, area);
            this.setPosition(this._cursor, 1 / 2);
        } else {
            this._cursor.set_position(x, y);
            this.setPosition(this._cursor, 0);
        }
        this.open(BoxPointer.PopupAnimation.NONE);
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
        super({chroma: new Clutter.Color({red: 80, green: 219, blue: 181}), ...param});
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
            let {red, green, blue} = this[_key] = this[key].copy();
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
        let gicon = new Gio.FileIcon({file: Gio.File.new_for_uri('resource:///org/gnome/shell/icons/scalable/actions/color-pick.svg')});
        super({visible: false, gicon, effect, icon_size: Meta.prefs_get_cursor_size() * 1.45});
        Main.layoutManager.addTopChrome(this);
        this.cursor_type = Meta.Cursor.BLANK;
        this._effect = effect;
    }

    setColor(x, y, color) {
        this._effect.color = new Clutter.Color(color.toNamed());
        this.set_position(x, y);
        this.show();
    }
}

class ColorArea extends St.Widget {
    static {
        GObject.registerClass({
            Signals: {
                'end-pick': {param_types: [GObject.TYPE_BOOLEAN]},
                'notify-color': {param_types: [GObject.TYPE_JSOBJECT]},
            },
        }, this);
    }

    constructor({fulu, once, format}) {
        super({reactive: true, style_class: 'screenshot-ui-screen-screenshot'});
        Main.layoutManager.addTopChrome(this);
        Main.pushModal(this, {actionMode: Shell.ActionMode.POPUP});
        Main.uiGroup.set_child_above_sibling(Main.messageTray, this); // show notifications in persistent mode
        this.add_constraint(new Clutter.BindConstraint({source: global.stage, coordinate: Clutter.BindCoordinate.ALL}));

        this._color = Color.new_for_format(format);
        this.once = once ?? false;
        this._bindSettings(fulu);
        this._buildWidgets();
    }

    async _buildWidgets() {
        symbiose(this, () => omit(this, 'preview', '_pointer'));
        let [content, scale] = await new Shell.Screenshot().screenshot_stage_to_content();
        this.set_content(content);
        let texture = content.get_texture();
        this._data = {scale, width: texture.get_width() - 1, height: texture.get_height() - 1};
        this._pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this.connect('popup-menu', () => this._menu?.summon());
        if(this._coords) this._pickColor(this._coords);
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

    set preview(preview) {
        if(!xnor(preview, this._view)) {
            if(preview) {
                this._view = this.pvstyle === Preview.ICON ? new ColorIcon() : new ColorLabel(this.pvstyle === Preview.LENS);
                this._menu = hook({
                    'color-selected': (_a, color) => this._emitColor(color),
                    'open-state-changed': (_a, open) => setCursor(open ? Meta.Cursor.DEFAULT : this._view.cursor_type),
                }, new ColorMenu(this));
            } else {
                omit(this, '_menu', '_view');
            }
        }
        setCursor(preview === null ? Meta.Cursor.DEFAULT : this._view?.cursor_type ?? Meta.Cursor.CROSSHAIR);
    }

    async _pickColor(coords) {
        try {
            let [x, y] = coords.map(Math.round),
                texture = this.get_content().get_texture(),
                [a, b, w, h, c_x, c_y, r] = this._getLoupe(x, y),
                stream = Gio.MemoryOutputStream.new_resizable(),
                pixbuf = await Shell.Screenshot.composite_to_stream(texture, a, b, w, h, this._data.scale, null, 0, 0, 1, stream),
                pixels = pixbuf.get_pixels();
            stream.close(null);
            this._color.fromPixel(pixels, (c_y * w + c_x) * 4);
            this._view?.setColor(x, y, this._color, pixels, [w, h, c_x, c_y, r]);
        } catch(e) {
            this.emit('end-pick', true);
        }
    }

    _getLoupe(x, y) {
        let {width, height} = this._data;
        x = Math.clamp(x, 0, width);
        y = Math.clamp(y, 0, height);
        if(this.pvstyle !== Preview.LENS) return [x, y, 1, 1, 0, 0, 0];
        let r = 10,
            a = Math.max(x - r, 0),
            b = Math.max(y - r, 0),
            w = Math.min(x, width - x, r) + r + 1,
            h = Math.min(y, height - y, r) + r + 1;
        return [a, b, w, h, x - a, y - b, r];
    }

    _emitColor(color) {
        this.emit('notify-color', color || this._color);
        if(!this.persist || this.once) this.emit('end-pick', false);
    }

    vfunc_motion_event(event) {
        this._pickColor(event.get_coords());
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_enter_event(event) {
        this._coords = event.get_coords();
        if(this._data) this._pickColor(this._coords);
        return super.vfunc_enter_event(event);
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
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter: this._emitColor(); break;
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

class ColorButton extends PanelButton {
    static {
        GObject.registerClass(this);
    }

    constructor(fulu, callback) {
        super();
        this._buildWidgets(callback);
        this._bindSettings(fulu);
        this._addMenuItems();
    }

    _buildWidgets(callback) {
        this._callback = callback;
        this.menu.actor.add_style_class_name('color-picker-menu');
        this.add_style_class_name('color-picker-systray');
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
        }, this, 'colors');
    }

    set colors([k, v, cb]) {
        this[k] = cb?.(v) ?? v;
        this._menus?.colors.setColors(...this.getColors());
    }

    set format(format) {
        this._format = format;
        this._menus?.format.setChosen(format);
    }

    set icon_name(icon) {
        this._icon.set_icon_name(icon || 'color-select-symbolic');
    }

    set enable_fmt(enable_fmt) {
        if((this._enable_fmt = enable_fmt)) this._menus?.format.show();
        else this._menus?.format.hide();
    }

    _addMenuItems() {
        let param = {style_class: 'color-picker-icon'};
        this._menus = {
            format: new RadioItem(_('Default format'), omap(Format, ([k, v]) => [[v, k]]), this._format, x => this._fulu.set('format', x, this)),
            sep0:   new PopupMenu.PopupSeparatorMenuItem(),
            colors: new ColorSection(...this.getColors()),
            sep1:   new PopupMenu.PopupSeparatorMenuItem(),
            prefs:  new IconItem({
                pick: [param, () => { this.menu.close(); this._callback(); }, 'find-location-symbolic'],
                star: [param, () => this._fulu.set('menu_style', !this.menu_style, this), [this.menu_style, 'semi-starred-symbolic', 'starred-symbolic']],
                gear: [param, () => { this.menu.close(); getSelf().openPreferences(); }, 'emblem-system-symbolic'],
            }),
        };
        Object.values(this._menus).forEach(x => this.menu.addMenuItem(x));
        this.enable_fmt = this._enable_fmt;
    }

    getColors() {
        return [this.menu_style ? this.collect.map(x => [true, x]) : this.history.map(x => [this.collect.includes(x), x]), x => this._starColor(x)];
    }

    _starColor(color) {
        let collect = this.collect.includes(color)
            ? this.collect.filter(x => x !== color)
            : [color].concat(this.collect).slice(0, this.menu_size);
        this._fulu.set('collect', new GLib.Variant('au', collect), this);
    }

    _addHistory(color) {
        let history = [color, ...this.history].slice(0, this.menu_size);
        this._fulu.set('history', new GLib.Variant('au', history), this);
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
        this._portSettings(gset);
    }

    _portSettings(gset) { // FIXME: remove in the next version
        [Field.CLCT, Field.HIST].forEach(key => {
            if(gset.get_value(key).deepUnpack().length) return;
            execute(`dconf read /org/gnome/shell/extensions/color-picker/${key}`).then(out => {
                out &&= GLib.Variant.parse(GLib.VariantType.new('at'), out, null, null).deepUnpack();
                if(out) gset.set_value(key, new GLib.Variant('au', out.map(x => ((x & 0xff) << 24 | (x >>> 8)) >>> 0)));
            }).catch(e => {
                logError(e);
                gset.reset(key);
            });
        });
    }

    _buildWidgets(gset) {
        this.dbus = true;
        this._picked = [];
        this._fulu = new Fulu({}, gset, this);
        this._sbt = symbiose(this, () => omit(this, 'dbus', 'systray', '_area'), {
            keys: [x => x && Main.wm.removeKeybinding(Field.KEYS), x => x && Main.wm.addKeybinding(Field.KEYS, this._fulu.gset,
                Meta.KeyBindingFlags.NONE, Shell.ActionMode.ALL, () => this.summon())],
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
            enable_sound:  [Field.SND,  'boolean'],
            notify_sound:  [Field.SNDS, 'uint'],
            notify_style:  [Field.NTFS, 'uint'],
            enable_notify: [Field.NTF,  'boolean'],
        }, this);
    }

    set shortcut(shortcut) {
        this._sbt.keys.revive(shortcut);
    }

    set systray(systray) {
        if(xnor(systray, this._btn)) return;
        if(systray) this._btn = new ColorButton(this._fulu, () => this.summon());
        else omit(this, '_btn');
    }

    set notify_sound(sound) {
        this._sound = sound === Sound.COMPLETE ? 'complete' : 'screen-capture';
    }

    set dbus(dbus) {
        if(xnor(dbus, this._dbus)) return;
        if(dbus) {
            this._dbus = Gio.DBusExportedObject.wrapJSObject(CP_IFACE, this);
            this._dbus.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/ColorPicker');
        } else {
            this._dbus.flush();
            this._dbus.unexport();
            this._dbus = null;
        }
    }

    summon() {
        if(this._area) return;
        this._btn?.add_style_pseudo_class('state-busy');
        this._area = hook({'end-pick': () => this.dispel(), 'notify-color': this.inform.bind(this)},
            new ColorArea({format: this.enable_fmt ? this.format : null, fulu: this._fulu}));
    }

    dispel() {
        if(!this._area) return;
        this._btn?.remove_style_pseudo_class('state-busy');
        if(this.auto_copy && this._picked.length) copy(this._picked.join(' '));
        this._picked.length = 0;
        omit(this, '_area');
    }

    inform(_a, color) {
        let text = color.toText();
        this._picked.push(text);
        this._btn?._addHistory(color.toRaw());
        if(this.enable_sound) global.display.get_sound_player().play_from_theme(this._sound, _('Color picked'), null);
        if(!this.enable_notify) return;
        let gicon = Gio.BytesIcon.new(genColorSwatch(color.toText(Format.HEX)));
        if(this.notify_style === Notify.MSG) {
            let source = MessageTray.getSystemSource();
            let message = new MessageTray.Notification({
                gicon, source, isTransient: true,
                title: getSelf().metadata.name,
                body: _('%s is picked.').format(text),
            });
            source.addNotification(message);
        } else {
            Main.osdWindowManager.show(global.display.get_current_monitor(), gicon, text);
        }
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            if(this._area) reject(Error('busy'));
            this._btn?.add_style_pseudo_class('state-busy');
            this._area = hook({
                'notify-color': (_a, {rgb}) => resolve(rgb),
                'end-pick': (_a, aborted) => { this.dispel(); if(aborted) reject(Error('aborted')); },
            }, new ColorArea({once: true, fulu: this._fulu}));
        });
    }

    async PickAsync(_param, invocation) {
        try {
            let color = await this.pickAsync();
            invocation.return_value(GLib.Variant.new('(a{sv})', [{color: GLib.Variant.new('(ddd)', color)}]));
        } catch(e) {
            invocation.return_error_literal(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
        }
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
