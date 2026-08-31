// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import {HEX} from './const.js';
import * as T from './util.js';

const {$, hub} = T;
const Grey = 0.5693; // L in OKLab <=> 18% grey #777 // Ref: https://en.wikipedia.org/wiki/Middle_gray

const _ = T.id; // HACK: workaround for gettext
const numeric = (x, n = -1, r) => n < 0 || !Number.isFinite(x)  ? String(x) : Number(x.toFixed(n)).toString(r);
const hex = x => numeric(x, 0, 16).padStart(2, '0');
const denorm = (v, u) => u ? v * u : v;
const norm = (v, u) => u ? v / u : v;

const RGB = {
    get: ({Re, Gr, Bl}) => ({r: Re / 255, g: Gr / 255, b: Bl / 255}), set: T.id,
    tuple: ({r, g, b}) => [r, g, b],
    // cache
    get [hub]() { return [this.Re, this.Gr, this.Bl]; },
    set [hub](v) { [this.Re, this.Gr, this.Bl] = v; },
    equal(v) { return this.Re === v[0] && this.Gr === v[1] && this.Bl === v[2]; },
    assign(m, k, v) { m.clear(); this[k] = v; return true; },
    sync(m, {r, g, b}) { return this.assign(m, hub, [r * 255, g * 255, b * 255]); },
};

const HSV = { // Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
    get: ({r, g, b}) => {
        let [m, , v] = [r, g, b].sort(),
            d = v - m,
            s = v === 0 ? 0 : d / v,
            k = 0;
        if(d !== 0) { // chromatic
            switch(v) {
            case r: k = (g - b) / d + (g < b ? 6 : 0); break;
            case g: k = (b - r) / d + 2; break;
            case b: k = (r - g) / d + 4; break;
            }
        }
        return {Hu: k * 60, Sv: s, Va: v};
    },
    set: ({Hu: h, Sv: s, Va: v}) => {
        h = h / 60 % 6;
        let i = Math.trunc(h),
            u = v * (1 - s),
            w = v * (h - i) * s,
            c = [u, u, u + w, v, v, v - w];
        return {r: c.at(i - 2), g: c.at(i - 4), b: c.at(i)};
    },
};

const HSL = {
    get: ({Hu, Sv: s, Va: v}) => {
        let l = v * (1 - s / 2);
        return {Hu, Sl: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), Ll: l};
    },
    set: ({Hu, Sl: s, Ll: l}) => {
        let v = l + s * Math.min(l, 1 - l);
        return HSV.set({Hu, Sv: v === 0 ? 0 : 2 * (1 - l / v), Va: v});
    },
};

const OKLAB = { // Ref: https://github.com/Evercoder/culori/tree/main/src/oklab & https://bottosson.github.io/posts/oklab/
    get: ({r, g, b}) => {
        [r, g, b] = [r, g, b].map(x => x > 0.04045 ? ((x + 0.055) / 1.055) ** 2.4 : x / 12.92); // linear srgb
        let l = Math.cbrt(0.4122214694707630 * r + 0.5363325372617348 * g + 0.0514459932675022 * b),
            m = Math.cbrt(0.2119034958178252 * r + 0.6806995506452344 * g + 0.1073969535369406 * b),
            s = Math.cbrt(0.0883024591900564 * r + 0.2817188391361215 * g + 0.6299787016738222 * b);
        return {
            Lo: 0.2104542683093140 * l + 0.7936177747023054 * m - 0.0040720430116193 * s,
            Ao: 1.9779985324311684 * l - 2.4285922420485799 * m + 0.4505937096174110 * s,
            Bo: 0.0259040424655478 * l + 0.7827717124575296 * m - 0.8086757549230774 * s,
        };
    },
    set: ({Lo, Ao, Bo}) => {
        let l = (Lo + 0.3963377773761749 * Ao + 0.2158037573099136 * Bo) ** 3,
            m = (Lo - 0.1055613458156586 * Ao - 0.0638541728258133 * Bo) ** 3,
            s = (Lo - 0.0894841775298119 * Ao - 1.2914855480194092 * Bo) ** 3,
            [r, g, b] = [
                +4.0767416360759574 * l - 3.3077115392580616 * m + 0.2309699031821044 * s,
                -1.2684379732850317 * l + 2.6097573492876887 * m - 0.3413193760026573 * s,
                -0.0041960761386756 * l - 0.7034186179359362 * m + 1.7076146940746117 * s,
            ].map(x => Math.clamp(x > 0.0031308 ? x ** (1 / 2.4) * 1.055 - 0.055 : x * 12.92, 0, 1)); // |OKLab| > |RGB|
        return {r, g, b};
    },
};

const OKLCH = {
    get: ({Lo, Ao, Bo}) => { let t = Math.hypot(Ao, Bo); return {Lo, Co: t, Ho: t > 4e-6 ? (Math.atan2(Bo, Ao) / Math.PI + 2) % 2 * 180 : 0}; }, // NOTE: https://github.com/tc39/proposal-integer-and-modulus-math
    set: ({Lo, Co, Ho}) => { let t = Math.PI * Ho / 180; return OKLAB.set({Lo, Ao: Co * Math.cos(t), Bo: Co * Math.sin(t)}); },
};

const CMYK = { // Ref: http://www.easyrgb.com/en/math.php
    get: ({r, g, b}) => {
        let mx = Math.max(r, g, b);
        return mx === 0 ? {Cy: 0, Ma: 0, Ye: 0, Bk: 1} : {Cy: 1 - r / mx, Ma: 1 - g / mx, Ye: 1 - b / mx, Bk: 1 - mx};
    },
    set: ({Cy, Ma, Ye, Bk}) => {
        let mx = 1 - Bk;
        return {r: (1 - Cy) * mx, g: (1 - Ma) * mx, b: (1 - Ye) * mx};
    },
};

// Copy from https://github.com/microsoft/PowerToys/blob/ddc536c69668837470439ecce68b7ce1b2094175/src/common/ManagedCommon/ColorNameHelper.cs
const Name = {
    hues: [
        [8, 0, 0, 44, 0, 0, 0, 63, 0, 0, 122, 0, 134, 0, 0, 0, 0, 166, 176, 241, 0, 256, 0],
        [0, 10, 0, 32, 46, 0, 0, 0, 61, 0, 106, 0, 136, 144, 0, 0, 0, 158, 166, 241, 0, 0, 256],
        [0, 8, 0, 0, 39, 46, 0, 0, 0, 71, 120, 0, 131, 144, 0, 0, 163, 0, 177, 211, 249, 0, 256],
        [0, 11, 26, 0, 0, 38, 45, 0, 0, 56, 100, 121, 129, 0, 140, 0, 180, 0, 0, 224, 241, 0, 256],
        [0, 13, 27, 0, 0, 36, 45, 0, 0, 59, 118, 0, 127, 136, 142, 0, 185, 0, 0, 216, 239, 0, 256],
    ].map(x => x.map(y => y * 360 / 255)),
    lumens: [
        [130, 100, 115, 100, 100, 100, 110, 75, 100, 90, 100, 100, 100, 100, 80, 100, 100, 100, 100, 100, 100, 100, 100],
        [170, 170, 170, 155, 170, 170, 170, 170, 170, 115, 170, 170, 170, 170, 170, 170, 170, 170, 150, 150, 170, 140, 165],
    ].map(x => x.map(y => y / 255)),
    // TODO: The internal color names in WinUI aren't ideal. We need a modern version of CNS - https://en.wikipedia.org/wiki/Color_Naming_System
    // or ISCC-NBS centroids - https://www.munsellcolorscienceforpainters.com/ColourSciencePapers/sRGBCentroidsForTheISCCNBSColourSystem.pdf
    chromas: [[
        _('Coral'), _('Rose'), _('Light orange'), _('Tan'), _('Tan'), _('Light yellow'), _('Light yellow'), _('Tan'),
        _('Light green'), _('Lime'), _('Light green'), _('Light green'), _('Aqua'), _('Sky blue'), _('Light turquoise'),
        _('Pale blue'), _('Light blue'), _('Ice blue'), _('Periwinkle'), _('Lavender'), _('Pink'), _('Tan'), _('Rose'),
    ], [
        _('Coral'), _('Red'), _('Orange'), _('Brown'), _('Tan'), _('Gold'), _('Yellow'), _('Olive green'), _('Olive green'),
        _('Green'), _('Green'), _('Bright green'), _('Teal'), _('Aqua'), _('Turquoise'), _('Pale blue'), _('Blue'),
        _('Blue gray'), _('Indigo'), _('Purple'), _('Pink'), _('Brown'), _('Red'),
    ], [
        _('Brown'), _('Dark red'), _('Brown'), _('Brown'), _('Brown'), _('Dark yellow'), _('Dark yellow'), _('Brown'),
        _('Dark green'), _('Dark green'), _('Dark green'), _('Dark green'), _('Dark teal'), _('Dark teal'), _('Dark teal'),
        _('Dark blue'), _('Dark blue'), _('Blue gray'), _('Indigo'), _('Dark purple'), _('Plum'), _('Brown'), _('Dark red'),
    ]],
    get: ({Hu, Sl, Ll}) => {
        if(Ll > 240 / 255) return {Na: _('White')};
        else if(Ll < 20 / 255) return {Na: _('Black')};
        else if(Sl <= 20 / 255) return {Na: Ll > 170 / 255 ? _('Light gray') : Ll > 100 / 255 ? _('Gray') : _('Dark gray')};
        let level = Sl <= 75 / 255 ? 0 : Sl <= 115 / 255 ? 1 : Sl <= 150 / 255 ? 2 : Sl <= 240 / 255 ? 3 : 4,
            index = Name.hues[level].findIndex(x => Hu < x),
            shade = Ll > Name.lumens[1][index] ? 0 : Ll < Name.lumens[0][index] ? 2 : 1;
        return {Na: Name.chromas[shade][index]};
    },
};

export default class Color {
    static Form = {
        Re: {unit: 255, info: '_RGB', desc: _('red')},
        Gr: {unit: 255, info: 'R_GB', desc: _('green')},
        Bl: {unit: 255, info: 'RG_B', desc: _('blue')},
        Al: {unit: 255, info: '=255', desc: _('alpha')},
        r:  {meta: RGB, stop: 1, span: 1 / 255},
        g:  {meta: RGB, stop: 1, span: 1 / 255},
        b:  {meta: RGB, stop: 1, span: 1 / 255},
        Hu: {meta: HSV, stop: 12, unit: 360, info: '_HSL', desc: _('hue')},
        Sl: {meta: HSL, stop: 1, info: 'H_SL', desc: _('saturation')},
        Ll: {meta: HSL, stop: 5, info: 'HS_L', desc: _('lightness')},
        Sv: {meta: HSV, info: 'H_SV', desc: _('saturation')},
        Va: {meta: HSV, info: 'HS_V', desc: _('value')},
        Lo: {meta: OKLAB, stop: 12, info: 'OK_Lch', desc: _('lightness')},
        Co: {meta: OKLCH, stop: 12, unit: 0.4, info: 'OKL_ch', desc: _('chroma')},
        Ho: {meta: OKLCH, stop: 12, unit: 360, info: 'OKLc_h', desc: _('hue')},
        Ao: {meta: OKLAB, unit: 0.4, info: 'OKL_ab', desc: _('chroma A')},
        Bo: {meta: OKLAB, unit: 0.4, info: 'OKLa_b', desc: _('chroma B')},
        Cy: {meta: CMYK, info: '_CMYK', desc: _('cyan')},
        Ma: {meta: CMYK, info: 'C_MYK', desc: _('magenta')},
        Ye: {meta: CMYK, info: 'CM_YK', desc: _('yellow')},
        Bk: {meta: CMYK, info: 'CMY_K', desc: _('black')},
        Na: {meta: Name},
    };

    static Type = new Proxy({
        x: {desc: _('hex lowercase 2 digits'), show: x => hex(x)},
        X: {desc: _('hex uppercase 2 digits'), show: x => hex(x).toUpperCase()},
        h: {desc: _('hex lowercase 1 digit'), show: x => numeric(x >> 4, 0, 16)},
        H: {desc: _('hex uppercase 1 digit'), show: x => numeric(x >> 4, 0, 16).toUpperCase()},
        f: {desc: _('float with leading zero'), show: (x, n, u) => numeric(norm(x, u), n)},
        F: {desc: _('float without leading zero'), show: (x, n, u) => numeric(norm(x, u), n).replace(/^0./, '.')},
        n: {desc: _('number value (original)'), show: (x, n) => numeric(x, n)},
        p: {desc: _('percent value'), show: (x, n, u) => `${numeric(norm(x, u) * 100, n)}%`},
    }, {get: (t, k) => t[k] ?? {show: (x, n) => numeric(x, n)}});

    static types = new Set(Object.keys(this.Type));
    static items = Object.keys(this.Form).filter(t => this.Form[t].stop);
    static forms = new Set(Object.keys(this.Form).filter(t => this.Form[t].desc));

    static sample(data) {
        return data && new Color(0x26f3ba, [data]).toText();
    }

    #fmt = new Proxy([Object.create(RGB, {Al: {value: 255}}), new Map()], {
        get: ([t, m], k, r) => t[k] ?? m.get(k) ?? Object.entries(Color.Form[k].meta.get(r)).reduce((p, [n, v]) => p.set(n, v), m).get(k),
        set: ([t, m], k, v, r) => k in t ? t.equal(v) || t.assign(m, k, v) : r[k] === v || t.sync(m.set(k, v), Color.Form[k].meta.set(r)),
    });

    constructor(raw = 0, formats = []) { // raw <- 0x0FRRGGBB
        [this.format, ...this.#fmt[hub]] = [24, 16, 8, 0].map(x => raw >>> x & 0xff);
        this.formats = formats;
    }

    fromPixels(pixels, start = 0) {
        this.#fmt[hub] = pixels.slice(start, start + 3);
    }

    toRaw() { // -> 0x0FRRGGBB
        return [this.format, ...this.#fmt[hub]].reduce((p, x) => p << 8 | x);
    }

    update(form, value) {
        this.#fmt[form] = denorm(value, Color.Form[form].unit);
    }

    toItems(func) {
        return Color.items.reduce((p, x) => {
            let {unit, span} = Color.Form[x];
            return p[$][x](func(x, norm(this.#fmt[x], unit), unit, span));
        }, {});
    }

    toStops(form, rtl) {
        let {meta: {set, get}, unit, stop = 1} = Color.Form[form];
        let color = get(this.#fmt);
        return T.array(stop + 1, i => {
            let step = i / stop;
            color[form] = denorm(step, unit);
            return [rtl ? 1 - step : step, ...RGB.tuple(set(color)), 1];
        });
    }

    toText(format) {
        return T.format(this.formats[format ?? this.format] || HEX, text => {
            let exec = /^(?<form>[A-Z][a-z])((?<type>[A-Za-z])(?<digit>\d+)?)?$/.exec(text);
            if(!exec) return;
            let {form, type, digit} = exec.groups;
            if(!Color.forms.has(form) || (type && !Color.types.has(type))) return;
            let {unit} = Color.Form[form];
            type ??= Number.isInteger(unit) ? 'n' : 'p';
            return Color.Type[type].show(this.#fmt[form], digit ? parseInt(digit) : 0, unit);
        });
    }

    toName(plain, prefix = '', suffix = '') {
        let name = this.formats.naming?.(this.#fmt.Na);
        return name ? `${prefix}${plain ? name : `<span alpha="75%">${T.esc(name)}</span>`}${suffix}` : '';
    }

    toMarkup(format) {
        let style = `fgcolor="${this.#fmt.Lo > Grey ? 'black' : 'white'}" bgcolor="${this.toHEX()}"`;
        return `<span ${style}>${T.esc(this.toText(format))}</span>${this.toName(false, ' ')}`;
    }

    toView(text, prefix = '\n', suffix) {
        return `${text ?? this.toText()}${this.toName(text, prefix, suffix)}`;
    }

    toHEX() {
        return `#${this.#fmt[hub].map(hex).join('')}`;
    }

    toRGB() {
        return RGB.tuple(this.#fmt);
    }
}
