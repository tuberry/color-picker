if(TARGET == 'system')
  gnome.compile_schemas()
elif(TARGET == 'local')
  custom_target(
    'gschemas',
    build_by_default: true,
    build_always_stale: true,
    output: 'gschemas.compiled',
    command: [
      find_program('glib-compile-schemas'),
      '--targetdir=@OUTDIR@',
      '@CURRENT_SOURCE_DIR@'
      ],
    install: true,
    install_dir: SCHEMA_DIR
    )
endif

install_data(SCHEMAS + '.gschema.xml', install_dir: SCHEMA_DIR)
