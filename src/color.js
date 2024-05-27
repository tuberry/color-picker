// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import {id, array} from './util.js';

const Grey = 0.569; // L in OKLab <=> 18% grey #777777

const _ = id; // HACK: workaround for gettext
const number = (x, n, r) => n === undefined ? x : Number(x.toFixed(n)).toString(r);
const percent = (x, n) => `${number(x * 100, n)}%`;
const hex = x => number(x, 0, 16).padStart(2, '0');
const denorm = (v, u) => u ? v * u : v;
const norm = (v, u) => u ? v / u : v;

const RGB = {
    get: ({Re, Gr, Bl}) => ({r: Re / 255, g: Gr / 255, b: Bl / 255}), set: id,
    alter: (x, {r, g, b}) => { x.Re = r * 255; x.Gr = g * 255; x.Bl = b * 255; },
    unbox: ({r, g, b}) => [r, g, b],
};

// Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
const HSV = {
    get: ({r, g, b}) => {
        let [mn, , v] = [r, g, b].sort(),
            d = v - mn,
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
        let k = Math.floor(h),
            f = h - k,
            p = v * (1 - s),
            q = v * (1 - f * s),
            t = v * (1 - (1 - f) * s);
        return {
            r: [v, q, p, p, t, v][k],
            g: [t, v, v, q, p, p][k],
            b: [p, p, t, v, v, q][k],
        };
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

// Ref: https://bottosson.github.io/posts/oklab/
const OKLAB = {
    get: ({r, g, b}) => {
        [r, g, b] = [r, g, b].map(x => x > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92); // linear srgb
        let l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
            m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
            s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
        return {
            Lo: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            Ao: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            Bo: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
        };
    },
    set: ({Lo, Ao, Bo}) => {
        let l = (Lo + 0.3963377774 * Ao + 0.2158037573 * Bo) ** 3,
            m = (Lo - 0.1055613458 * Ao - 0.0638541728 * Bo) ** 3,
            s = (Lo - 0.0894841775 * Ao - 1.2914855480 * Bo) ** 3,
            [r, g, b] = [
                +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
            ].map(x => Math.clamp(x >= 0.0031308 ? Math.pow(x, 1 / 2.4) * 1.055 - 0.055 : x * 12.92, 0, 1)); // |OKLab| > |RGB|
        return {r, g, b};
    },
};

const OKLCH = {
    get: ({Lo, Ao, Bo}) => ({Lo, Co: Math.hypot(Ao, Bo), Ho: 180 * (Math.atan2(Bo, Ao) / Math.PI + 2) % 360}),
    set: ({Lo, Co, Ho}) => OKLAB.set({Lo, Ao: Co * Math.cos(Math.PI * Ho / 180), Bo: Co * Math.sin(Math.PI * Ho / 180)}),
};

// Ref: http://www.easyrgb.com/en/math.php
const CMYK = {
    get: ({r, g, b}) => {
        let mx = Math.max(r, g, b);
        return mx === 0 ? {Cy: 0, Ma: 0, Ye: 0, Bk: 1} : {Cy: 1 - r / mx, Ma: 1 - g / mx, Ye: 1 - b / mx, Bk: 1 - mx};
    },
    set: ({Cy, Ma, Ye, Bk}) => {
        let mx = 1 - Bk;
        return {r: (1 - Cy) * mx, g: (1 - Ma) * mx, b: (1 - Ye) * mx};
    },
};

export class Color {
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
    };

    static Type = new Proxy({
        x: {desc: _('hex lowercase 2 digits'), show: x => hex(x)},
        X: {desc: _('hex uppercase 2 digits'), show: x => hex(x).toUpperCase()},
        h: {desc: _('hex lowercase 1 digit'), show: x => number(x >> 4, 0, 16)},
        H: {desc: _('hex uppercase 1 digit'), show: x => number(x >> 4, 0, 16).toUpperCase()},
        f: {desc: _('float with leading zero'), show: (x, n, u) => number(norm(x, u), n)},
        F: {desc: _('float without leading zero'), show: (x, n, u) => number(norm(x, u), n).replace(/^0./, '.')},
        n: {desc: _('number value (original)'), show: (x, n) => number(x, n)},
        p: {desc: _('percent value'), show: (x, n, u) => percent(norm(x, u), n)},
    }, {get: (t, s) => t[s] ?? {show: (x, n) => number(x, n)}});

    static types = new Set(Object.keys(this.Type));
    static items = Object.keys(this.Form).filter(t => this.Form[t].stop);
    static forms = new Set(Object.keys(this.Form).filter(t => this.Form[t].desc));

    static newForFormat(format, formats) {
        return new Color(format << 24, formats);
    }

    static sample(data) {
        return data && new Color(0x26f3ba, [data]).toText();
    }

    #rgb = {Re: 0, Gr: 0, Bl: 0, Al: 255};
    #fmt = new Proxy(new Map(), {
        get: (t, s, r) => this.#rgb[s] ?? t.get(s) ?? Object.entries(Color.Form[s].meta.get(r)).reduce((p, [k, v]) => p.set(k, v), t).get(s),
        set: (t, s, v, r) => {
            if(s in this.#rgb) {
                this.#rgb[s] = v;
            } else {
                t.set(s, v);
                RGB.alter(this.#rgb, Color.Form[s].meta.set(r));
            }
            t.clear();
            return true;
        },
    }); // format cache

    set $rgb([r, g, b]) {
        if(r === this.#rgb.Re && g === this.#rgb.Gr && b === this.#rgb.Bl) return;
        this.#rgb.Re = r;
        this.#rgb.Gr = g;
        this.#fmt.Bl = b;
    }

    get $rgb() {
        return [this.#rgb.Re, this.#rgb.Gr, this.#rgb.Bl];
    }

    constructor(raw = 0, formats = []) { // raw <- 0x0FRRGGBB
        [this.format, ...this.$rgb] = [24, 16, 8, 0].map(x => raw >>> x & 0xff);
        this.formats = formats;
    }

    fromPixels(pixels, start = 0) {
        this.$rgb = pixels.slice(start);
    }

    toRaw() { // 0x0FRRGGBB
        return [this.format, ...this.$rgb].reduce((p, x) => p << 8 | x);
    }

    update(form, value) {
        this.#fmt[form] = denorm(value, Color.Form[form].unit);
    }

    toItems(func) {
        return Color.items.reduce((p, x) => {
            let {unit, span} = Color.Form[x];
            p[x] = func(x, norm(this.#fmt[x], unit), unit, span);
            return p;
        }, {});
    }

    toStops(form, rtl) {
        let {meta: {set, get}, unit, stop = 1} = Color.Form[form];
        let color = get(this.#fmt);
        return array(stop + 1, i => {
            let step = i / stop;
            color[form] = denorm(step, unit);
            return [rtl ? 1 - step : step, ...RGB.unbox(set(color)), 1];
        });
    }

    toText(format) {
        let pos, txt = this.formats[format ?? this.format] || '#%Rex%Grx%Blx';
        while((pos = txt.indexOf('%', pos) + 1)) {
            let peek = pos + 2;
            let form = txt.slice(pos, peek);
            if(!Color.forms.has(form)) continue;
            let digit, {unit} = Color.Form[form],
                value = this.#fmt[form],
                type = txt.charAt(peek);
            if(Color.types.has(type)) {
                let n = txt.charCodeAt(++peek) - 48; // '0' = 48
                if(n >= 0 && n < 10) digit = n, peek++;
            } else {
                if(!Number.isInteger(unit)) type = 'p';
                digit = 0;
            }
            txt = `${txt.slice(0, pos - 1)}${Color.Type[type].show(value, digit, unit)}${txt.slice(peek)}`;
        }
        return txt;
    }

    toHEX() {
        return `#${this.$rgb.map(hex).join('')}`;
    }

    toMarkup(format) { // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${this.#fmt.Lo > Grey ? 'black' : 'white'}" bgcolor="${this.toHEX()}">${this.toText(format)}</span>`;
    }

    toPreview() {
        return `<span bgcolor="${this.toHEX()}">\u2001 </span> ${this.toText()}`;
    }

    toRGB() {
        return RGB.unbox(this.#fmt);
    }

    toComplement() {
        let {Hu, Sl, Lo} = this.#fmt;
        return RGB.unbox(HSL.set(Sl < 0.1 ? {Hu: 0, Sl: 0, Ll: Lo < Grey ? 1 : 0} : {Hu: (Hu + 180) % 360, Sl: 1, Ll: 0.5}));
    }
}
