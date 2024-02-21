// SPDX-FileCopyrightText: tuberry
// SPDX-License-Identifier: GPL-3.0-or-later

import {array} from './util.js';
import {Format} from './const.js';

const percent = x => `${Math.round(x * 100)}%`; // 0.111 => '11%'
const parseHEX = x => Math.clamp(parseInt(x, 16) / 255, 0, 1);
const genStops = (n, f) => array(n + 1, i => (x => [x].concat(f(x), 1))(i / n));
const parseHSL = (x, i) => i ? Math.clamp(parseInt(x) / 100, 0, 1) : Math.clamp(parseInt(x), 0, 360);

const Index = {r: 0, g: 1, b: 2, h: 0, s: 1, l: 2};

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
    #rgb; // [0-255]{3}

    constructor(raw = 0) { // raw <- 0x0FRRGGBB
        [this.format, ...this.#rgb] = [24, 16, 8, 0].map(x => raw >>> x & 0xff);
    }

    static new_for_format(format) {
        return new Color(format << 24);
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

    equal(raw) {
        return this.toRaw() === raw;
    }

    update(type, value) {
        switch(type) {
        case 'r': case 'g': case 'b': this.rgb = this.rgb.with([Index[type]], value); break;
        case 's': case 'l': this.hsl = this.hsl.with(Index[type], value); break;
        case 'h': this.hsl = this.hsl.with(Index[type], value * 360); break;
        }
        return this;
    }

    fromPixel(pixel, start = 0) {
        for(let i = 0; i < 3; i++) this.#rgb[i] = pixel[start + i];
    }

    fromText(str) {
        return [
            [Format.HEX, /^ *#([0-9a-f]{2})([0-9a-f]{2})([0-91-f]{2}) *$/i, parseHEX, 'rgb'],
            [Format.RGB, /^ *rgb\( *(\d{1,3}) *, *(\d{1,3}) *, *(\d{1,3}) *\) *$/, m => Math.clamp(parseInt(m) / 255, 0, 1), 'rgb'],
            [Format.HSL, /^ *hsl\( *(\d{1,3}) *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, parseHSL, 'hsl'],
            [Format.hex, /^ *([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2}) *$/i, parseHEX, 'rgb'],
            [Format.HSV, /^ *hsv\( *(\d{1,3}) *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, parseHSL, 'hsv'],
            [Format.CMYK, /^ *cmyk\( *(\d{1,3})% *, *(\d{1,3})% *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, m => Math.clamp(parseInt(m) / 100, 0, 1), 'cmyk'],
        ].some(([format, regex, parse, type]) => {
            let [, ...data] = str.match(regex) ?? [];
            if(!data.length) return false;
            this[type] = data.map(parse);
            this.format = format;
            return true;
        });
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
        switch(format ?? this.format) {
        case Format.HEX: return `#${this.#rgb.map(x => x.toString(16).padStart(2, '0')).join('')}`;
        case Format.RGB: return `rgb(${this.#rgb.join(', ')})`;
        case Format.HSL: return `hsl(${this.hsl.map((x, i) => i ? percent(x) : Math.round(x)).join(', ')})`;
        case Format.HSV: return `hsv(${this.hsv.map((x, i) => i ? percent(x) : Math.round(x)).join(', ')})`;
        case Format.hex: return this.#rgb.map(x => x.toString(16).padStart(2, '0')).join('');
        case Format.CMYK: return `cmyk(${this.cmyk.map(percent).join(', ')})`;
        }
    }

    toMarkup(format) { // HACK: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${lstar(this.rgb) > 50 ? 'black' : 'white'}" bgcolor="${this.toText(Format.HEX)}">${this.toText(format)}</span>`;
    }

    toNamed() {
        let [r, g, b] = this.#rgb;
        return {red: r, green: g, blue: b, alpha: 255};
    }

    toComplement() {
        let [h, s] = this.hsl;
        return hsl2rgb(s < 0.1 ? [0, 0, lstar(this.rgb) < 50 ? 1 : 0] : [(h + 180) % 360, 1, 0.5]);
    }

    toStops(type) { // linear gradient
        let index = Index[type];
        switch(type) {
        case 'r': case 'g': case 'b': { let {rgb} = this; return genStops(1, x => rgb.with(index, x)); }
        case 's': { let {hsl} = this; return genStops(1, x => hsl2rgb(hsl.with(index, x))); }
        case 'l': { let {hsl} = this; return genStops(5, x => hsl2rgb(hsl.with(index, x))); }
        case 'h': { let {hsl} = this; return genStops(12, x => hsl2rgb(hsl.with(index, x * 360))); }
        }
    }
}
