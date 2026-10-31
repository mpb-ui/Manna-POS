"""Build JVM font resources from the same licensed fonts used by the POS."""
from pathlib import Path
from fontTools.ttLib import TTFont
import shutil
root=Path(__file__).resolve().parents[2]
out=Path(__file__).resolve().parent/'target/generated-resources'
(out/'fonts').mkdir(parents=True,exist_ok=True)
for weight in ['Regular','SemiBold','Bold','Italic']:
    font=TTFont(root/f'public/fonts/ibm-plex-sans/IBMPlexSans-{weight}.woff2')
    font.flavor=None
    font.save(out/f'fonts/IBMPlexSans-{weight}.ttf')
shutil.copyfile(root/'public/fonts/ibm-plex-sans/LICENSE.txt',out/'fonts/LICENSE.txt')
shutil.copyfile(root/'public/manna-receipt-logo.png',out/'manna-logo.png')
