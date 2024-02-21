install_data('schemas.gschema.xml',
  rename: metadata['schemas'] + '.gschema.xml',
  install_dir: schema_dir
)

if(target == 'system')
  gnome.post_install(glib_compile_schemas: true)
elif(target == 'local')
  custom_target(
    output: 'gschemas.compiled',
    command: [
      find_program('glib-compile-schemas'),
      '--targetdir=@OUTDIR@',
      '@CURRENT_SOURCE_DIR@'
    ],
    install: true,
    install_dir: schema_dir
  )
endif
