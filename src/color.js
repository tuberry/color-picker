// vim:fdm=syntax
// by tuberry
/* exported Color */

const Me = imports.misc.extensionUtils.getCurrentExtension();
const { array, amap } = Me.imports.util;
const { Format } = Me.imports.const;

const f2cent = x => `${Math.round(x * 100)}%`; // 0.111 => '11%'
const stop = n => array(n, i => i / n).concat(1); // `n` is the steps
const luminate = ({ r, g, b }) => Math.sqrt(0.299 * r * r  + 0.587 * g * g + 0.114 * b * b) / 255;

// Ref: https://en.wikipedia.org/wiki/HSL_and_HSV
function rgb2hsv(rgb) {
    let { r, g, b } = amap(rgb, x => x / 255),
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
    return amap({ r: c, g: m, b: y }, x => (1 - x * (1 - k) - k) * 255);
}

function rgb2cmyk({ r, g, b }) {
    let cmy = [r, g, b].map(x => 1 - x / 255),
        n = Math.min(...cmy.values()),
        [c, m, y, k] = n === 1 ? [0, 0, 0, 1] : cmy.map(x => (x - n) / (1 - n)).concat(n);
    return { c, m, y, k };
}

var Color = class {
    #pixel;

    constructor(pixel) { // pixel: 0xRRGGBBFF, ignore alpha for unpickable
        this.#pixel = pixel ?? 0;
    }

    fromClutter({ red: r, green: g, blue: b }) { // from a Clutter.Color
        this.#pixel = (r << 24 | g << 16 | b << 8 | this.format) >>> 0;
        return this;
    }

    get pixel() {
        return this.#pixel;
    }

    set format(format) {
        this.#pixel = (this.#pixel & 0xffffff00 | format) >>> 0;
    }

    get format() {
        return this.#pixel & 0xff;
    }

    set rgb(rgb) {
        let { r, g, b } = amap(rgb, Math.round);
        this.#pixel = (r << 24 | g << 16 | b << 8 | this.format) >>> 0;
    }

    get rgb() {
        return { r: this.#pixel >>> 24 & 0xff, g: this.#pixel >>> 16 & 0xff, b: this.#pixel >>> 8 & 0xff };
    }

    set hsv(hsv) {
        this.rgb = hsv2rgb(hsv);
    }

    get hsv() {
        return rgb2hsv(this.rgb);
    }

    set hsl(hsl) {
        this.hsv = hsl2hsv(hsl);
    }

    get hsl() {
        return hsv2hsl(this.hsv);
    }

    get cmyk() {
        return rgb2cmyk(this.rgb);
    }

    set cmyk(cmyk) {
        this.rgb = cmyk2rgb(cmyk);
    }

    equal(color) {
        return this.#pixel === color;
    }

    assign(key, value) {
        this[key] = Object.assign(this[key], value);
    }

    update(type, value) {
        switch(type) {
        case 'r': case 'g': case 'b': this.assign('rgb', { [type]: value }); break;
        case 'h': case 's': case 'l': this.assign('hsl', { [type]: value }); break;
        }
        return this;
    }

    toText(format) {
        switch(format ?? this.format) {
        case Format.RGB: return (({ r, g, b }) => `rgb(${r}, ${g}, ${b})`)(this.rgb);
        case Format.HSL: return (({ h, s, l }) => `hsl(${Math.round(h)}, ${f2cent(s)}, ${f2cent(l)})`)(this.hsl);
        case Format.HSV: return (({ h, s, v }) => `hsv(${Math.round(h)}, ${f2cent(s)}, ${f2cent(v)})`)(this.hsv);
        case Format.CMYK: return (({ c, m, y, k }) => `cmyk(${c}, ${m}, ${y}, ${k})`)(amap(this.cmyk, f2cent));
        case Format.hex: return (this.#pixel >>> 8).toString(16).padStart(6, '0');
        default: return `#${(this.#pixel >>> 8).toString(16).padStart(6, '0')}`;
        }
    }

    toMarkup(format) { // NOTE: https://gitlab.gnome.org/GNOME/mutter/-/issues/1324
        return ` <span face="monospace" fgcolor="${luminate(this.rgb) > 0.5 ? '#000' : '#fff'}" bgcolor="${this.toText(Format.HEX)}">${this.toText(format)}</span>`;
    }

    toRGBA(alpha = 1) {
        let { r, g, b } = amap(this.rgb, x => x / 255);
        return [r, g, b, alpha];
    }

    toStop(type) { // linear gradient color stop
        let color = new Color(this.#pixel);
        switch(type) {
        case 'r': case 'g': case 'b': return stop(1).map(x => [x].concat(color.update(type, x * 255).toRGBA()));
        case 'h': return stop(12).map(x => [x].concat(color.update(type, x * 360).toRGBA()));
        case 's': return stop(1).reverse().map(x => [x].concat(color.update(type, x).toRGBA())); // `s` starts from the end
        case 'l': return stop(4).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5)).map(x => [x].concat(color.update(type, x).toRGBA())); // `l` starts from the middle
        }
    }
};
