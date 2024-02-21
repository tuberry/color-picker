sheets = ['stylesheet-dark.css', 'stylesheet-light.css']

sassc = find_program('sassc', required: true)
foreach sheet: sheets
  custom_target(
    input: fs.replace_suffix(sheet, '.scss'),
    output: sheet,
    command: [sassc, '-t', 'expanded', '-a', '@INPUT@', '@OUTPUT@'],
    install: true,
    install_dir: target_dir
  )
endforeach
