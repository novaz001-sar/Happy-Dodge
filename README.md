# Happy Dodge

Happy Dodge is a browser-based Three.js dodge-and-shoot game with a built-in level editor.

## Local Preview

Serve the repository root with any static HTTP server. For example:

```powershell
python -m http.server 5173
```

Then open <http://127.0.0.1:5173/>.

## Project Structure

- `index.html` - page shell and import map
- `src/styles.css` - UI styling
- `src/main.js` - game runtime, rendering, editor, and input wiring
- `src/i18n.js` - English UI text
- `src/levels.js` - built-in level definitions
- `.github/workflows/deploy-pages.yml` - GitHub Pages deployment workflow

## Deployment

Every push to `main` runs the GitHub Pages workflow and publishes the static site.
