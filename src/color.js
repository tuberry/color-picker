// vim:fdm=syntax
// by tuberry

import { Format } from './const.js';
import { array, vmap, luminance } from './util.js';

const percent = x => `${Math.round(x * 100)}%`; // 0.111 => '11%'
const genStops = n => array(n, i => i / n).concat(1); // `n` is the steps
const parseHEX = m => Math.clamp(parseInt(m, 16), 0, 255);
const zip = (ks, vs) => Object.fromEntries(ks.map((k, i) => [k, vs[i]]));
const parseHSL = (m, i) => i ? Math.clamp(parseInt(m) / 100, 0, 1) : Math.clamp(parseInt(m), 0, 360);

// Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
function rgb2hsv(rgb) {
    let { r, g, b } = vmap(rgb, x => x / 255),
        mx = Math.max(r, g, b),
        mn = Math.min(r, g, b),
        d = mx - mn,
        s = mx === 0 ? 0 : d / mx,
        k = 0;
    if(d !== 0) { // chromatic
        switch(mx) {
        case r: k = (g - b) / d + (g < b ? 6 : 0); break;
        case g: k = (b - r) / d + 2; break;
        case b: k = (r - g) / d + 4; break;
        }
    }
    return { h: k * 60, s, v: mx };
}

function hsv2rgb({ h, s, v }) {
    h = h / 60 % 6;
    let k = Math.floor(h),
        f = h - k,
        p = v * (1 - s),
        q = v * (1 - f * s),
        t = v * (1 - (1 - f) * s),
        r = [v, q, p, p, t, v][k] * 255,
        g = [t, v, v, q, p, p][k] * 255,
        b = [p, p, t, v, v, q][k] * 255;
    return { r, g, b };
}

function hsl2hsv({ h, s, l }) {
    let v = l + s * Math.min(l, 1 - l);
    return { h, s: v === 0 ? 0 : 2 * (1 - l / v), v };
}

function hsv2hsl({ h, s, v }) {
    let l = v * (1 - s / 2);
    return { h, s: l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l), l };
}

// Ref: http://www.easyrgb.com/en/math.php
function cmyk2rgb({ c, m, y, k }) {
    return vmap({ r: c, g: m, b: y }, x => (1 - x * (1 - k) - k) * 255);
}

function rgb2cmyk({ r, g, b }) {
    let cmy = [r, g, b].map(x => 1 - x / 255),
        n = Math.min(...cmy.values()),
        [c, m, y, k] = n === 1 ? [0, 0, 0, 1] : cmy.map(x => (x - n) / (1 - n)).concat(n);
    return { c, m, y, k };
}

export class Color {
    #rgb;

    constructor(raw = 0, rgb) { // raw <- uint
        if(rgb) {
            this.#rgb = { ...rgb };
            this.format = raw;
        } else {
            let [r, g, b, format] = [24, 16, 8, 0].map(x => raw >>> x & 0xff);
            this.#rgb = { r, g, b };
            this.format = format;
        }
    }

    set rgb(rgb) {
        this.#rgb = vmap(rgb, Math.round);
    }

    get rgb() {
        return { ...this.#rgb };
    }

    set hsv(hsv) {
        this.rgb = hsv2rgb(hsv);
    }

    get hsv() {
        return rgb2hsv(this.#rgb);
    }

    set hsl(hsl) {
        this.hsv = hsl2hsv(hsl);
    }

    get hsl() {
        return hsv2hsl(this.hsv);
    }

    get cmyk() {
        return rgb2cmyk(this.#rgb);
    }

    set cmyk(cmyk) {
        this.rgb = cmyk2rgb(cmyk);
    }

    equal(color) {
        return this.toRaw() === color;
    }

    copy() {
        return new Color(this.format, this.#rgb);
    }

    update(type, value) {
        switch(type) {
        case 'r': case 'g': case 'b': Object.assign(this.#rgb, { [type]: Math.round(value) }); break;
        case 'h': case 's': case 'l': this.hsl = Object.assign(this.hsl, { [type]: value }); break;
        }
        return this;
    }

    fromClutter({ red: r, green: g, blue: b }) { // sync with a Clutter.Color
        this.#rgb = { r, g, b };
    }

    fromString(str) {
        return [
            [/^ *#([0-9a-f]{2})([0-9a-f]{2})([0-91-f]{2}) *$/i, parseHEX, 'rgb'],
            [/^ *rgb\( *(\d{1,3}) *, *(\d{1,3}) *, *(\d{1,3}) *\) *$/, m => Math.clamp(parseInt(m), 0, 255), 'rgb'],
            [/^ *hsl\( *(\d{1,3}) *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, parseHSL, 'hsl'],
            [/^ *([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2}) *$/i, parseHEX, 'rgb'],
            [/^ *hsv\( *(\d{1,3}) *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, parseHSL, 'hsv'],
            [/^ *cmyk\( *(\d{1,3})% *, *(\d{1,3})% *, *(\d{1,3})% *, *(\d{1,3})% *\) *$/, m => Math.clamp(parseInt(m) / 100, 0, 1), 'cmyk'],
        ].some(([r, f, t], i) => {
            let [, ...ms] = str.match(r) ?? [];
            if(!ms.length) return false;
            this[t] = zip([...t], ms.map(f));
            this.format = i; // sort by Format
            return true;
        });
    }

    toRaw() {
        let { r, g, b } = this.#rgb;
        return [r, g, b, this.format].reduce((a, x) => a << 8 | x) >>> 0;
    }

    toRGBHSL() {
        return Object.assign(this.hsl, this.#rgb);
    }

    toText(format) {
        switch(format ?? this.format) {
        case Format.RGB: return (({ r, g, b }) => `rgb(${r}, ${g}, ${b})`)(this.#rgb);
        case Format.HSL: return (({ h, s, l }) => `hsl(${Math.round(h)}, ${percent(s)}, ${percent(l)})`)(this.hsl);
        case Format.HSV: return (({ h, s, v }) => `hsv(${Math.round(h)}, ${percent(s)}, ${percent(v)})`)(this.hsv);
        case Format.CMYK: return (({ c, m, y, k }) => `cmyk(${c}, ${m}, ${y}, ${k})`)(vmap(this.cmyk, percent));
        case Format.hex: return (this.toRaw() >>> 8).toString(16).padStart(6, '0');
        default: return `#${(this.toRaw() >>> 8).toString(16).padStart(6, '0')}`;
        }
    }

    toMarkup(format) { // FIXME: workaround for https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${luminance(this.#rgb) > 127 ? 'black' : 'white'}" bgcolor="${this.toText(Format.HEX)}">${this.toText(format)}</span>`;
    }

    toRGBA(alpha = 1) {
        let { r, g, b } = this.#rgb;
        return [r / 255, g / 255, b / 255, alpha];
    }

    toStops(type) { // linear gradient color stop
        let color = this.copy();
        switch(type) {
        case 'r': case 'g': case 'b': return genStops(1).map(x => [x].concat(color.update(type, x * 255).toRGBA()));
        case 'h': return genStops(12).map(x => [x].concat(color.update(type, x * 360).toRGBA()));
        case 's': return genStops(1).reverse().map(x => [x].concat(color.update(type, x).toRGBA())); // `s` starts from the end
        case 'l': return genStops(4).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5)).map(x => [x].concat(color.update(type, x).toRGBA())); // `l` starts from the middle
        }
    }
}
