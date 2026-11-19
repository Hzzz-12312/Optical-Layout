# Changelog

What changed in each update, newest first.

## 2026-11-19

### Added
- **Zotero plugin:** the exported layout JSON now carries a `provenance` block — Zotero libraryID, attachment key and filename, parent item key/URI, item type, title, DOI, year, publication, creators, tags, plugin version and export time — so a knowledge graph can join each drawing to its paper. Designer ignores the block; build it as `Optical-Sketch-0.3.1.xpi`.
- **Designer:** schematic marker symbols for literature figures (dichroic, grating, prism, objective, polarizer, filters, EOM, isolator, sample, camera, spectrometer).

## 2026-11-18

### Fixed
- **Zotero plugin:** installing the package failed on Zotero 10 because the manifest lacked `applications.zotero.update_url`, which Zotero 10 requires. The manifest now declares it (plus author, homepage and icon), the compatibility range is 7.0-10.*, and `zotero-optical-sketch/build.py` rebuilds `Optical-Sketch-0.1.2.xpi`.
- **Zotero plugin:** the section stayed invisible when the selected entry was the parent journal article instead of the PDF attachment, and the sidebar button drew its label vertically over the icon. The pane now resolves the PDF through the open reader, the selected attachment and the parent entry's PDFs, and the Fluent strings only set `.label` / `.tooltiptext`, as Zotero's own sections do.

## 2026-11-06

### Fixed
- **macOS:** the 3D tab showed a black view. The app now asks for the OpenGL version that the 3D view needs (3.2 Core) before it opens its window, instead of when the 3D tab is first opened, which macOS needs. Windows looks and works the same as before. Thanks to the macOS user who found the problem and its cause.

## 2026-11-01

First public version:
- **Schematic and Layout tabs:** linked, with automatic aiming, overlap checks and a bill of materials.
- **3D view:** with the real mount shapes.
- **Power logger:** with a lab sheet for OneNote and Excel.
- **Web pages:** viewing layouts and logging power from any device on the local network.
- **Board types:** 1" grid, Olego, PyOpticL, LightFlow and pre-drilled.
- **Claude Code skills:** `photo-to-layout` and `plan-board-layout`.
