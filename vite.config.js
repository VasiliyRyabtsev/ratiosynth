// Build settings: where the built page ends up, and the one page that is prose.
//
// GitHub Pages serves a project repository from a subdirectory —
// vasiliyryabtsev.github.io/ratiosynth/ — not from the root of the host. A page
// built with the default settings asks for /assets/index.js, which on Pages
// resolves to the wrong place and returns nothing. Building against "./" makes
// every reference relative to the page instead, so the same dist/ folder works
// on Pages, on any other host, in a subdirectory, and in a zip that somebody
// unpacks and serves locally.

import { PAGE, renderPage } from "./build/page.js";

/**
 * The page the footer links to, rendered from Markdown at both ends.
 *
 * On request while developing and into dist/ when building, rather than written
 * to a file that is committed: a generated file in the repository is one that
 * can be edited by hand, or left behind when the prose next to it changes, and
 * neither shows up in a diff as anything but text. Rendering costs a millisecond
 * and cannot be stale.
 */
function compositionPage() {
  return {
    name: "composition-page",

    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url.split("?")[0] !== `/${PAGE}`) return next();
        try {
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(renderPage());
        } catch (problem) {
          // The renderer refuses what it does not understand, and while
          // developing that has to arrive as the sentence explaining which line
          // of the prose it was, not as a blank page.
          response.statusCode = 500;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(`${PAGE}: ${problem.message}\n`);
        }
      });
    },

    generateBundle() {
      this.emitFile({ type: "asset", fileName: PAGE, source: renderPage() });
    },
  };
}

export default {
  base: "./",
  plugins: [compositionPage()],
};
