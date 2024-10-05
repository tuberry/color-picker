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

import * as Util from './util.js';
import * as Menu from './menu.js';
import * as Fubar from './fubar.js';

import {Color} from './color.js';
import {Field, Preset} from './const.js';

const {_} = Fubar;
const Notify = {MSG: 0, OSD: 1};
const Preview = {LENS: 0, LABEL: 1};
const Sound = {SCREENSHOT: 0, COMPLETE: 1};
const Format = Util.omap(Preset, ([k, v]) => [[v, k]]);
const CP_IFACE = `<node>
    <interface name="org.gnome.Shell.Extensions.ColorPicker">
        <method name="Pick">
            <arg type="a{sv}" direction="out" name="result"/>
        </method>
    </interface>
</node>`; // same result as XDP screenshot portal

const genColorSwatch = color => Util.encode(`<svg width="64" height="64" fill="${color}" viewBox="0 0 1 1">
    <rect width=".75" height=".75" x=".125" y=".125" rx=".15"/>
</svg>`);

class ColorSlider extends Slider.Slider {
    static {
        GObject.registerClass(this);
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
        switch(event.get_key_symbol()) {
        case Clutter.KEY_Left: this.#update(-this.$meta.step); break;
        case Clutter.KEY_Right: this.#update(this.$meta.step); break;
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
        GObject.registerClass(this);
    }

    constructor(form, value, step, color, callback) {
        super({activate: false});
        let slider = new ColorSlider(form, value, step, color, callback);
        let label = new St.Label({text: form.substring(0, 1).toUpperCase(), xExpand: false});
        this.connect('key-press-event', (_a, event) => slider.vfunc_key_press_event(event));
        this.setup = v => { slider._value = v; slider.queue_repaint(); };
        [label, slider].forEach(x => this.add_child(x));
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(color) {
        let source = Main.layoutManager.dummyCursor;
        super(source, 0.1, St.Side.LEFT);
        this.$color = color;
        this.$formats = Util.array(color.formats.length).slice(Preset.length);
        this.$manager = new PopupMenu.PopupMenuManager(source);
        this.$manager.addMenu(this);
        this.actor.add_style_class_name('color-picker-menu');
        Main.layoutManager.addTopChrome(this.actor);
        this.actor.hide();
        this.#addItems();
    }

    #addItems() {
        let {r, g, b, Hu, Sl, Ll, Lo, Co, Ho} = this.$color.toItems((k, v, u, s) =>
            new SliderItem(k, v, s ?? 1 / Math.max(u ?? 1, 100), this.$color, (...xs) => this.#updateSliders(...xs)));
        Menu.itemize(this.$menu = {
            HEX: this.#genTitleItem(),
            RGB: new PopupMenu.PopupSeparatorMenuItem(), r, g, b,
            HSL: new PopupMenu.PopupSeparatorMenuItem(), Hu, Sl, Ll,
            OKLCH: new PopupMenu.PopupSeparatorMenuItem(), Lo, Co, Ho, // NOTE: irregular space differs from RGB/HSL, see also https://oklch.com/
            custom: this.#genCustomSection(),
        }, this); // TODO: ? replace HSL and OKLCH with OKHSL, see https://github.com/w3c/csswg-drafts/issues/8659 and https://bottosson.github.io/posts/colorpicker/
        this.actor.connect('key-press-event', (_a, e) => { Menu.altNum(e.get_key_symbol(), e, this.$menu.HEX); });
    }

    #updateSliders(form, value) {
        if(form) this.$color.update(form, value);
        this.$color.toItems((k, v) => k === form || this.$menu[k].setup(v));
        Preset.slice(1).forEach(x => this.$menu[x].label.set_text(this.$color.toText(Format[x])));
        this.$menu.custom.updateLabels();
        this.emit('color-changed');
    }

    #genCustomSection() {
        let custom = new PopupMenu.PopupMenuSection();
        let items = this.$formats.map(x => new Menu.Item('', () => this.#emitSelected(x)));
        if(items.length) custom.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(_('Others')));
        custom.updateLabels = () => items.forEach((x, i) => x.label.set_text(this.$color.toText(this.$formats[i])));
        Menu.itemize(items, custom);
        return custom;
    }

    #genTitleItem() {
        let item = new Menu.Item('', () => this.emit('color-selected', this.$color), {can_focus: false});
        Preset.forEach((x, i) => item.insert_child_at_index(Util.hook({
            clicked: () => { this.close(); this.#emitSelected(Format[x]); },
        }, new St.Button({canFocus: true, label: x, styleClass: 'color-picker-button button'})), i));
        return item;
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
        GObject.registerClass(this);
    }

    constructor(param) {
        super({styleClass: 'color-picker-lens', ...param});
        this.$meta = {x: 0, y: 0, color: new Color(), pixels: [], area: [0, 0, 0, 0, 0]};
        this.$zoom = 8 * Fubar.getTheme().scaleFactor; // grid length
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
                let [red, g, b] = pixels.slice((j * w + i) * 4, -1);
                cr.setSourceRGBA(red / 255, g / 255, b / 255, 1);
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
        GObject.registerClass(this);
    }

    constructor(plain) {
        super(St.Side.TOP);
        Main.layoutManager.addTopChrome(this);
        this.set({visible: false, styleClass: 'color-picker-boxpointer'});
        this.bin.set_child(new St.Label({styleClass: 'color-picker-label'}));
        this.$src = Fubar.Source.tie({lens: this.#genLens(plain)}, this);
    }

    #genLens(plain) {
        let lens;
        if(plain) {
            lens = new Clutter.Actor({opacity: 0, width: 12, height: 12});
            lens.setup = ({x, y}) => lens.set_position(x, y);
            this.$pos = 0;
        } else {
            lens = new ColorLens({width: 1, height: 1});
            this.$pos = 1 / 2;
        }
        Main.layoutManager.addTopChrome(lens);
        return lens;
    }

    get extents() {
        return [...this.get_transformed_position(), ...this.get_transformed_size()];
    }

    summon(view) {
        this.setup(view.color);
        this.setPosition(this.$src.lens, this.$pos);
        this.$src.lens.setup(view);
        this.open(BoxPointer.PopupAnimation.NONE);
    }

    setup(color) {
        Fubar.markup(this.bin.child, color.toPreview());
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

    constructor(set, once, ...args) {
        super({reactive: true, styleClass: 'screenshot-ui-screen-screenshot'});
        this.#buildWidgets(...args);
        this.#bindSettings(set, once);
        this.#buildSources();
        this.#initContents();
    }

    #bindSettings(set, once) {
        this.$set = set.attach({
            menuKey: [Field.MKEY, 'string'],
            quitKey: [Field.QKEY, 'string'],
            persist: [Field.PRST, 'boolean', x => { this.$once = once || !x; }],
            menuSet: [Field.MENU, 'boolean', null, x => this.$src.format.toggle(x)],
        }, this).attach({
            viewing: [Field.PVW,  'boolean', null, x => this.$src.viewer.toggle(x)],
            preview: [Field.PVWS, 'uint', x => x === Preview.LABEL, x => this.$src.viewer.reload(x)],
        }, this, null, () => this.#onViewerSet());
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
            cursor = new Fubar.Source((x = this.cursor) => x && setCursor(x), () => setCursor(Meta.Cursor.DEFAULT), true),
            format = Fubar.Source.new(() => Util.hook({
                'open-state-changed': (_w, open) => this.$src.cursor.toggle(!open),
                'color-selected': () => this.#emitColor(),
                'color-changed': () => this.viewer?.setup(this.$color),
            }, new ColorMenu(this.$color)), this.menuSet),
            viewer = Fubar.Source.new(() => new ColorViewer(this.preview), this.viewing);
        this.$src = Fubar.Source.tie({cursor, format, viewer}, this);
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
        return !this.viewing || this.preview ? Meta.Cursor.CROSSHAIR : Meta.Cursor.BLANK;
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
        if(this.preview) return [x, y, 1, 1, 0, 0, 0];
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
        case Clutter[`KEY_${this.quitKey}`]: this.emit('end-pick', true); break;
        case Clutter[`KEY_${this.menuKey}`]: this.emit('popup-menu'); break;
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
        case Clutter.KEY_Shift_R: this.$set.set('preview', this.preview ? Preview.LENS : Preview.LABEL, this); break;
        default: return super.vfunc_key_press_event(event);
        }
        return Clutter.EVENT_PROPAGATE;
    }

    vfunc_scroll_event(event) {
        switch(event.get_scroll_direction()) {
        case Clutter.ScrollDirection.UP: if(this.preview) this.$set.set('preview', Preview.LENS, this); break;
        case Clutter.ScrollDirection.DOWN: if(!this.preview) this.$set.set('preview', Preview.LABEL, this); break;
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

class ColorItem extends Menu.DatumItemBase {
    static {
        GObject.registerClass(this);
    }

    constructor(star, remove, color) {
        super('color-picker-item-label', 'color-picker-icon', () => Fubar.copy(this.$color.toText()), color);
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
        Fubar.markup(this.label, this.$color.toMarkup());
        this.$btn.setup(star ? 'starred-symbolic' : 'non-starred-symbolic');
    }
}

class ColorButton extends Menu.Systray {
    static {
        GObject.registerClass(this);
    }

    constructor(set, ...args) {
        super({});
        this.#bindSettings(set);
        this.#buildWidgets(...args);
    }

    #bindSettings(set) {
        this.$set = set.attach({
            iconName: [Field.TICN, 'string', x => this.$icon.set_icon_name(x || 'color-select-symbolic')],
            menuSize: [Field.MNSZ, 'uint', x => { this.$tint = x > 0; }, () => this.#onMenuSizeSet(this.$tint)],
        }, this).attach({
            menuType: [Field.MNTP, 'boolean'],
            collect:  [Field.CLCT, 'value', x => x.deepUnpack()],
            history:  [Field.HIST, 'value', x => x.deepUnpack()],
        }, this, null, () => this.#onColorsSet());
    }

    #onMenuSizeSet(tint) {
        if(Util.xnor(tint, this.$menu.tint)) return;
        if(!tint) ['history', 'collect'].forEach(x => this[x].length && this.#save(x, []));
        Menu.record(tint, this, null, 'sep1', 'tool', () => this.#genTintSection(), 'tint', 'sep1');
        this.$menu.tool.setup(this.#genTool());
    }

    #genTintSection() {
        let star = (...xs) => this.#star(...xs);
        let remove = (...xs) => this.#remove(...xs);
        return new Menu.DatasetSection(() => new ColorItem(star, remove), this.#getColors());
    }

    #buildWidgets(formats, callback, fmts) {
        this.$formats = formats;
        this.$callback = callback;
        this.add_style_class_name('color-picker-systray');
        Menu.itemize(this.$menu = {
            fmts, sep0: fmts ? new PopupMenu.PopupSeparatorMenuItem() : null,
            tint: this.$tint ? this.#genTintSection() : null,
            sep1: this.$tint ? new PopupMenu.PopupSeparatorMenuItem() : null,
            tool: new Menu.ToolItem(this.#genTool()),
        }, this.menu);
        this.menu.actor.add_style_class_name('color-picker-menu');
        this.menu.actor.connect('key-press-event', (...xs) => this.#onKeyPress(...xs));
    }

    #onKeyPress(_a, event) {
        let key = event.get_key_symbol();
        if(Menu.altNum(key, event, this.$menu.tool));
        else if(key === Clutter.KEY_Shift_L) this.$set.negate('menuType', this);
    }

    #genTool() {
        let param = {styleClass: 'color-picker-icon', xExpand: true};
        return {
            draw: new Menu.Button(param, () => { this.menu.close(); this.$callback(); }, 'find-location-symbolic'),
            star: this.$tint ? new Menu.StateButton(param, () => this.$set.negate('menuType', this),
                [this.menuType, 'semi-starred-symbolic', 'starred-symbolic']) : null,
            gear: new Menu.Button(param, () => { this.menu.close(); Fubar.me().openPreferences(); }, 'emblem-system-symbolic'),
        };
    }

    #onColorsSet() {
        this.$menu.tint?.setup(this.#getColors());
    }

    #getColors() {
        return this.menuType ? this.collect.map(x => [true, x, this.$formats])
            : this.history.map(x => [this.collect.includes(x), x, this.$formats]);
    }

    #save(key, colors) {
        this.$set.set(key, new GLib.Variant('au', colors), this);
    }

    #star(color) {
        this.#save('collect', this.collect.includes(color) ? this.collect.filter(x => x !== color)
            : [color].concat(this.collect).slice(0, this.menuSize));
    }

    #remove(color) {
        let key = this.menuType ? 'collect' : 'history';
        this.#save(key, this[key].filter(x => x !== color));
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
        if(this.$tint) this.#save('history', [color, ...this.history].slice(0, this.menuSize));
    }

    setFormats(formats) {
        this.$formats = formats;
        this.#onColorsSet();
    }
}

class ColorPicker extends Fubar.Mortal {
    constructor(gset) {
        super();
        this.#bindSettings(gset);
        this.#buildSources();
    }

    #buildSources() {
        let tray = Fubar.Source.new(() => this.#genSystray(), this.systray),
            area = new Fubar.Source((hooks, ...args) => Util.hook(hooks, new ColorArea(...args))),
            keys = Fubar.Source.newKeys(this.$set.hub, Field.KEYS, () => this.summon(), this.shortcut),
            dbus = Fubar.Source.newDBus(CP_IFACE, '/org/gnome/Shell/Extensions/ColorPicker', this, true);
        this.$src = Fubar.Source.tie({tray, area, keys, dbus}, this);
    }

    #bindSettings(gset) {
        this.$set = new Fubar.Setting(gset, {
            hexFormat: [Field.HEX, 'string'],
            rgbFormat: [Field.RGB, 'string'],
            hslFormat: [Field.HSL, 'string'],
            oklchFormat: [Field.OKLCH, 'string'],
            customFormat: [Field.CFMT, 'value', x => this.#onCustomSet(x), () => this.tray?.$menu.fmts?.setup(this.$options)],
        }, this, () => this.#onFormatsSet(), () => this.tray?.setFormats(this.$formats)).attach({
            enableSound:  [Field.SND,  'boolean'],
            notifyStyle:  [Field.NTFS, 'uint'],
            enableNotify: [Field.NTF,  'boolean'],
            autoCopy:     [Field.COPY, 'boolean', x => x ? [] : null],
            shortcut:     [Field.KEY,  'boolean', null, x => this.$src.keys.toggle(x)],
            systray:      [Field.STRY, 'boolean', null, x => this.$src.tray.toggle(x)],
            enableFormat: [Field.FMT,  'boolean', null, x => this.#onEnableFormatSet(x)],
            chosenFormat: [Field.FMTS, 'uint',    null, x => this.tray?.$menu.fmts?.choose(x)],
            notifySound:  [Field.SNDS, 'uint',    x => x === Sound.COMPLETE ? 'complete' : 'screen-capture'],
        }, this);
    }

    get tray() {
        return this.$src.tray.hub;
    }

    #onCustomSet(custom) {
        return Util.seq(x => { this.$options = Preset.concat(x.map(y => y.name)); }, custom.recursiveUnpack().filter(x => x.enable));
    }

    #onFormatsSet() {
        this.$formats = [this.hexFormat, this.rgbFormat, this.hslFormat, this.oklchFormat].concat(this.customFormat.map(x => x.format));
    }

    #onEnableFormatSet(enable) {
        Menu.record(enable, this.tray, null, 'sep0', this.tray?.$tint ? 'tint' : 'tool', () => this.#genFormatItem(), 'fmts', 'sep0');
    }

    #genFormatItem() {
        return new Menu.RadioItem(_('Default format'), this.$options, this.chosenFormat, x => this.$set.set('chosenFormat', x, this));
    }

    #genSystray() {
        return new ColorButton(this.$set, this.$formats, () => this.summon(), this.enableFormat ? this.#genFormatItem() : null);
    }

    summon() {
        if(this.$src.area.active) return;
        this.tray?.add_style_pseudo_class('state-busy'); // FIXME: work later than screenshot on first run
        this.$src.area.summon({'end-pick': () => this.dispel(), 'notify-color': (...xs) => this.inform(...xs)},
            this.$set, false, this.enableFormat ? this.chosenFormat : Format.HEX, this.$formats);
    }

    dispel() {
        if(!this.$src.area.active) return;
        this.tray?.remove_style_pseudo_class('state-busy');
        if(this.autoCopy?.length) Fubar.copy(this.autoCopy.splice(0).join('\n'));
        this.$src.area.dispel();
    }

    inform(_a, color) {
        let text = color.toText();
        this.autoCopy?.push(text);
        this.tray?.addHistory(color.toRaw());
        if(this.enableSound) global.display.get_sound_player().play_from_theme(this.notifySound, _('Color picked'), null);
        if(!this.enableNotify) return;
        let gicon = Gio.BytesIcon.new(genColorSwatch(color.toHEX()));
        if(this.notifyStyle === Notify.MSG) {
            let title = Fubar.me().metadata.name,
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
            invocation.return_value(Util.pickle([{color: await this.pickAsync()}], true, 'd'));
        } catch(e) {
            invocation.return_error_literal(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED, 'Operation was cancelled');
        }
    }
}

export default class Extension extends Fubar.Extension {
    $klass = ColorPicker;
    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        if(!this[Fubar.hub]) throw Error('disabled');
        return this[Fubar.hub].pickAsync();
    }
}
