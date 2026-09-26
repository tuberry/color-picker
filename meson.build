# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

project(
  'gnome-shell-extension-color-picker',
  license: 'GPL-3.0-or-later',
  version: '51.1',
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
elif target == 'local'
  _local = run_command(find_program('gjs'), '-m', 'cli/local.js', me['uuid'], (get_option('version') ? me['shell'] : ''), check: true).stdout().splitlines()
  me += {'version': (_local.length() == 2) ? '\n  "version": @0@,'.format(_local.get(1)) : ''}
  target_dir = _local.get(0)
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
  # meson.add_install_script(find_program('7z'), 'a', meson.project_build_root() / '@0@.zip'.format(meson.project_name()), target_dir / '*')
  meson.add_install_script(
    find_program('python3'),
    '-c', # HACK: zip / py.zipfile won't strip_directory
    'import shutil,sys; shutil.make_archive(sys.argv[1], "zip", sys.argv[2])',
    meson.project_build_root() / meson.project_name(),
    target_dir,
  )
endif

subdir('po')
subdir('res')

if not get_option('minify') or target == 'zip'
  install_subdir('src', strip_directory: true, install_dir: target_dir, install_tag: 'src')
else
  custom_target(
    depend_files: run_command(find_program('sh'), '-c', 'for x in src/*.js; do echo "$x"; done', check: false).stdout().strip().split('\n'), # HACK: https://mesonbuild.com/FAQ.html#why-cant-i-specify-target-files-with-a-wildcard
    input: ['src/extension.js', 'src/prefs.js'],
    output: ['extension.js', 'prefs.js'],
    command: [
      find_program('esbuild'),
      '--bundle', '@INPUT@',
      '--outdir=@OUTDIR@',
      '--external:resource://*',
      '--external:gi://*',
      '--format=esm',
      '--minify',
    ],
    install_dir: target_dir,
    install_tag: 'src',
    install: true,
  )
endif
