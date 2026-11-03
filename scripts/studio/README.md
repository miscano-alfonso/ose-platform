# Sketch Studio source

The page served at /studio (src/lib/studio-page.ts) is built from these files. Edit them, then run `python3 scripts/studio/build.py`.

- `page.tpl.html`: the page (layout, controls, gallery, drawing and checking flow)
- `chalk.js`: the renderer that turns Claude's shapes into the chalk style (palettes, highlights, grain)
- `guide.txt`: the drawing instructions Claude follows
- `examples.js`: the two example drawings
- `site-shim.js`: how the page talks to /admin/studio-api on this site

The script also writes `sketch-studio-artifact.html`, the version for the Claude artifact. It is ignored by git.
