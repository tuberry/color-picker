# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

configure_file(
  input: 'metadata.json.in',
  output: 'metadata.json',
  configuration: metadata,
  install_dir: target_dir,
)

dbus = configure_file(
  input: 'dbus.xml.in',
  output: '@0@.xml'.format(metadata['dbus']),
  configuration: metadata,
  install_dir: (target == 'system') ? datadir / 'dbus-1/interfaces' : '',
)

foreach name: ['extension']
  gres = configure_file(
    input: f'@name@.gresource.xml.in',
    output: f'@name@.gresource.xml',
    configuration: metadata,
  )
  gnome.compile_resources(
    name, gres,
    source_dir: '@OUTDIR@',
    dependencies: [dbus],
    gresource_bundle: true,
    install: true,
    install_dir: target_dir / 'resource',
  )
endforeach
