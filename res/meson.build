configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: {
    'name': NAME,
    'uuid': UUID,
    'gettext': GETTEXT,
    'schemas': SCHEMAS,
    'version': VERSION,
    'description': DESCRIPTION,
    'url': 'https://github.com/tuberry' / EID,
    'shell': meson.project_version().split('.')[0]
  },
  install_dir: TARGET_DIR
)

subdir('schemas')

if fs.is_dir('styles')
  subdir('styles')
endif

if fs.is_dir('icons')
  install_subdir('icons', install_dir: TARGET_DIR)
endif
