<!--
SPDX-FileCopyrightText: tuberry
SPDX-License-Identifier: CC-BY-SA-4.0
-->

# color-picker

GNOME Shell extension to pick colors on the desktop.

> 春水碧于天，画船听雨眠。 —— _韦庄《菩萨蛮》_\
> [![license]](/LICENSE.md)

![color-picker-menu](https://github.com/user-attachments/assets/46718c65-42e5-4445-8cab-be26d8d75e55)

## Installation

### Manual

The latest and supported version should only work on the [current stable version](https://release.gnome.org/calendar/#branches) of GNOME Shell.

```bash
git clone https://github.com/tuberry/color-picker.git && cd color-picker
meson setup build && meson install -C build
# meson setup build -Dtarget=system && meson install -C build # system-wide, default --prefix=/usr/local
```

For older versions, it's recommended to install via:

```bash
gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
          --method org.gnome.Shell.Extensions.InstallRemoteExtension 'color-picker@tuberry'
```

It's quite the same as installing from:

### E.G.O

[<img src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" alt="Get it on GNOME Extensions" height="100" align="middle">][EGO]

## Features

### DBus

```bash
gdbus introspect --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ColorPicker
```

#### Pick

Pick a color and return as XDG Desktop [Screenshot] Portal required.

#### Run

Invoke like using the shortcut or clicking the systray indicator. e.g.:

```desktop
[Desktop Entry]
Type=Application
NoDisplay=false
Exec=gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Extensions/ColorPicker --method org.gnome.Shell.Extensions.ColorPicker.Run
Icon=face-monkey
Name=Color Picker
```

## Contributions

Feel free to open an issue or PR in the repo for any question or idea.

### Translations

To initialize or update the po file from sources:

```bash
bash ./cli/update-po.sh [your_lang_code] # like zh_CN, default to $LANG
```

### Developments

To install GJS TypeScript type [definitions](https://www.npmjs.com/package/@girs/gnome-shell):

```bash
npm install @girs/gnome-shell --save-dev
```

## Acknowledgements

- [PowerToys]: the idea of custom color formats

[license]: https://img.shields.io/badge/license-GPLv3+-green.svg
[EGO]: https://extensions.gnome.org/extension/3396/color-picker/
[Screenshot]: https://github.com/flatpak/xdg-desktop-portal/blob/main/data/org.freedesktop.portal.Screenshot.xml
[PowerToys]: https://learn.microsoft.com/en-us/windows/powertoys/color-picker#managing-color-formats
