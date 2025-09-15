.PHONY: package clean

PACKAGE = graderoom-extension.zip

$(PACKAGE):
	zip -r $@ icons/ background.js LICENSE manifest.json offscreen.html offscreen.js

package: $(PACKAGE)

clean:
	DEL $(PACKAGE)