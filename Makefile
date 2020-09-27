# by tuberry and based on dashtodock's makefile
# to increase version number automatically when manually installing

EXTNUM = 3396

UUID = $(shell ls | grep @)
NAME = $(shell cat $(UUID)/metadata.json | grep gettext-domain | sed -e 's/.* "//; s/",//')
PACK = $(shell echo $(NAME) | sed -e 's/^./\U&/g; s/-/ /g; s/ ./\U&/g')
EGOURL = https://extensions.gnome.org/extension/$(EXTNUM)/$(NAME)/

# The command line passed variable LANGUAGE is used to localize pot file.
# If no LANGUAGE passed, $LANG is used.
#
ifndef LANGUAGE
	LANGUAGE = $(shell echo $(LANG) | sed -e 's/\..*//')
endif
MSGPOT = locale/$(NAME).pot
MSGDIR = locale/$(LANGUAGE)/LC_MESSAGES
MSGSRC = $(MSGDIR)/$(NAME).po
MSGAIM = $(MSGDIR)/$(NAME).mo

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
# max verion on E.G.O plus 1 is used. (It could take some time to visit)
#
ifndef VERSION
	VERSION = $(shell curl -s $(EGOURL) 2>&1 | grep data-svm | sed -e 's/.*: //; s/}}"//' | xargs -I{} expr {} + 1)
endif

all: _build

clean:
	-rm -fR _build
	-rm -fR *.zip

$(UUID)/$(MSGSRC):
	cd $(UUID); \
		mkdir -p $(MSGDIR); \
		msginit --no-translator --locale $(LANGUAGE).UTF-8 -i ./$(MSGPOT) -o ./$(MSGSRC)

potfile: # always gen new pot from source
	cd $(UUID); \
		xgettext -k --keyword=_ --from-code=utf-8 --package-name "$(PACK)" --add-comments='Translators:' -o ./$(MSGPOT) *js

pofile: $(UUID)/$(MSGSRC)

mergepo: potfile pofile
	cd $(UUID); \
		msgmerge -U $(MSGSRC) $(MSGPOT)

fmtpo:
	cd $(UUID); \
		msgfmt $(MSGSRC) -o $(MSGAIM)

install: install-local

install-local: _build
	rm -rf $(INSTALLBASE)/$(UUID)
	mkdir -p $(INSTALLBASE)/$(UUID)
	cp -r ./_build/* $(INSTALLBASE)/$(UUID)/
ifeq ($(INSTALLTYPE),system)
	# system-wide settings and locale files
	rm -r $(INSTALLBASE)/$(UUID)/schemas $(INSTALLBASE)/$(UUID)/locale
	mkdir -p $(SHARE_PREFIX)/glib-2.0/schemas $(SHARE_PREFIX)/locale
	cp -r ./_build/schemas/*gschema.* $(SHARE_PREFIX)/glib-2.0/schemas
	cp -r ./_build/locale/* $(SHARE_PREFIX)/locale
endif

zip: _build
	cd _build ; \
		zip -qr "$(NAME)_v$(shell cat _build/metadata.json | grep \"version\" | sed -e 's/[^0-9]*//').zip" .
	mv _build/*.zip ./

_build:
	mkdir -p _build
	cp -r $(UUID)/* _build
	sed -i 's/"version": [[:digit:]]\+/"version": $(VERSION)/' _build/metadata.json;
