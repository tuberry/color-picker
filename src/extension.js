// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import St from 'gi://St';
import Gio from 'gi://Gio';
import Cogl from 'gi://Cogl';
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
const {$, $$, $_, hub} = T;

const Format = T.omap(Preset, ([k, v]) => [[v, k]]);

class ColorSlider extends Slider.Slider {
    static {
        T.enrol(this);
    }

    constructor(form, value, step, color, callback) {
        super(value)[$].$meta({form, step, color}).connect('notify::value', () => callback(form, this.value));
    }

    vfunc_repaint() {
        let cr = this.get_context(),
            {color, form} = this.$meta,
            [width, height] = this.get_surface_size(),
            barLevelRadius = Math.min(width, this._barLevelHeight) / 2,
            rtl = this.get_text_direction() === Clutter.TextDirection.RTL,
            gradient = new Cairo.LinearGradient(0, 0, width, 0)[$$].addColorStopRGBA(color.toStops(form, rtl));
        cr.arc(barLevelRadius, height / 2, barLevelRadius, Math.PI * (1 / 2), Math.PI * (3 / 2));
        cr.arc(width - barLevelRadius, height / 2, barLevelRadius, Math.PI * 3 / 2, Math.PI / 2);
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

    _applyDelta(delta) {
        return super._applyDelta(Math.sign(delta) * this.$meta.step);
    }

    _getMinimumIncrement() {
        return 1;
    }
}

class ColorMenu extends PopupMenu.PopupMenu {
    constructor(color) {
        let cursor = Main.layoutManager.dummyCursor;
        super(cursor, 0.1, St.Side.LEFT)[$].$color(color)[$]
            .$formats(T.array(color.formats.length).slice(Preset.length))[$]
            .$manager(new PopupMenu.PopupMenuManager(cursor)[$].addMenu(this))
            .$addItems();
    }

    $addItems() {
        let {r, g, b, Hu, Sl, Ll, Lo, Co, Ho} = this.$color.toItems((form, value, unit, step) => {
            step ??= 1 / Math.max(unit ?? 1, 100);
            let slider = new ColorSlider(form, value, step, this.$color, (...xs) => this.$updateSliders(...xs));
            return new PopupMenu.PopupBaseMenuItem({activate: false})[$]
                .set({setup: v => { slider._value = v; slider.queue_repaint(); }})[$$]
                .add_child([new St.Label({text: form.slice(0, 1).toUpperCase(), xExpand: false}), slider])[$]
                .add_action(new Clutter.KeyController()[$].connect('key-press', x => {
                    let [, key] = x.get_key();
                    if(key === Clutter.KEY_Left) slider._moveLeft();
                    else if(key === Clutter.KEY_Right) slider._moveRight();
                }));
        });
        M.Item.put(this, this.$menu = {
            HEX: this.$genTitleItem(),
            RGB: new M.Separator(), r, g, b,
            HSL: new M.Separator(), Hu, Sl, Ll,
            OKLCH: new M.Separator(), Lo, Co, Ho, // NOTE: irregular space differs from RGB/HSL, see also https://oklch.com/
            custom: this.$genCustomSection(),
        }); // TODO: ? replace HSL and OKLCH with OKHSL, see https://github.com/w3c/csswg-drafts/issues/8659 & https://bottosson.github.io/posts/colorpicker/
        Main.layoutManager.addTopChrome(this.actor[$].hide()[$].add_style_class_name('color-picker-menu')[$]
            .add_action(new Clutter.KeyController()[$].connect('key-press', x => M.altNum(x, this.$menu.HEX))));
    }

    $updateSliders(form, value) {
        this.$color[$$].update(form && [[form, value]]).toItems((k, v) => k === form || this.$menu[k].setup(v));
        Preset.slice(1).forEach(x => this.$menu[x].label.set_text(this.$color.toText(Format[x])));
        this.$updateCustomLabels();
        this.emit('color-changed');
    }

    $genCustomSection() {
        let items = this.$formats.map(x => new M.Item('', () => this.$select(x)));
        this.$updateCustomLabels = () => items.forEach((x, i) => x.label.set_text(this.$color.toText(this.$formats[i])));
        return new PopupMenu.PopupMenuSection()[$$].addMenuItem(items.length ? [new M.Separator(_('Others')), ...items] : items);
    }

    $genTitleItem() {
        return new M.Item('', () => this.$select(), {can_focus: false})[$$]
            .add_child(Preset.map(x => new St.Button({canFocus: true, label: x, styleClass: 'color-picker-button button'})[$]
                .connect('clicked', () => this.$select(Format[x]))));
    }

    $select(format = -1) {
        if(format >= 0) this.$color.format = format;
        this[$][hub](true).close({animate: false});
    }

    summon(geometry) {
        this.$updateSliders();
        Main.layoutManager.setDummyCursorGeometry(...geometry);
        this.open();
    }
}

class LoupeEffect extends Clutter.Effect {
    static {
        T.enrol(this);
    }

    constructor() {
        super({name: 'loupe'}).$buildWidgets();
    }

    $buildWidgets() {
        this.$scale = F.theme().scaleFactor;
        this.$pipeline = Cogl.Pipeline.new(global.stage.context.get_backend().get_cogl_context())[$]
            .set_layer_filters(0, Cogl.PipelineFilter.NEAREST, Cogl.PipelineFilter.NEAREST)[$]
            .set_layer_null_texture(1)[$] // HACK: workaround to get standard cogl_tex_coord_in with empty layer1
            .add_snippet(Cogl.Snippet.new(Cogl.SnippetHook.FRAGMENT, /* glsl */ `
                uniform vec4 u_args[3];
                uniform mat4 cogl_texture_matrix[2];
                #define edge(d, a) smoothstep(a, -(a), d)
            `, /* glsl */ `
                mat4 M = cogl_texture_matrix[0];
                vec4 P[3] = u_args;
                vec2 S = P[0].xy; // u_size
                vec2 T = P[0].zw; // u_center
                vec3 C = P[1].rgb; // u_color
                float W = P[1].a; // u_grid_width
                float R = P[2].x; // u_radius
                float L = P[2].y; // u_half_line_width
                float A = P[2].z; // u_anti_aliasing_scale

                vec2 uv = cogl_tex_coord_in[1].st * S;
                float r = distance(uv, T);

                if(r > R + 4.5 * L) discard;

                vec4 ret = texture2D(cogl_sampler0, (cogl_tex_coord_in[0].st - M[3].xy) / vec2(M[0].x, M[1].y)); // faster inverse(M) * coord0

                vec2 xy = abs(uv - T);
                float cell = max(xy.x, xy.y) - W * .5;
                xy = fwidth(uv);
                float aa = max(xy.x, xy.y) * A;
                xy = abs(fract(uv / W + .5) - .5) * W;
                float grid = edge(min(xy.x, xy.y) - L, aa);
                ret = mix(ret, vec4(vec3(edge(cell, aa)), 1.), grid * mix(.4, 1., edge(cell - L, aa)));

                aa = 1.; // anti-aliasing
                ret = mix(ret, vec4(1. - C, 1.), edge(R - r, aa));
                ret = mix(ret, vec4(C, 1.), edge(R + 2. * L - r, aa));
                ret = mix(ret, vec4(0.), edge(R + 4. * L - r, aa));

                cogl_color_out = ret;
            `));
        this.$location = this.$pipeline.get_uniform_location('u_args');
    }

    vfunc_paint_node(node) {
        node.add_child(new Clutter.PipelineNode(this.$pipeline)[$].add_texture_rectangle(Clutter.ActorBox.new(0, 0, this.actor.width, this.actor.height), 0, 0, 1, 1));
    }

    setup(color, zoom, radius, pointer, texture, x, y, width, height, scale) {
        if(texture) {
            let n = 10 + radius + 1, // 1px margin
                a = Math.max(x - n, 0),
                b = Math.max(y - n, 0),
                c = Math.min(x, width - x, n) + n + 1, // 1px reticle
                d = Math.min(y, height - y, n) + n + 1, // ditto
                s = Math.round((zoom + 4) * this.$scale) * 2,
                w = s * c,
                h = s * d,
                u = s * (x - a + .5),
                v = s * (y - b + .5),
                r = s * Math.hypot(n - .5, .5);
            this.actor[$].set_size(w, h).set_position(pointer[0] - u, pointer[1] - v);
            this.$pipeline.set_layer_texture(0, Cogl.SubTexture.new(texture.get_context(), texture, a, b, c, d));
            this.$pipeline.set_uniform_float(this.$location, 4, 3, [w, h, u, v, ...color.toRGB(), s, r, Math.round(s / 10), scale > 1 ? .5 : 0]);
            this.set_enabled(true);
        } else {
            this.set_enabled(false);
            [x, y, width, height] = F.cursor(pointer);
            this.actor[$].set_size(width, height).set_position(x, y);
        }
    }
}

class ColorArea extends St.Widget {
    static {
        T.enrol(this, null, {
            Signals: {
                'finish-pick': {param_types: [GObject.TYPE_BOOLEAN]},
                'submit-pick': {param_types: [GObject.TYPE_JSOBJECT]},
            },
        });
        this.Preview = {LOUPE: 0, LABEL: 1};
    }

    constructor(set, once, color) {
        super({reactive: true, styleClass: 'screenshot-ui-screen-screenshot'})[$]
            .$buildWidgets(color)[$].$bindSettings(set, once)[$].$buildSources().$initContents();
    }

    $buildWidgets(color) {
        Main.layoutManager.addTopChrome(this);
        Main.pushModal(this, {actionMode: Shell.ActionMode.POPUP});
        Main.uiGroup.set_child_above_sibling(Main.messageTray, this); // show notifications in persistent mode
        this[$].add_constraint(new Clutter.BindConstraint({source: global.stage, coordinate: Clutter.BindCoordinate.ALL}))[$$]
            .add_action([new Clutter.ClickGesture()[$].connect('recognize', x => this.$onClick(x)),
                new Clutter.KeyController()[$].connect('key-press', x => this.$onKeyPress(x)),
                new Clutter.MotionController()[$$].connect(['enter', 'motion'].map(signal => [signal, (_c, _s, x, y) => this.$pick(x, y)])),
                new Clutter.ScrollController({flags: Clutter.ScrollControllerFlags.DISCRETE | Clutter.ScrollControllerFlags.SCROLL_VERTICAL})[$]
                    .connect('scroll', (_c, _p, _s, _x, dy) => this.$zoomPreview(Math.sign(-dy)))])[$]
            .connect('popup-menu', () => this.$src.editor.hub?.summon(this.$src.viewer.hub?.extent() ?? F.cursor(this.$coords))).set({
                $color: color, $ptr: global.stage.context.get_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE),
            });
    }

    $bindSettings(set, once) {
        this.$set = set.tie(this, [
            K.MKEY, K.QKEY,
            [K.PRST, x => { this.$once = once || !x; }],
            [K.MENU, null, x => this.$src.editor.toggle(x)],
        ], [
            K.PVWZ, K.PVWR,
            [K.PVWS, x => x === ColorArea.Preview.LABEL],
            [K.PVW,  null, x => this.$src.viewer.toggle(x)],
        ], null, () => this.$onViewerSet());
    }

    $buildSources() {
        let viewer = new F.Source(() => this.$genViewer(), this[K.PVW]),
            cursor = new F.Source((x = this.cursor) => x && global.stage.get_grab_actor()?.set_cursor_type(x),
                () => global.stage.get_grab_actor()?.set_cursor_type(Clutter.CursorType.DEFAULT), true),
            editor = new F.Source(() => new ColorMenu(this.$color)[$$].connect([
                ['color-changed', () => this.$src.viewer.hub?.bin.child.setup(this.$color)],
                ['open-state-changed', (_x, open) => this.$src.cursor.toggle(!open)],
                ['menu-closed', x =>  T.steal(x, hub) && this.$submit()], // submit after closing to avoid UAF in non persistent mode
            ]), this[K.MENU]);
        this.$src = F.Source.tie(this, {viewer, cursor, editor});
    }

    async $initContents() {
        let [content, scale] = await new Shell.Screenshot().screenshot_stage_to_content(),
            texture = content.get_texture(),
            width = texture.get_width() - 1,
            height = texture.get_height() - 1;
        this.set({
            content, $scale: scale, $pick: function (u, v) {
                this.$coords = [u, v];
                let x = Math.round(u * scale),
                    y = Math.round(v * scale),
                    stream = Gio.MemoryOutputStream.new_resizable(); // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/work_items/3621
                Shell.Screenshot.composite_to_stream(texture, x, y, 1, 1, scale, null, 0, 0, 1, stream).then(pixbuf => {
                    this.$color.fromPixels(pixbuf.get_pixels());
                    this.$src.viewer.hub?.summon(this[K.PVWS] ? null : texture, x, y, width, height, scale);
                }).catch(() => this.$finish()).finally(() => stream.close(null)); // async-fetch pixels on demand to avoid startup latency (PNG encoder?)
            }[$$].call(this.$coords && [[this, ...this.$coords]]),
        });
    }

    $genViewer() {
        let vfx = new LoupeEffect(),
            txt = new St.Label({styleClass: 'color-picker-view-label'}),
            swt = new Shell.SquareBin({styleClass: 'color-picker-view-swatch'})[$]
                .add_constraint(new Clutter.BindConstraint({source: txt, coordinate: Clutter.BindCoordinate.HEIGHT})),
            box = new St.BoxLayout({styleClass: 'color-picker-view-box'})[$_](it => it[$$].add_child([swt, txt])[$]
                .setup(x => { swt.set_style(`background-color: ${x.toHEX()}`); F.marks(txt, x.toView()); })),
            ret = new BoxPointer.BoxPointer(St.Side.TOP)[$_](it => { Main.layoutManager.addTopChrome(it); it.bin.set_child(box); }),
            csr = new Clutter.Actor({effect: vfx})[$_](it => Main.layoutManager.addTopChrome(F.Source.tie(ret, it)));
        return ret[$].set({
            visible: false, styleClass: 'color-picker-view-boxpointer',
            extent: () => ret.get_transformed_position()[$].push(...ret.get_transformed_size()),
            summon: (...args) => {
                ret[$].setPosition(csr, this[K.PVWS] ? 0.075 : 0.5).open(BoxPointer.PopupAnimation.NONE);
                vfx.setup(this.$color, this[K.PVWZ], this[K.PVWR], this.$coords, ...args);
                box.setup(this.$color);
            },
        });
    }

    $zoomPreview(delta) {
        if(delta && (this[K.PVWS] ? delta < 0 : this.$set.add(K.PVWZ, delta) || delta > 0)) return;
        this.$set.set(K.PVWS, this[K.PVWS] ? ColorArea.Preview.LOUPE : ColorArea.Preview.LABEL);
    }

    $onViewerSet() {
        this.$src.cursor.summon();
        this.$moveBy(0, 0, {get_state: () => new Int8Array(5)}); // HACK: workaround for stale cursor on scrolling since https://gitlab.gnome.org/GNOME/mutter/-/merge_requests/4745
    }

    get cursor() { return !this[K.PVW] || this[K.PVWS] ? Clutter.CursorType.CROSSHAIR : Clutter.CursorType.NONE; }

    $pick(x, y) {
        this.$coords = [x, y];
    }

    $submit() {
        this[$].emit('submit-pick', this.$color)[$$].$finish(this.$once && [false]);
    }

    $finish(aborted = true) {
        this.$finish = T.nop;
        this.emit('finish-pick', aborted);
    }

    $moveBy(dx, dy, actor) {
        let step = (F.held(actor, Clutter.ModifierType.CONTROL_MASK) ? 8 : 1) / this.$scale;
        this.$ptr.notify_relative_motion(global.get_current_time(), dx * step, dy * step);
    }

    $onKeyPress(actor) {
        switch(actor.get_key()[1]) {
        case Clutter.KEY_Escape:
        case Clutter[`KEY_${this[K.QKEY]}`]: this.$finish(); break;
        case Clutter[`KEY_${this[K.MKEY]}`]: this.emit('popup-menu'); break;
        case Clutter.KEY_a:
        case Clutter.KEY_h:
        case Clutter.KEY_Left: this.$moveBy(-1, 0, actor); break;
        case Clutter.KEY_w:
        case Clutter.KEY_k:
        case Clutter.KEY_Up: this.$moveBy(0, -1, actor); break;
        case Clutter.KEY_d:
        case Clutter.KEY_l:
        case Clutter.KEY_Right: this.$moveBy(1, 0, actor); break;
        case Clutter.KEY_s:
        case Clutter.KEY_j:
        case Clutter.KEY_Down: this.$moveBy(0, 1, actor); break;
        case Clutter.KEY_space:
        case Clutter.KEY_Return:
        case Clutter.KEY_KP_Enter:
        case Clutter.KEY_ISO_Enter: this.$submit(); break;
        case Clutter.KEY_Shift_L:
        case Clutter.KEY_Shift_R: this.$zoomPreview(); break;
        case Clutter.KEY_equal:
        case Clutter.KEY_KP_Add: this.$zoomPreview(1); break;
        case Clutter.KEY_minus:
        case Clutter.KEY_KP_Subtract: this.$zoomPreview(-1); break;
        case Clutter.KEY_bracketleft: this.$set.add(K.PVWR, -1); break;
        case Clutter.KEY_bracketright: this.$set.add(K.PVWR, 1); break;
        }
    }

    $onClick(gesture) {
        switch(gesture.get_button()) {
        case Clutter.BUTTON_PRIMARY: this.$submit(); break;
        case Clutter.BUTTON_MIDDLE: this.emit('popup-menu'); break;
        default: this.$finish(); break;
        }
    }
}

class ColorItem extends M.DatumItemBase {
    static {
        T.enrol(this).get_binding_pool()[$$].install_closure([Clutter.KEY_Delete, Clutter.KEY_BackSpace]
            .map(k => ['remove', k, 0, x => { x.$onRemove(); return Clutter.EVENT_STOP; }]));
    }

    constructor(star, remove, color) {
        super('color-picker-item-label', 'color-picker-icon', () => F.copy(this.$meta.text), color)
            .set({$onRemove: () => remove(this.$meta.raw), $onClick: () => star(this.$meta.raw)});
    }

    activate(event) {
        let type = event.type();
        if((type === Clutter.EventType.BUTTON_RELEASE || type === Clutter.EventType.PAD_BUTTON_RELEASE) &&
           event.get_button() === Clutter.BUTTON_MIDDLE) this.$onRemove();
        else super.activate(event);
    }

    setup(color) {
        let [star, raw, fmts] = color;
        color = new Color(raw, fmts);
        F.marks(this.label, color.toMarkup());
        this.$meta = {raw, text: color.toText()};
        this.$btn.setIcon(star ? 'starred-symbolic' : 'non-starred-symbolic');
    }
}

class ColorTray extends M.Systray {
    static {
        T.enrol(this);
    }

    constructor(set, ...args) {
        super({})[$].$bindSettings(set).$buildWidgets(...args);
    }

    $bindSettings(set) {
        this.$set = set.tie(this, [
            [K.TICN, x => this.$icon.set_icon_name(x || 'color-select-symbolic')],
            [K.MNSZ, x => { this.$tint = x > 0; }, () => this.$onMenuSizeSet(this.$tint)],
        ], [
            [K.MNTP, x => !!x, x => this.$menu.tool.star?.toggleState(x)], K.CLCT, K.HIST,
        ], null, () => this.$onColorsSet());
    }

    $onMenuSizeSet(tint) {
        if(T.xnor(tint, this.$menu.tint)) return;
        if(!tint) [K.CLCT, K.HIST].forEach(x => this.$set.set(x, []));
        this.$record(tint, 'sep1', null, 'tint', () => this.$genTintSection());
        this.$menu.tool.setup(this.$genTool());
    }

    $genTintSection() {
        return new M.DatasetSection(() => new ColorItem(
            color => this.$set.set(K.CLCT, this[K.CLCT].includes(color)
                ? this[K.CLCT].filter(x => x !== color) : [color, ...this[K.CLCT]].slice(0, this[K.MNSZ])),
            color => this[K.MNTP] ? this.$set.set(K.CLCT, this[K.CLCT].filter(x => x !== color))
                : this.$set.set(K.HIST, this[K.HIST].filter(x => x !== color))), this.$getColors());
    }

    $buildWidgets(formats, callback, fmts) {
        this[$].set({$formats: formats, $callback: callback})[$].add_style_class_name('color-picker-systray').menu.actor[$]
            .add_style_class_name('color-picker-menu').add_action(new Clutter.KeyController()[$].connect('key-press', x => this.$onKeyPress(x)));
        T.inject(this.menu, 'toggle', (o, f) => (...xs) => this._clickGesture.state === Clutter.GestureState.COMPLETED &&
            this._clickGesture.get_button() === Clutter.BUTTON_PRIMARY ? this.$callback() : f.apply(o, xs));
        M.Item.put(this.menu, this.$menu = {
            fmts, sep0: fmts ? new M.Separator() : null,
            tint: this.$tint ? this.$genTintSection() : null,
            sep1: this.$tint ? new M.Separator() : null,
            tool: new M.ToolItem(this.$genTool()),
        });
    }

    $onKeyPress(actor) {
        let [, key] = actor.get_key();
        if(M.altNum(actor, this.$menu.tool, key));
        else if(key === Clutter.KEY_Shift_R) this.$set.not(K.MNTP);
    }

    $genTool() {
        return [{
            call: [() => { this.menu.close(); this.$callback(); }, 'find-location-symbolic'],
            star: this.$tint ? [() => this.$set.not(K.MNTP), [this[K.MNTP], 'semi-starred-symbolic', 'starred-symbolic']] : null,
            gear: [() => { this.menu.close(); F.me().openPreferences(); }, 'applications-system-symbolic'],
        }, 'color-picker-icon'];
    }

    $onColorsSet() {
        this.$menu.tint?.setup(this.$getColors());
    }

    $getColors() {
        return this[K.MNTP] ? this[K.CLCT].map(x => [true, x, this.$formats])
            : this[K.HIST].map(x => [this[K.CLCT].includes(x), x, this.$formats]);
    }

    addHistory(color) {
        if(this.$tint) this.$set.set(K.HIST, [color, ...this[K.HIST]].slice(0, this[K.MNSZ]));
    }

    setFormats(formats) {
        this[$].$formats(formats).$onColorsSet();
    }
}

class ColorPicker extends F.Mortal {
    static Notify = {MSG: 0, OSD: 1};
    static Sound = {SCREENSHOT: 0, COMPLETE: 1};

    $bindSettings(gset) {
        this.$set = new F.Setting(gset).tie(this, [
            K.HEX, K.RGB, K.HSL, K.OKLCH, K.NAME,
            [K.CFMT, x => this.$onCustomSet(x), () => this.$src.tray.hub?.$menu.fmts?.setup(this.$options)],
        ], () => this.$onFormatsSet(), () => this.$src.tray.hub?.setFormats(this.$formats), [
            K.SND, K.NTFS, K.NTF,
            [K.COPY, x => x ? [] : null],
            [K.DBUS, null, x => this.$src.dbus.toggle(x)],
            [K.KEY,  null, x => this.$src.keys.toggle(x)],
            [K.STRY, null, x => this.$src.tray.toggle(x)],
            [K.FMT,  null, x => this.$onEnableFormatSet(x)],
            [K.FMTS, null, x => this.$src.tray.hub?.$menu.fmts?.choose(x)],
            [K.SNDS, x => `${global.datadir}/sounds/${x === ColorPicker.Sound.COMPLETE ? 'complete' : 'screen-capture'}.oga`],
        ]);
    }

    $buildSources() {
        let tray = new F.Source(() => this.$genSystray(), this[K.STRY]),
            keys = new F.Source.Keys(this.$set.hub, K.KEYS, () => this.summon(), this[K.KEY]),
            area = new F.Source((hooks, ...args) => new ColorArea(...args)[$$].connect(hooks)),
            dbus = new F.Source.DBus(this, 'org.gnome.Shell.Extensions.ColorPicker', '/org/gnome/Shell/Extensions/ColorPicker', this[K.DBUS]);
        this.$src = F.Source.tie(this, {tray, area, keys, dbus});
    }

    $onCustomSet(custom) {
        return custom.filter(x => x.enable)[$_](it => { this.$options = Preset.concat(it.map(x => x.name)); });
    }

    $onFormatsSet() {
        this.$formats = [K.HEX, K.RGB, K.HSL, K.OKLCH].map(x => this[x])[$].push(...this[K.CFMT].map(x => x.format))[$][hub](this[K.NAME] ? _ : null);
    }

    $onEnableFormatSet(enable) {
        this.$src.tray.hub?.$record(enable, 'sep0', null, 'fmts', () => this.$genFormatItem());
    }

    $genFormatItem() {
        return new M.RadioItem(_('Default format'), this.$options, this[K.FMTS], x => this.$set.set(K.FMTS, x));
    }

    $genSystray() {
        return new ColorTray(this.$set, this.$formats, () => this.summon(), this[K.FMT] ? this.$genFormatItem() : null);
    }

    summon() {
        if(this.$src.area.active) return;
        this.$src.tray.hub?.add_style_pseudo_class('state-busy'); // FIXME: not working on the first run
        this.$src.area.summon([['finish-pick', () => this.dispel()], ['submit-pick', (_a, x) => this.inform(x)]],
            this.$set, false, new Color((this[K.FMT] ? this[K.FMTS] : Format.HEX) << 24, this.$formats));
    }

    dispel() {
        if(!this.$src.area.active) return;
        this.$src.tray.hub?.remove_style_pseudo_class('state-busy');
        if(this[K.COPY]?.length) F.copy(this[K.COPY].splice(0).join('\n'));
        this.$src.area.dispel();
    }

    inform(color) {
        let text = color.toText();
        this[K.COPY]?.push(text);
        this.$src.tray.hub?.addHistory(color.toRaw());
        if(this[K.SND]) global.display.get_sound_player().play_from_file(T.fopen(this[K.SNDS]), _('Color picked'), null);
        if(!this[K.NTF]) return;
        let gicon = Gio.BytesIcon.new(T.encode(`<svg width="64" height="64" fill="${color.toHEX()}" viewBox="0 0 1 1">
    <rect width=".75" height=".75" x=".125" y=".125" rx=".15"/></svg>`));
        if(this[K.NTFS] === ColorPicker.Notify.MSG) {
            let title = F.me().metadata.name,
                source = MessageTray.getSystemSource(),
                body = _('%s is picked.').format(color.toView(text, '\u{3014}', '\u{3015}'));
            source.addNotification(new MessageTray.Notification({gicon, source, title, body, isTransient: true}));
        } else {
            Main.osdWindowManager.showAll(gicon, color.toView(text));
        }
    }

    pickAsync() {
        return new Promise((resolve, reject) => {
            if(this.$src.area.active) throw Error('busy');
            this.$src.tray.hub?.add_style_pseudo_class('state-busy');
            this.$src.area.summon([['submit-pick', (_a, color) => resolve(color.toRGB())],
                ['finish-pick', (_a, aborted) => { this.dispel(); if(aborted) reject(Error('aborted')); }]], this.$set, true, new Color());
        });
    }

    PickAsync(_p, invocation) {
        F.Source.DBus.respond(invocation, () => this.pickAsync().then(v => T.pickle([{color: T.pickle(v, '(ddd)')}], '(a{sv})'))
            .catch(() => { throw new Gio.IOErrorEnum({code: Gio.IOErrorEnum.CANCELLED, message: 'Operation cancelled'}); }));
    }

    RunAsync(_p, invocation) {
        F.Source.DBus.respond(invocation, () => this.summon());
    }
}

export default class extends F.Extension {
    $klass = ColorPicker;
    // API: Main.extensionManager.lookup('color-picker@tuberry').stateObj.pickAsync().then(log).catch(log)
    pickAsync() {
        if(!this[hub]) throw Error('disabled');
        return this[hub].pickAsync();
    }
}
