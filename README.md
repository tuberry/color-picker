# color-picker

Simple color picker for GNOME Shell.
> 春水碧于天，画船听雨眠。 —— *韦庄《菩萨蛮》*<br>
[![license]](/LICENSE)
</br>

![picker](https://user-images.githubusercontent.com/17917040/109381547-08dee980-7916-11eb-8b7f-10f1cf090e8e.png)

## Installation

### Manual

The latest and supported version should only work on the most current stable version of GNOME Shell.

```bash
git clone https://github.com/tuberry/color-picker.git && cd color-picker
meson setup build && meson install -C build
# meson setup build -Dtarget=system && meson install -C build # system-wide, default --prefix=/usr/local
```

For contributing translations:

```bash
bash ./cli/update-po.sh your_lang_code # default to $LANG
```

For older versions, it's recommended to install via:

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Features

![cppref](https://user-images.githubusercontent.com/17917040/155882315-739d0ec7-9947-49a8-a58c-31475feafdc6.png)

[license]:https://img.shields.io/badge/license-GPLv3-green.svg
[EGO]:https://extensions.gnome.org/extension/3396/color-picker/
