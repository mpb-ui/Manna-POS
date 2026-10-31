# Manna Print Helper 1.0.0

On-demand Windows 11 x64 protocol handler for Manna POS. Bundles Java 17,
JasperReports 7.0.8, JasperViewer, IBM Plex Sans and the supplied Manna logo.
No always-on service, local HTTP listener, database login or browser cookie.

## User installation

Download `MannaPrintHelper-Windows-x64.zip` from GitHub release
`print-helper-v1.0.0`, extract all files, and double-click `Install.cmd`.
Installation is per Windows user under `%LOCALAPPDATA%\MannaPrintHelper\app`.
It registers `mannaprint://` under HKCU; administrator rights are not needed.
The package is unsigned; verify its SHA256 against the release checksum.

POS buttons issue a short-lived, one-use print capability. The native application
redeems it over HTTPS to the fixed Manna POS origin, renders a single JasperPrint
page at 80 mm with about 72 mm content width, saves a temporary `.jrprint`, then
opens JasperViewer. Clicking the native Print button opens the Windows printer
dialog. No physical print is sent just by opening the preview.

The document model is an explicit server projection, with financial fields
omitted for Work Order. Payment proofs use transaction-time snapshots and all
invoice items. `public/thermal-documents.js` shares item specifications with the
existing browser fallback. Native text is literal text, never report expressions,
HTML, arbitrary external resource URLs or deserialized user-supplied objects.

Page height is measured with bundled font metrics, after wrapping product names,
quantities, descriptions, notes, totals and footer. The maximum supported single
page is 14,000 points; excessive input produces an error instead of clipping.
Physical roll length/cutter behavior still depends on the installed driver.

## Build and verification

Requires Python 3.12, `fonttools[woff]==4.61.1`, Maven 3.9+ and JDK 17.

```
python desktop/print-helper/build-resources.py
mvn -B -f desktop/print-helper/pom.xml verify
```

`build-resources.py` converts the existing OFL-licensed WOFF2 fonts to JVM TTF
resources without changing font outlines. Compiled binaries and generated font
resources remain under ignored `target/`.

Headless rendering smoke test:

```
java -Djava.awt.headless=true -jar desktop/print-helper/target/manna-print-helper.jar --render-test document.json output-prefix
```

On Windows, the GitHub workflow builds a `jpackage --type app-image`, includes
its Java runtime, tests per-user protocol installation and opens a native
JasperViewer using `--self-test output-folder`. Dummy self-test PDF, JRPRINT and
screenshot are retained as CI artifacts. A tagged release includes the ZIP and
SHA256 checksum; changing the software requires a new version/tag.

`--self-test` and `--render-test` are developer command-line modes. Incoming
protocol invocations accept exactly one fixed-scheme URI containing a 43-character
opaque token; they cannot choose a server, file path, command or executable.

## Temporary files and errors

Temporary JRPRINT files are in `%LOCALAPPDATA%\MannaPrintHelper\documents`.
Files older than 24 hours are pruned on later invocations. Save permanent copies
elsewhere using JasperViewer. Closing a preview exits that on-demand process.
Job acknowledgements mean the viewer opened, not that paper was printed.
Server restarts discard pending jobs; clicking print again creates a new job.

## Third-party components

- JasperReports: https://github.com/Jaspersoft/jasperreports — license notices
  remain in its unmodified dependency JARs.
- Eclipse Temurin/OpenJDK: bundled runtime includes its license/legal files.
- IBM Plex Sans 1.1.0: OFL license is included with the generated font resources.
- Other Java dependencies: license notices remain inside their JARs.
