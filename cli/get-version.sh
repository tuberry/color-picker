#!/bin/bash
# by tuberry
# 
test -z $EGO && exit 1
RET=$(curl -sSf https://extensions.gnome.org/extension/$EGO/ | grep data-svm | sed -e 's/.*: //; s/}}"//' | xargs -I{} expr {} + 1)
if test -z $RET; then
    echo 'ERROR: Failed to fetch version, build with `-Dversion` option to skip'
    exit 2
else
    echo $RET
fi
