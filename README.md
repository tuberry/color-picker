# color-picker

Simple color picker for GNOME Shell.
> 春水碧于天，画船听雨眠。 —— *韦庄《菩萨蛮》*<br>
[![license]](/LICENSE.md)
</br>

![color-picker-menu](https://user-images.githubusercontent.com/17917040/229520114-8e023786-fe8a-47bc-952e-263b8bf20b69.png)

## Installation

### Manual

The latest and supported version should only work on the most current stable version of GNOME Shell.

```bash
git clone --recurse-submodules https://github.com/tuberry/color-picker.git && cd color-picker
meson setup build && meson install -C build
# meson setup build -Dtarget=system && meson install -C build # system-wide, default --prefix=/usr/local
```

For contributing translations:

```bash
bash ./cli/update-po.sh your_lang_code # default to $LANG
```

For older versions (< 44), it's recommended to install via:

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Features

![cppref](https://user-images.githubusercontent.com/17917040/155882315-739d0ec7-9947-49a8-a58c-31475feafdc6.png)

### DBus

The DBus interface retruns the same result as XDG Desktop [Screenshot] Portal required:

```bash
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ColorPicker --method org.gnome.Shell.Extensions.ColorPicker.Pick
```

[license]:https://img.shields.io/badge/license-GPLv3+-green.svg
[EGO]:https://extensions.gnome.org/extension/3396/color-picker/
[Screenshot]:https://github.com/flatpak/xdg-desktop-portal/blob/main/data/org.freedesktop.portal.Screenshot.xml
