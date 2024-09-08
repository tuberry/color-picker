# color-picker

Simple color picker for GNOME Shell.
> 春水碧于天，画船听雨眠。 —— *韦庄《菩萨蛮》*\
[![license]](/LICENSE.md)

![color-picker-menu](https://github.com/user-attachments/assets/46718c65-42e5-4445-8cab-be26d8d75e55)

## Installation

### Manual

The latest and supported version should only work on the most current stable version of GNOME Shell.

```bash
git clone https://github.com/tuberry/color-picker.git && cd color-picker
meson setup build && meson install -C build
# meson setup build -Dtarget=system && meson install -C build # system-wide, default --prefix=/usr/local
```

For older versions, it's recommended to install via:

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Features

![cppref](https://github.com/user-attachments/assets/f3e60e8d-de9b-40e2-8fae-1a5b54f75026)

### DBus

The DBus interface returns the same result as XDG Desktop [Screenshot] Portal required:

```bash
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ColorPicker --method org.gnome.Shell.Extensions.ColorPicker.Pick
```

## Contributions

Any contribution is welcome.

### Ideas

For any question or idea, feel free to open an issue or PR in the repo.

### Translations

To update the po file from sources:

```bash
bash ./cli/update-po.sh [your_lang_code] # like zh_CN, default to $LANG
```

### Developments

To install GJS TypeScript type [definitions](https://www.npmjs.com/package/@girs/gnome-shell):

```bash
npm install @girs/gnome-shell --save-dev
```

## Acknowledgements

* [PowerToys]: the idea of custom color formats

[license]:https://img.shields.io/badge/license-GPLv3+-green.svg
[EGO]:https://extensions.gnome.org/extension/3396/color-picker/
[Screenshot]:https://github.com/flatpak/xdg-desktop-portal/blob/main/data/org.freedesktop.portal.Screenshot.xml
[PowerToys]:https://learn.microsoft.com/en-us/windows/powertoys/color-picker#managing-color-formats
