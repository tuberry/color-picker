# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

sassc = find_program('sassc', required: true)
foreach s: ['stylesheet-dark.css', 'stylesheet-light.css']
  custom_target(
    input: fs.replace_suffix(s, '.scss'),
    output: s,
    command: [sassc, '-t', 'expanded', '-a', '@INPUT@', '@OUTPUT@'],
    install: true,
    install_dir: target_dir,
  )
endforeach
