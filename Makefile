.PHONY: package clean

CHROME_PACKAGE = graderoom-chrome-extension
FIREFOX_PACKAGE = graderoom-firefox-extension

$(CHROME_PACKAGE):
	xcopy icons\ $(CHROME_PACKAGE)\ /s
	xcopy chrome\ $(CHROME_PACKAGE) /s

$(CHROME_PACKAGE).zip: $(CHROME_PACKAGE)
	zip -rj $@ $(CHROME_PACKAGE)/* LICENSE

$(FIREFOX_PACKAGE).zip:
	zip -rj $@ icons/ firefox/ scraper.js LICENSE

chrome-unpacked: $(CHROME_PACKAGE)

chrome-package: $(CHROME_PACKAGE).zip

firefox-package: $(FIREFOX_PACKAGE).zip

all: chrome-package firefox-package

clean:
	IF EXIST $(CHROME_PACKAGE) rmdir /s /q $(CHROME_PACKAGE)
	DEL $(CHROME_PACKAGE).zip
	DEL $(FIREFOX_PACKAGE).zip
