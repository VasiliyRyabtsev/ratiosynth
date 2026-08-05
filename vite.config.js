// Build settings. There is only one, and it exists because of where the built
// page ends up.
//
// GitHub Pages serves a project repository from a subdirectory —
// vasiliyryabtsev.github.io/ratiosynth/ — not from the root of the host. A page
// built with the default settings asks for /assets/index.js, which on Pages
// resolves to the wrong place and returns nothing. Building against "./" makes
// every reference relative to the page instead, so the same dist/ folder works
// on Pages, on any other host, in a subdirectory, and in a zip that somebody
// unpacks and serves locally.
export default {
  base: "./",
};
