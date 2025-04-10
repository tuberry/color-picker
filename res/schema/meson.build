# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

gscm = configure_file(
  input: 'schemas.gschema.xml.in',
  output: '@0@.gschema.xml'.format(metadata['rdnn']),
  configuration: metadata,
  install_dir: schema_dir,
)

if(target == 'system')
  gnome.post_install(glib_compile_schemas: true)
elif(target == 'local')
  custom_target(
    depend_files: [gscm],
    output: 'gschemas.compiled',
    build_by_default: true,
    build_always_stale: true,
    command: [
      find_program('glib-compile-schemas'),
      '--strict',
      '--targetdir=@OUTDIR@',
      '@OUTDIR@',
    ],
    install: true,
    install_dir: schema_dir,
  )
endif
