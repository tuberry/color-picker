// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
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

import * as T from './util.js';
import * as M from './menu.js';
import * as F from './fubar.js';
import {Key as K, Preset} from './const.js';

import Color from './color.js';

const {_} = F;
const Notify = {MSG: 0, OSD: 1};
const Preview = {LENS: 0, LABEL: 1};
const Sound = {SCREENSHOT: 0, COMPLETE: 1};
const Format = T.omap(Preset, ([k, v]) => [[v, k]]);

const genColorSwatch = color => T.encode(`<svg width="64" height="64" fill="${color}" viewBox="0 0 1 1">
    <rect width=".75" height=".75" x=".125" y=".125" rx=".15"/>
</svg>`);

class ColorSlider extends Slider.Slider {
    static {
        T.enrol(this);
    }

    constructor(form, value, step, color, callback) {
        super(value);
        this.$meta = {form, step, color};
        this.connect('notify::value', () => callback(form, this.value));
    }

    vfunc_repaint() {
        let cr = this.get_context(),
            {color, form} = this.$meta,
            [width, height] = this.get_surface_size(),
            gradient = new Cairo.LinearGradient(0, 0, width, 0),
            barLevelRadius = Math.min(width, this._barLevelHeight) / 2,
            rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        cr.arc(barLevelRadius, height / 2, barLevelRadius, Math.PI * (1 / 2), Math.PI * (3 / 2));
        cr.arc(width - barLevelRadius, height / 2, barLevelRadius, Math.PI * 3 / 2, Math.PI / 2);
        color.toStops(form, rtl).forEach(x => gradient.addColorStopRGBA(...x));
        cr.setSource(gradient);
        cr.fill();

        let ceiledHandleRadius = Math.ceil(this._handleRadius),
            handleX = ceiledHandleRadius + (width - 2 * ceiledHandleRadius) * this._value / this._maxValue,
            handleY = height / 2;
        if(rtl) handleX = width - handleX;
        cr.setSourceRGB(...color.toRGB());
        cr.arc(handleX, handleY, this._handleRadius, 0, 2 * Math.PI);
        cr.fill();
        cr.setSourceColor(this.get_theme_node().get_foreground_color());
        cr.arc(handleX, handleY, barLevelRadius, 0, 2 * Math.PI);
        cr.fill();

        cr.$dispose();
    }

    #update(delta) {
        this.value = Math.clamp(this._value + delta, 0, this._maxValue);
    }

    vfunc_key_press_event(event) {
        let rtl = this.get_text_direction() === Clutter.TextDirection.RTL;
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Left: this.#update(rtl ? this.$meta.step : -this.$meta.step); break;
        case Clutter.KEY_Right: this.#update(rtl ? -this.$meta.step : this.$meta.step); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_STOP;
    }

    scroll(event) {
        if(event.is_pointer_emulated()) return Clutter.EVENT_PROPAGATE;
        switch(event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: this.#update(this.$meta.step); break;
        case Clutter.ScrollDirection.DOWN: this.#update(-this.$meta.step); break;
        case Clutter.ScrollDirection.SMOOTH: this.#update(-event.get_scroll_delta().at(1) * this.$meta.step); break;
        }
        return Clutter.EVENT_STOP;
    }
}

class SliderItem extends PopupMenu.PopupBaseMenuItem {
    static {
        T.enrol(this);
    }

    constructor(form, value, step, color, callback) {
        super({activate: false});
        let slider = new ColorSlider(form, value, step, color, callback);
        let label = new St.Label({text: form.slice(0, 1).toUpperCase(), xExpand: false});
        this.connect('key-press-event', (_a, event) => slider.vfunc_key_press_event(event));
        this.setup = v => { slider._value = v; slider.queue_repaint(); };
        [label, slider].forEach(x => this.add_child(x));
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(color) {
        let cursor = Main.layoutManager.dummyCursor;
        super(cursor, 0.1, St.Side.LEFT);
        this.$color = color;
        this.$formats = T.array(color.formats.length).slice(Preset.length);
        this.$manager = new PopupMenu.PopupMenuManager(cursor);
        this.$manager.addMenu(this);
        this.actor.add_style_class_name('color-picker-menu');
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.hide();
        this.#addItems();
    }

    #addItems() {
        let {r, g, b, Hu, Sl, Ll, Lo, Co, Ho} = this.$color.toItems((k, v, u, s) =>
            new SliderItem(k, v, s ?? 1 / Math.max(u ?? 1, 100), this.$color, (...xs) => this.#updateSliders(...xs)));
        M.itemize(this.$menu = {
            HEX: this.#genTitleItem(),
            RGB: new M.Separator(), r, g, b,
            HSL: new M.Separator(), Hu, Sl, Ll,
            OKLCH: new M.Separator(), Lo, Co, Ho, // NOTE: irregular space differs from RGB/HSL, see also https://oklch.com/
            custom: this.#genCustomSection(),
        }, this); // TODO: ? replace HSL and OKLCH with OKHSL, see https://github.com/w3c/csswg-drafts/issues/8659 and https://bottosson.github.io/posts/colorpicker/
        this.actor.connect('key-press-event', (_a, e) => { M.altNum(e.get_key_symbol(), e, this.$menu.HEX); });
    }

    #updateSliders(form, value) {
        if(form) this.$color.update(form, value);
        this.$color.toItems((k, v) => k === form || this.$menu[k].setup(v));
        Preset.slice(1).forEach(x => this.$menu[x].label.set_text(this.$color.toText(Format[x])));
        this.$menu.custom.updateLabels();
        this.emit('color-changed');
    }

    #genCustomSection() {
        let ret = new PopupMenu.PopupMenuSection();
        let items = this.$formats.map(x => new M.Item('', () => this.#emitSelected(x)));
        if(items.length) ret.addMenuItem(new M.Separator(_('Others')));
        ret.updateLabels = () => items.forEach((x, i) => x.label.set_text(this.$color.toText(this.$formats[i])));
        M.itemize(items, ret);
        return ret;
    }

    #genTitleItem() {
        let ret = new M.Item('', () => this.emit('color-selected', this.$color), {can_focus: false});
        Preset.forEach((x, i) => ret.insert_child_at_index(T.hook({
            clicked: () => { this.close(); this.#emitSelected(Format[x]); },
        }, new St.Button({canFocus: true, label: x, styleClass: 'color-picker-button button'})), i));
        return ret;
    }

    #emitSelected(format) {
        this.$color.format = format;
        this.emit('color-selected', this.$color);
    }

    summon(geometry) {
        this.#updateSliders();
        Main.layoutManager.setDummyCursorGeometry(...geometry);
        this.open(BoxPointer.PopupAnimation.FULL);
    }
}

class ColorLens extends St.DrawingArea {
    static {
        T.enrol(this);
    }

    constructor(param) {
        super({styleClass: 'color-picker-lens', ...param});
        this.$meta = {x: 0, y: 0, color: new Color(), pixels: [], area: [0, 0, 0, 0, 0]};
        this.$zoom = 8 * F.theme().scaleFactor; // grid length
        this.$unit = 1 / this.$zoom;
    }

    setup(lens) {
        this.$meta = lens;
        let s = this.$zoom;
        let {x, y, area: [w, h, c_x, c_y]} = lens;
        this.set_size((w + 2) * s, (h + 2) * s);
        this.set_position(x - (c_x + 1) * s, y - (c_y + 1) * s);
        this.queue_repaint();
    }

    vfunc_repaint() {
        let cr = this.get_context(),
            {color, pixels, area: [w, h, c_x, c_y, r]} = this.$meta,
            s = this.$zoom;
        cr.scale(s, s);
        cr.translate(1, 1);
        // clipRing
        cr.save();
        cr.setLineWidth(1);
        cr.setSourceRGB(...color.toRGB());
        cr.arc(c_x + 1 / 2, c_y + 1 / 2, r + 1 / 2, 0, Math.PI * 2);
        cr.strokePreserve();
        cr.setLineWidth(1 / 2);
        cr.setSourceRGBA(1, 1, 1, 0.5);
        cr.strokePreserve();
        cr.restore();
        cr.clip();
        // fillGrid
        let r1 = r + 1;
        for(let i = 0; i < w; i++) {
            for(let j = 0; j < h; j++) {
                if(Math.hypot(i - c_x, j - c_y) > r1) continue;
                let [r_, g, b] = pixels.slice((j * w + i) * 4, -1);
                cr.setSourceRGBA(r_ / 255, g / 255, b / 255, 1);
                cr.rectangle(i, j, 1, 1);
                cr.fill();
            }
        }
        // lineGrid
        let l = Math.max(w, h);
        cr.setLineWidth(this.$unit);
        cr.setSourceRGBA(0, 0, 0, 0.4);
        for(let i = 0; i <= l; i++) {
            cr.moveTo(i, 0);
            cr.lineTo(i, l);
            cr.moveTo(0, i);
            cr.lineTo(l, i);
        }
        cr.stroke();
        // showPixel
        cr.setLineWidth(this.$unit * 2);
        cr.setSourceRGB(...color.toComplement());
        cr.rectangle(c_x, c_y, 1, 1);
        cr.stroke();

        cr.$dispose();
    }
}

class ColorViewer extends BoxPointer.BoxPointer {
    static {
        T.enrol(this);
    }

    constructor(plain) {
        super(St.Side.TOP);
        Main.layoutManager.addTopChrome(this);
        this.set({visible: false, styleClass: 'color-picker-boxpointer'});
        this.bin.set_child(new St.Label({styleClass: 'color-picker-label'}));
        this.$src = F.Source.tie({lens: this.#genLens(plain)}, this);
    }

    #genLens(plain) {
        let ret;
        if(plain) {
            ret = new Clutter.Actor({opacity: 0, width: 12, height: 12});
            ret.setup = ({x, y}) => ret.set_position(x, y);
            this.$pos = 0;
        } else {
            ret = new ColorLens({width: 1, height: 1});
            this.$pos = 1 / 2;
        }
        Main.layoutManager.addTopChrome(ret);
        return ret;
    }

    get extents() {
        return this.get_transformed_position().concat(this.get_transformed_size());
    }

    summon(view) {
        this.setup(view.color);
        this.setPosition(this.$src.lens, this.$pos);
        this.$src.lens.setup(view);
        this.open(BoxPointer.PopupAnimation.NONE);
    }

    setup(color) {
        F.marks(this.bin.child, color.toPreview());
    }
}

class ColorArea extends St.Widget {
    static {
        T.enrol(this, null, {
            Signals: {
                'end-pick': {param_types: [GObject.TYPE_BOOLEAN]},
                'notify-color': {param_types: [GObject.TYPE_JSOBJECT]},
            },
        });
    }

    constructor(set, once, ...args) {
        super({reactive: true, styleClass: 'screenshot-ui-screen-screenshot'});
        this.#buildWidgets(...args);
        this.#bindSettings(set, once);
        this.#buildSources();
        this.#initContents();
    }

    #bindSettings(set, once) {
        this.$set = set.tie([
            K.MKEY, K.QKEY,
            [K.PRST, x => { this.$once = once || !x; }],
            [K.MENU, null, x => this.$src.format.toggle(x)],
        ], this).tie([
            [K.PVW,  null, x => this.$src.viewer.toggle(x)],
            [K.PVWS, x => x === Preview.LABEL, x => this.$src.viewer.reload(x)],
        ], this, null, () => this.#onViewerSet());
    }

    #buildWidgets(format, formats) {
        Main.layoutManager.addTopChrome(this);
        Main.pushModal(this, {actionMode: Shell.ActionMode.POPUP});
        Main.uiGroup.set_child_above_sibling(Main.messageTray, this); // NOTE: show notifications in persistent mode
        this.add_constraint(new Clutter.BindConstraint({source: global.stage, coordinate: Clutter.BindCoordinate.ALL}));
        this.connect('popup-menu', () => this.$src.format.hub?.summon(this.viewer?.extents ?? this.$coords.concat(12, 12)));
        this.$ptr = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        this.$color = Color.newForFormat(format, formats);
    }

    #buildSources() {
        let setCursor = x => global.display.set_cursor(x),
            cursor = new F.Source((x = this.cursor) => x && setCursor(x), () => setCursor(Meta.Cursor.DEFAULT), true),
            format = F.Source.new(() => T.hook({
                'open-state-changed': (_w, open) => this.$src.cursor.toggle(!open),
                'color-selected': () => this.#emitColor(),
                'color-changed': () => this.viewer?.setup(this.$color),
            }, new ColorMenu(this.$color)), this[K.MENU]),
            viewer = F.Source.new(() => new ColorViewer(this[K.PVWS]), this[K.PVW]);
        this.$src = F.Source.tie({cursor, format, viewer}, this);
    }

    async #initContents() {
        let [content, scale] = await new Shell.Screenshot().screenshot_stage_to_content();
        this.set_content(content);
        let texture = content.get_texture();
        this.$meta = {scale, texture, width: texture.get_width() - 1, height: texture.get_height() - 1};
        this.$pick = this.#pick; // HACK: workaround for unexpected motion events when using shortcut on Xorg
        if(this.$coords) this.$pick(this.$coords);
    }

    #onViewerSet() {
        this.$src.cursor.summon();
        if(this.$coords) this.$pick(this.$coords);
    }

    get viewer() {
        return this.$src.viewer?.hub;
    }

    get cursor() {
        return !this[K.PVW] || this[K.PVWS] ? Meta.Cursor.CROSSHAIR : Meta.Cursor.NONE;
    }

    $pick(coords) {
        this.$coords = coords;
    }

    async #pick(coords) {
        this.$coords = coords;
        try {
            let [x, y] = coords.map(Math.round),
                {scale, width, height, texture} = this.$meta,
                stream = Gio.MemoryOutputStream.new_resizable(),
                [a, b, w, h, c_x, c_y, r] = this.#getLoupe(x, y, scale, width, height),
                pixbuf = await Shell.Screenshot.composite_to_stream(texture, a, b, w, h, scale, null, 0, 0, 1, stream),
                pixels = pixbuf.get_pixels();
            stream.close(null);
            this.$color.fromPixels(pixels, (c_y * w + c_x) * 4);
            this.viewer?.summon({x, y, color: this.$color, pixels, area: [w, h, c_x, c_y, r]});
        } catch(e) {
            this.emit('end-pick', true);
        }
    }

    #getLoupe(x, y, scale, width, height) {
        x = Math.clamp(Math.round(x * scale), 0, width);
        y = Math.clamp(Math.round(y * scale), 0, height);
        if(this[K.PVWS]) return [x, y, 1, 1, 0, 0, 0];
        let r = 10,
            a = Math.max(x - r, 0),
            b = Math.max(y - r, 0),
            w = Math.min(x, width - x, r) + r + 1,
            h = Math.min(y, height - y, r) + r + 1;
        return [a, b, w, h, x - a, y - b, r];
    }

    #emitColor() {
        this.emit('notify-color', this.$color);
        if(this.$once) this.emit('end-pick', false);
    }

    vfunc_motion_event(event) {
        this.$pick(event.get_coords());
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_enter_event(event) {
        this.$pick(event.get_coords());
        return super.vfunc_enter_event(event);
    }

    #moveBy(dx, dy, event) {
        let step = event.get_state() & Clutter.ModifierType.CONTROL_MASK ? 8 : 1;
        this.$ptr.notify_relative_motion(global.get_current_time(), dx * step, dy * step);
    }

    vfunc_key_press_event(event) {
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Escape:
        case Clutter[`KEY_${this[K.QKEY]}`]: this.emit('end-pick', true); break;
        case Clutter[`KEY_${this[K.MKEY]}`]: this.emit('popup-menu'); break;
        case Clutter.KEY_a:
        case Clutter.KEY_h:
        case Clutter.KEY_Left: this.#moveBy(-1, 0, event); break;
        case Clutter.KEY_w:
        case Clutter.KEY_k:
        case Clutter.KEY_Up: this.#moveBy(0, -1, event); break;
        case Clutter.KEY_d:
        case Clutter.KEY_l:
        case Clutter.KEY_Right: this.#moveBy(1, 0, event); break;
        case Clutter.KEY_s:
        case Clutter.KEY_j:
        case Clutter.KEY_Down: this.#moveBy(0, 1, event); break;
        case Clutter.KEY_space:
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter: this.#emitColor(); break;
        case Clutter.KEY_Shift_L:
        case Clutter.KEY_Shift_R: this.$set.set(K.PVWS, this[K.PVWS] ? Preview.LENS : Preview.LABEL, this); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_scroll_event(event) {
        switch(event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: if(this[K.PVWS]) this.$set.set(K.PVWS, Preview.LENS); break;
        case Clutter.ScrollDirection.DOWN: if(!this[K.PVWS]) this.$set.set(K.PVWS, Preview.LABEL); break;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_press_event(event) {
        switch(event.get_button()) {
        case Clutter.BUTTON_PRIMARY: this.#emitColor(); break;
        case Clutter.BUTTON_MIDDLE: this.emit('popup-menu'); break;
        default: this.emit('end-pick', true); break;
        }
        return Clutter.EVENT_PROPAGATE;
    }
}

class ColorItem extends M.DatumItemBase {
    static {
        T.enrol(this);
    }

    constructor(star, remove, color) {
        super('color-picker-item-label', 'color-picker-icon', () => F.copy(this.$color.toText()), color);
        this.$onRemove = () => remove(this.$color.toRaw());
        this.$onClick = () => star(this.$color.toRaw());
    }

    activate(event) {
        let type = event.type();
        if((type === Clutter.EventType.BUTTON_RELEASE || type === Clutter.EventType.PAD_BUTTON_RELEASE) &&
           event.get_button() === Clutter.BUTTON_MIDDLE) this.$onRemove();
        else super.activate(event);
    }

    vfunc_key_press_event(event) {
        let key = event.get_key_symbol();
        if(key === Clutter.KEY_Delete || key === Clutter.KEY_BackSpace) {
            this.$onRemove();
            return Clutter.EVENT_STOP;
        } else {
            return super.vfunc_key_press_event(event);
        }
    }

    setup(color) {
        let [star, raw, fmts] = color;
        this.$color = new Color(raw, fmts);
        F.marks(this.label, this.$color.toMarkup());
        this.$btn.setup(star ? 'starred-symbolic' : 'non-starred-symbolic');
    }
}

class ColorTray extends M.Systray {
    static {
        T.enrol(this);
    }

    constructor(set, ...args) {
        super({});
        this.#bindSettings(set);
        this.#buildWidgets(...args);
    }

    #bindSettings(set) {
        this.$set = set.tie([
            [K.TICN, x => this.$icon.set_icon_name(x || 'color-select-symbolic')],
            [K.MNSZ, x => { this.$tint = x > 0; }, () => this.#onMenuSizeSet(this.$tint)],
        ], this).tie([
            [K.MNTP, x => !!x, x => this.$menu.tool.star?.toggleState(x)], K.CLCT, K.HIST,
        ], this, null, () => this.#onColorsSet());
    }

    #onMenuSizeSet(tint) {
        if(T.xnor(tint, this.$menu.tint)) return;
        if(!tint) [K.CLCT, K.HIST].forEach(x => this.$set.set(x, []));
        M.record(tint, this, null, 'sep1', 'tool', () => this.#genTintSection(), 'tint', 'sep1');
        this.$menu.tool.setup(this.#genTool());
    }

    #genTintSection() {
        let star = (...xs) => this.#star(...xs);
        let remove = (...xs) => this.#remove(...xs);
        return new M.DatasetSection(() => new ColorItem(star, remove), this.#getColors());
    }

    #buildWidgets(formats, callback, fmts) {
        this.$formats = formats;
        this.$callback = callback;
        this.add_style_class_name('color-picker-systray');
        M.itemize(this.$menu = {
            fmts, sep0: fmts ? new M.Separator() : null,
            tint: this.$tint ? this.#genTintSection() : null,
            sep1: this.$tint ? new M.Separator() : null,
            tool: new M.ToolItem(this.#genTool()),
        }, this.menu);
        this.menu.actor.add_style_class_name('color-picker-menu');
        this.menu.actor.connect('key-press-event', (...xs) => this.#onKeyPress(...xs));
    }

    #onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(M.altNum(key, event, this.$menu.tool));
        else if(key === Clutter.KEY_Shift_R) this.$set.not(K.MNTP);
    }

    #genTool() {
        let param = {styleClass: 'color-picker-icon', xExpand: true};
        return {
            draw: new M.Button(param, () => { this.menu.close(); this.$callback(); }, 'find-location-symbolic'),
            star: this.$tint ? new M.StateButton(param, () => this.$set.not(K.MNTP),
                [this[K.MNTP], 'semi-starred-symbolic', 'starred-symbolic']) : null,
            gear: new M.Button(param, () => { this.menu.close(); F.me().openPreferences(); }, 'applications-system-symbolic'),
        };
    }

    #onColorsSet() {
        this.$menu.tint?.setup(this.#getColors());
    }

    #getColors() {
        return this[K.MNTP] ? this[K.CLCT].map(x => [true, x, this.$formats])
            : this[K.HIST].map(x => [this[K.CLCT].includes(x), x, this.$formats]);
    }

    #star(color) {
        this.$set.set(K.CLCT, this[K.CLCT].includes(color) ? this[K.CLCT].filter(x => x !== color)
            : [color].concat(this[K.CLCT]).slice(0, this[K.MNSZ]));
    }

    #remove(color) {
        if(this[K.MNTP]) this.$set.set(K.CLCT, this[K.CLCT].filter(x => x !== color));
        else this.$set.set(K.HIST, this[K.HIST].filter(x => x !== color));
    }

    vfunc_event(event) {
        let type = event.type();
        if((type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.PAD_BUTTON_PRESS) &&
           event.get_button() === Clutter.BUTTON_PRIMARY) {
            this.$callback();
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_event(event);
    }

    addHistory(color) {
        if(this.$tint) this.$set.set(K.HIST, [color].concat(this[K.HIST]).slice(0, this[K.MNSZ]));
    }

    setFormats(formats) {
        this.$formats = formats;
        this.#onColorsSet();
    }
}

class ColorPicker extends F.Mortal {
    constructor(gset) {
        super();
        this.#bindSettings(gset);
        this.#buildSources();
    }

    #buildSources() {
        let tray = F.Source.new(() => this.#genSystray(), this[K.STRY]),
            area = new F.Source((hooks, ...args) => T.hook(hooks, new ColorArea(...args))),
            keys = F.Source.newKeys(this.$set.hub, K.KEYS, () => this.summon(), this[K.KEY]),
            dbus = F.Source.newDBus('org.gnome.Shell.Extensions.ColorPicker', '/org/gnome/Shell/Extensions/ColorPicker', this, true);
        this.$src = F.Source.tie({tray, area, keys, dbus}, this);
    }

    #bindSettings(gset) {
        this.$set = new F.Setting(gset, [
            K.HEX, K.RGB, K.HSL, K.OKLCH,
            [K.CFMT, x => this.#onCustomSet(x), () => this.tray?.$menu.fmts?.setup(this.$options)],
        ], this, () => this.#onFormatsSet(), () => this.tray?.setFormats(this.$formats)).tie([
            K.SND, K.NTFS, K.NTF,
            [K.COPY, x => x ? [] : null],
            [K.KEY,  null, x => this.$src.keys.toggle(x)],
            [K.STRY, null, x => this.$src.tray.toggle(x)],
            [K.FMT,  null, x => this.#onEnableFormatSet(x)],
            [K.FMTS, null, x => this.tray?.$menu.fmts?.choose(x)],
            [K.SNDS, x => x === Sound.COMPLETE ? 'complete' : 'screen-capture'],
        ], this);
    }

    get tray() {
        return this.$src.tray.hub;
    }

    #onCustomSet(custom) {
        return T.seq(x => { this.$options = Preset.concat(x.map(y => y.name)); }, custom.filter(x => x.enable));
    }

    #onFormatsSet() {
        this.$formats = [K.HEX, K.RGB, K.HSL, K.OKLCH].map(x => this[x]).concat(this[K.CFMT].map(x => x.format));
    }

    #onEnableFormatSet(enable) {
        M.record(enable, this.tray, null, 'sep0', this.tray?.$tint ? 'tint' : 'tool', () => this.#genFormatItem(), 'fmts', 'sep0');
    }

    #genFormatItem() {
        return new M.RadioItem(_('Default format'), this.$options, this[K.FMTS], x => this.$set.set(K.FMTS, x));
    }

    #genSystray() {
        return new ColorTray(this.$set, this.$formats, () => this.summon(), this[K.FMT] ? this.#genFormatItem() : null);
    }

    summon() {
        if(this.$src.area.active) return;
        this.tray?.add_style_pseudo_class('state-busy'); // FIXME: works later than screenshot on first run
        this.$src.area.summon({'end-pick': () => this.dispel(), 'notify-color': (_a, x) => this.inform(x)},
            this.$set, false, this[K.FMT] ? this[K.FMTS] : Format.HEX, this.$formats);
    }

    dispel() {
        if(!this.$src.area.active) return;
        this.tray?.remove_style_pseudo_class('state-busy');
        if(this[K.COPY]?.length) F.copy(this[K.COPY].splice(0).join('\n'));
        this.$src.area.dispel();
    }

    inform(color) {
        let text = color.toText();
        this[K.COPY]?.push(text);
        this.tray?.addHistory(color.toRaw());
        if(this[K.SND]) global.display.get_sound_player().play_from_theme(this[K.SNDS], _('Color picked'), null);
        if(!this[K.NTF]) return;
        let gicon = Gio.BytesIcon.new(genColorSwatch(color.toHEX()));
        if(this[K.NTFS] === Notify.MSG) {
            let title = F.me().metadata.name,
                source = MessageTray.getSystemSource(),
                message = new MessageTray.Notification({gicon, source, isTransient: true, title, body: _('%s is picked.').format(text)});
            source.addNotification(message);
        } else {
            Main.osdWindowManager.show(global.display.get_current_monitor(), gicon, text);
        }
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            if(this.$src.area.active) reject(Error('busy'));
            this.tray?.add_style_pseudo_class('state-busy');
            this.$src.area.summon({
                'notify-color': (_a, color) => resolve(color.toRGB()),
                'end-pick': (_a, aborted) => { this.dispel(); if(aborted) reject(Error('aborted')); },
            }, this.$set, true);
        });
    }

    async PickAsync(_p, invocation) {
        try {
            invocation.return_value(T.pickle([{color: await this.pickAsync()}], true, 'd'));
        } catch(e) {
            invocation.return_error_literal(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
        }
    }

    Run = this.summon;
}

export default class extends F.Extension {
    $klass = ColorPicker;
    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        if(!this[F.hub]) throw Error('disabled');
        return this[F.hub].pickAsync();
    }
}
