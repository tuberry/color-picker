#!/bin/bash
# SPDX-FileCopyrightText: tuberry
# SPDX-License-Identifier: GPL-3.0-or-later

RET=$(curl -sSf https://extensions.gnome.org/extension/"$EGO"/ | grep data-svm | sed -e 's/.*: //; s/}}"//' # | xargs -I{} expr {} + 1)
echo "${RET:?'ERROR: Failed to fetch version, build with -Dversion option to skip'}"
