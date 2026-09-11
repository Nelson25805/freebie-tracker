// theme-init.js
//
// Sets data-theme on <html> BEFORE styles.css is applied, so the page
// never flashes dark-then-light (or vice versa) on load.
//
// Deliberately tiny, and deliberately loaded as a normal blocking script
// (no `defer`, no `type="module"`), placed BEFORE the stylesheet <link>
// in <head>. That ordering is what makes this work: the browser executes
// this script (setting the attribute) before it starts applying
// styles.css, so styles.css's `:root[data-theme="light"]` rules are
// already correct on the very first frame painted.
//
// See ./theme.js for the toggle button itself and its click handling —
// that part can safely run later (it's loaded with `defer`).
(function () {
  try {
    var stored = localStorage.getItem("fgt_theme");
    var theme =
      stored ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark");
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch (e) {
    // localStorage/matchMedia unavailable (privacy mode, old browser,
    // etc.) — just fall back to the default (dark) theme already baked
    // into styles.css. Nothing to recover from here.
  }
})();
