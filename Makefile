# by tuberry and based on dashtodock's makefile
# to increase version number automatically when manually installing

EXTNUM = 3396

UUID = $(shell ls | grep @)
NAME = $(shell cat $(UUID)/metadata.json | grep gettext-domain | sed -e 's/.* "//; s/",//')
PACK = $(shell echo $(NAME) | sed -e 's/^./\U&/g; s/-/ /g; s/ ./\U&/g')
EGOURL = https://extensions.gnome.org/extension/$(EXTNUM)/$(NAME)/
MSGPOS = $(wildcard $(UUID)/locale/*/LC_MESSAGES/*.po)

BUILD = _build

# for translators: `make mergepo` or `make LANG=YOUR_LANG mergepo`
# The envvar LANG is used to localize pot file.
#
LANGUAGE = $(shell echo $(LANG) | sed -e 's/\..*//')
MSGDIR = $(UUID)/locale/$(LANGUAGE)/LC_MESSAGES
MSGPOT = $(UUID)/locale/$(NAME).pot
MSGAIM = $(MSGDIR)/$(NAME).po

ifeq ($(strip $(DESTDIR)),)
	INSTALLTYPE = local
	INSTALLBASE = $(HOME)/.local/share/gnome-shell/extensions
else
	INSTALLTYPE = system
	SHARE_PREFIX = $(DESTDIR)/usr/share
	INSTALLBASE = $(SHARE_PREFIX)/gnome-shell/extensions
endif

# The command line passed variable VERSION is used to set the version string
# in the metadata and in the generated zip-file. If no VERSION is passed, the
# max version on E.G.O plus 1 is used. (It could take some time to visit)
#
ifndef VERSION
	VERSION = $(shell curl -s $(EGOURL) 2>&1 | grep data-svm | sed -e 's/.*: //; s/}}"//' | xargs -I{} expr {} + 1)
endif

all: $(BUILD)

clean:
	-rm -fR $(BUILD)
	-rm -fR *.zip

%.mo: %.po
	msgfmt $< -o $@

$(BUILD): $(MSGPOS:.po=.mo)
	mkdir -p $(BUILD)
	cp -rf $(UUID)/* $(BUILD)
	-rm -fR $(BUILD)/locale/*/LC_MESSAGES/*po
	-rm -fR $(UUID)/locale/*/LC_MESSAGES/*mo
	glib-compile-schemas $(BUILD)/schemas/
	-rm -fR $(BUILD)/schemas/*xml
	sed -i 's/"version": [[:digit:]]\+/"version": $(VERSION)/' $(BUILD)/metadata.json;

pack: $(BUILD)
	cd $(BUILD); \
		zip -qr "$(NAME)_v$(shell cat $(BUILD)/metadata.json | grep \"version\" | sed -e 's/[^0-9]*//').zip" .
	mv $(BUILD)/*.zip ./

install: $(BUILD)
	rm -fR $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r $(BUILD)/* $(INSTALLBASE)/$(UUID)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings and locale files
	rm -r $(INSTALLBASE)/$(UUID)/schemas $(INSTALLBASE)/$(UUID)/locale
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas $(SHARE_PREFIX)/locale
	cp -r $(UUID)/schemas/*gschema.xml $(SHARE_PREFIX)/glib-2.0/schemas
	cd $(BUILD)/locale; \
		cp --parents */LC_MESSAGES/*.mo $(SHARE_PREFIX)/locale
endif

$(MSGAIM):
	mkdir -p $(MSGDIR); \
		msginit --no-translator --locale $(LANGUAGE).UTF-8 -i $(MSGPOT) -o $(MSGAIM)

$(MSGPOT):
	cd $(UUID); \
		xgettext -k --keyword=_ --from-code=utf-8 --package-name="$(PACK)" --package-version=$(VERSION) --add-comments='Translators:' --output locale/$(NAME).pot *js

mergepo: $(MSGPOT) $(MSGAIM)
	msgmerge -U $(MSGAIM) $(MSGPOT)
	-rm -fR $(MSGPOT)
	-rm -fR $(MSGDIR)/*po~
