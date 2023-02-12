#!/bin/bash
# by tuberry

RET=$(curl -sSf https://extensions.gnome.org/extension/$EGO/ | grep data-svm | sed -e 's/.*: //; s/}}"//' | xargs -I{} expr {} + 1)
echo ${RET:?'ERROR: Failed to fetch version, build with `-Dversion` option to skip'}
