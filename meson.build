project(
  'gnome-shell-extension-color-picker',
  license: 'GPL-3.0-or-later',
  version: '48.0',
)

_name = meson.project_name().replace('gnome-shell-extension-', '')
_version = get_option('version')
metadata = {
    'name': 'Color Picker',
    'uuid': _name + '@tuberry',
    'gettext': meson.project_name(),
    'shell': meson.project_version().split('.')[0],
    'url': 'https://github.com/tuberry' / _name,
    'schemas': 'org.gnome.shell.extensions.' + _name,
    'version': (_version != 0) ? _version : run_command('cli/get-version.sh', check: true, env: ['EGO=3396' / _name]).stdout().strip(),
    'description': 'Simple color picker for GNOME Shell'
      + '\\n\\nFor support, please report issues via the Homepage link below rather than the comments section below it'
}

fs = import('fs')
i18n = import('i18n')
gnome = import('gnome')

target = get_option('target')
datadir = get_option('datadir')
if(target == 'system')
  locale_dir = get_option('localedir')
  schema_dir = datadir / 'glib-2.0' / 'schemas'
  target_dir = datadir / 'gnome-shell' / 'extensions' / metadata['uuid']
else
  target_root = (target == 'local') ? fs.expanduser('~/.local/share/gnome-shell/extensions/') : meson.project_build_root()
  target_dir = target_root / metadata['uuid']
  locale_dir = target_dir / 'locale'
  schema_dir = target_dir / 'schemas'
endif

if(target == 'zip')
  zip_dir = get_option('desktop') ? fs.expanduser('~/Desktop') : target_root
  meson.add_install_script(
    find_program('7z'),
    'a',
    zip_dir / '@0@_v@1@.zip'.format(metadata['gettext'], metadata['version']),
    target_dir / '*'
  )
endif

subdir('po')
subdir('res')
install_subdir('src', install_dir: target_dir, strip_directory: true)
