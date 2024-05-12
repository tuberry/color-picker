// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import {array} from './util.js';

const percent = x => `${Math.round(x * 100)}%`; // 0.111 => '11%'
const genStops = (n, f, r) => array(n + 1, i => (x => [r ? 1 - x : x].concat(f(x), 1))(i / n));

const Index = {r: 0, g: 1, b: 2, h: 0, s: 1, l: 2};
const Base = new Set(['b', 'h', 'H', 'x', 'X', 'f', 'F']);
const Type = new Set(['Re', 'Gr', 'Bl', 'Hu', 'Sl', 'Ll', 'Va', 'Cy', 'Ma', 'Ye', 'Bk']);

function formatByte(byte, base) {
    switch(base) {
    case 'b': return byte;
    case 'h': return (byte >> 4).toString(16);
    case 'H': return (byte >> 4).toString(16).toUpperCase();
    case 'x': return byte.toString(16).padStart(2, '0');
    case 'X': return byte.toString(16).padStart(2, '0').toUpperCase();
    case 'f': return (byte / 255).toLocaleString(undefined, {maximumFractionDigits: 3});
    case 'F': return (byte / 255).toLocaleString(undefined, {maximumFractionDigits: 3}).slice(1);
    default: return byte;
    }
}

function lstar([r, g, b]) { // L* in CIELAB, Ref: https://stackoverflow.com/a/56678483
    let f = x => x > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
    let y = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    return y > 216 / 24389 ? Math.pow(y, 1 / 3) * 116 - 16 : y * 24389 / 27;
}

// Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
function rgb2hsv([r, g, b]) {
    let [min, , max] = [r, g, b].sort(),
        d = max - min,
        s = max === 0 ? 0 : d / max,
        k = 0;
    if(d !== 0) { // chromatic
        switch(max) {
        case r: k = (g - b) / d + (g < b ? 6 : 0); break;
        case g: k = (b - r) / d + 2; break;
        case b: k = (r - g) / d + 4; break;
        }
    }
    return [k * 60, s, max];
}

function hsv2rgb([h, s, v]) {
    h = h / 60 % 6;
    let k = Math.floor(h),
        f = h - k,
        p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s);
    return [
        [v, q, p, p, t, v][k],
        [t, v, v, q, p, p][k],
        [p, p, t, v, v, q][k],
    ];
}

function hsl2hsv([h, s, l]) {
    let v = l + s * Math.min(l, 1 - l);
    return [h, v === 0 ? 0 : 2 * (1 - l / v), v];
}

function hsv2hsl([h, s, v]) {
    let l = v * (1 - s / 2);
    return [h, l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l];
}

function hsl2rgb(hsl) {
    return hsv2rgb(hsl2hsv(hsl));
}

function rgb2hsl(rgb) {
    return hsv2hsl(rgb2hsv(rgb));
}

function cmyk2rgb(cmyk) { // Ref: http://www.easyrgb.com/en/math.php
    return cmyk.slice(0, 3).map(x => 1 - x * (1 - cmyk[3]) - cmyk[3]);
}

function rgb2cmyk(rgb) {
    let max = Math.max(...rgb);
    return max === 0 ? [0, 0, 0, 1] : rgb.map(x => (max - x) / max).concat(1 - max);
}

export class Color {
    static new_for_format(format, formats) {
        return new Color(format << 24, formats);
    }

    static sample(data) {
        return data && new Color(0x26f3ba, [data]).toText();
    }

    #rgb; // [0-255]{3}
    #fmt = {}; // format cache

    constructor(raw = 0, formats = []) { // raw <- 0x0FRRGGBB
        [this.format, ...this.#rgb] = [24, 16, 8, 0].map(x => raw >>> x & 0xff);
        this.formats = formats;
    }

    set rgb(rgb) {
        this.#rgb = rgb.map(x => Math.round(x * 255));
    }

    get rgb() {
        return this.#rgb.map(x => x / 255);
    }

    set hsv(hsv) {
        this.rgb = hsv2rgb(hsv);
    }

    get hsv() {
        return rgb2hsv(this.rgb);
    }

    set hsl(hsl) {
        this.rgb = hsl2rgb(hsl);
    }

    get hsl() {
        return rgb2hsl(this.rgb);
    }

    get cmyk() {
        return rgb2cmyk(this.rgb);
    }

    set cmyk(cmyk) {
        this.rgb = cmyk2rgb(cmyk);
    }

    update(type, value) {
        switch(type) {
        case 'r': case 'g': case 'b': this.rgb = this.rgb.with([Index[type]], value); break;
        case 's': case 'l': this.hsl = this.hsl.with(Index[type], value); break;
        case 'h': this.hsl = this.hsl.with(Index[type], value * 360); break;
        }
        return this;
    }

    fromPixels(pixels, start = 0) {
        for(let i = 0; i < 3; i++) this.#rgb[i] = pixels[start + i];
    }

    toRGBHSL() { // -> {(0-1)}
        let {rgb} = this,
            [r, g, b] = rgb,
            [h, s, l] = rgb2hsl(rgb);
        return {r, g, b, h: h / 360, s, l};
    }

    toRaw() { // 0x0FRRGGBB
        return [this.format, ...this.#rgb].reduce((p, x) => p << 8 | x);
    }

    toText(format) {
        let pos, txt = this.formats[format ?? this.format] || '#%Rex%Grx%Blx';
        while((pos = txt.indexOf('%', pos) + 1)) {
            let end = pos + 2;
            let type = txt.slice(pos, end);
            if(!Type.has(type)) continue;
            let base = txt.charAt(end);
            txt = `${txt.slice(0, pos - 1)}${this.$form(type, base)}${txt.slice(Base.has(base) ? end + 1 : end)}`;
        }
        this.#fmt = {};
        return txt;
    }

    $get(kind) {
        switch(kind) {
        case 'hsl': return (this.#fmt.hsl ??= this.hsl);
        case 'cmyk': return (this.#fmt.cmyk ??= this.cmyk);
        }
    }

    $form(type, base) {
        switch(type) {
        case 'Re': return formatByte(this.#rgb[0], base);
        case 'Gr': return formatByte(this.#rgb[1], base);
        case 'Bl': return formatByte(this.#rgb[2], base);
        case 'Hu': return Math.round(this.$get('hsl')[0]);
        case 'Sl': return percent(this.$get('hsl')[1]);
        case 'Ll': return percent(this.$get('hsl')[2]);
        case 'Va': return percent(Math.max(...this.rgb));
        case 'Cy': return percent(this.$get('cmyk')[0]);
        case 'Ma': return percent(this.$get('cmyk')[1]);
        case 'Ye': return percent(this.$get('cmyk')[2]);
        case 'Bk': return percent(this.$get('cmyk')[3]);
        default: return '';
        }
    }

    toHEX() {
        return `#${this.#rgb.map(x => x.toString(16).padStart(2, '0')).join('')}`;
    }

    toMarkup(format) { // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${lstar(this.rgb) > 50 ? 'black' : 'white'}" bgcolor="${this.toHEX()}">${this.toText(format)}</span>`;
    }

    toPreview() {
        return `<span bgcolor="${this.toHEX()}">\u2001 </span> ${this.toText()}`;
    }

    toNamed() {
        let [r, g, b] = this.#rgb;
        return {red: r, green: g, blue: b, alpha: 255};
    }

    toComplement() {
        let [h, s] = this.hsl;
        return hsl2rgb(s < 0.1 ? [0, 0, lstar(this.rgb) < 50 ? 1 : 0] : [(h + 180) % 360, 1, 0.5]);
    }

    toStops(type, rtl) { // linear gradient
        let index = Index[type];
        switch(type) {
        case 'r': case 'g': case 'b': { let {rgb} = this; return genStops(1, x => rgb.with(index, x), rtl); }
        case 's': { let {hsl} = this; return genStops(1, x => hsl2rgb(hsl.with(index, x)), rtl); }
        case 'l': { let {hsl} = this; return genStops(5, x => hsl2rgb(hsl.with(index, x)), rtl); }
        case 'h': { let {hsl} = this; return genStops(12, x => hsl2rgb(hsl.with(index, x * 360)), rtl); }
        }
    }
}
