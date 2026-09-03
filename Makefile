.PHONY: package clean chrome-debug firefox-debug debug

CHROME_PACKAGE = graderoom-chrome-extension
CHROME_DEBUG = graderoom-chrome-debug
FIREFOX_PACKAGE = graderoom-firefox-extension
FIREFOX_DEBUG = graderoom-firefox-debug

$(CHROME_PACKAGE):
	xcopy icons\ $(CHROME_PACKAGE)\ /s
	xcopy chrome\ $(CHROME_PACKAGE) /s
	xcopy scraper.js $(CHROME_PACKAGE)
	xcopy psLogin.js $(CHROME_PACKAGE)

$(CHROME_PACKAGE).zip: $(CHROME_PACKAGE)
	zip -rj $@ $(CHROME_PACKAGE)/* LICENSE

$(FIREFOX_PACKAGE).zip:
	zip -rj $@ icons/ firefox/ scraper.js psLogin.js LICENSE

$(CHROME_DEBUG):
	xcopy icons\ $(CHROME_DEBUG)\ /s
	xcopy chrome\ $(CHROME_DEBUG) /s
	xcopy scraper.js $(CHROME_DEBUG)
	xcopy psLogin.js $(CHROME_DEBUG)
	node debug-manifest.js $(CHROME_DEBUG)\manifest.json

# firefox-package zips straight from the sources, but the debug manifest has to be patched
# first, so this one stages the files the way the chrome builds do
$(FIREFOX_DEBUG):
	xcopy icons\ $(FIREFOX_DEBUG)\ /s
	xcopy firefox\ $(FIREFOX_DEBUG) /s
	xcopy scraper.js $(FIREFOX_DEBUG)
	xcopy psLogin.js $(FIREFOX_DEBUG)
	node debug-manifest.js $(FIREFOX_DEBUG)\manifest.json

$(FIREFOX_DEBUG).zip: $(FIREFOX_DEBUG)
	zip -rj $@ $(FIREFOX_DEBUG)/* LICENSE

chrome-unpacked: $(CHROME_PACKAGE)

chrome-debug: $(CHROME_DEBUG)

firefox-debug: $(FIREFOX_DEBUG).zip

debug: chrome-debug firefox-debug

chrome-package: $(CHROME_PACKAGE).zip

firefox-package: $(FIREFOX_PACKAGE).zip

all: chrome-package firefox-package

clean:
	IF EXIST $(CHROME_PACKAGE) rmdir /s /q $(CHROME_PACKAGE)
	IF EXIST $(CHROME_DEBUG) rmdir /s /q $(CHROME_DEBUG)
	IF EXIST $(FIREFOX_DEBUG) rmdir /s /q $(FIREFOX_DEBUG)
	IF EXIST $(FIREFOX_DEBUG).zip DEL $(FIREFOX_DEBUG).zip
	DEL $(CHROME_PACKAGE).zip
	DEL $(FIREFOX_PACKAGE).zip
