configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: metadata,
  install_dir: target_dir
)

subdir('schema')

if fs.is_dir('style')
  subdir('style')
endif

if fs.is_dir('icon')
  subdir('icon')
endif
