configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: {
    'name': NAME,
    'uuid': UUID,
    'gettext': GETTEXT,
    'schemas': SCHEMAS,
    'version': VERSION,
    'url': 'https://github.com/tuberry' / EID,
    'shell': meson.project_version().split('.')[0],
    'description': INFO + '\\n\\nFor support, please report any issues via the homepage link below.'
  },
  install_dir: TARGET_DIR
)

subdir('schemas')

if fs.is_dir('styles')
  subdir('styles')
endif

if fs.is_dir('icons')
  subdir('icons')
endif
