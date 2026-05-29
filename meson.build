# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'gnome-shell-extension-color-picker',
  license: 'GPL-3.0-or-later',
  version: '50.2',
  meson_version: '>= 1.10.0',
)

pname = meson.project_name().replace('gnome-shell-extension-', '')

me = {
  'name': 'Color Picker',
  'uuid': pname + '@tuberry',
  'description': 'Pick colors on the desktop'
}

me += {
  'gettext': meson.project_name(),
  'url': 'https://github.com/tuberry' / pname,
  'shell': meson.project_version().split('.')[0],
  'rdnn': 'org.gnome.shell.extensions.' + pname,
  'path': f'/org/gnome/shell/extensions/@pname@/',
  'dbus': 'org.gnome.Shell.Extensions.' + me['name'].replace(' ', ''),
}

fs = import('fs')
i18n = import('i18n')
gnome = import('gnome')

target = get_option('target')
if target == 'system'
  me += {'version': '\n  "version-name": "@0@",'.format(meson.project_version())}
  locale_dir = get_option('localedir')
  schema_dir = get_option('datadir') / 'glib-2.0' / 'schemas'
  target_dir = get_option('datadir') / 'gnome-shell' / 'extensions' / me['uuid']
elif target == 'local' # https://docs.gtk.org/glib/func.get_user_data_dir.html
  me += {'version': get_option('version') ? '\n  "version": @0@,'.format(run_command('cli/get-version.py', me['uuid'], me['shell'], check: true).stdout().strip()) : ''}
  target_dir = run_command('sh', '-c', 'echo ${XDG_DATA_HOME:-$HOME/.local/share}', check: false).stdout().strip() / 'gnome-shell' / 'extensions' / me['uuid']
  locale_dir = target_dir / 'locale'
  schema_dir = target_dir / 'schemas'
else
  me += {
    'version': '\n  "version": 1,',
    'description': me['description'] + '\\n\\nFor support, please report issues in time via the Homepage link below rather than the review section below it'
  }
  target_dir = meson.project_build_root() / me['uuid']
  locale_dir = target_dir / 'locale'
  schema_dir = target_dir / 'schemas'
  _zip_dir = get_option('desktop') ? fs.expanduser('~/Desktop') : meson.project_build_root()
  meson.add_install_script(
    find_program('7z'),
    'a',
    _zip_dir / '@0@_v@1@.zip'.format(meson.project_name(), meson.project_version()),
    target_dir / '*',
  )
endif

subdir('po')
subdir('res')
install_subdir('src', strip_directory: true, install_dir: target_dir)
