SHEET = 'stylesheet.css'

if fs.exists(SHEET)
  install_data(SHEET, install_dir: TARGET_DIR)
else
  sassc = find_program('sassc', required: true)
  custom_target(SHEET,
    input: fs.replace_suffix(SHEET, '.scss'),
    output: SHEET,
    # depend_files: SASS,
    command: [sassc, '-t', 'expanded', '-a', '@INPUT@', '@OUTPUT@'],
    install: true,
    install_dir: TARGET_DIR
  )
endif
