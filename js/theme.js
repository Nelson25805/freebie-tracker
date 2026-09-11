// theme.js
//
// Adds a floating light/dark toggle button to every page and keeps the
// choice in localStorage so it's consistent across pages, reloads, and
// open tabs. The FOUC-safe part (setting the attribute before first
// paint) already happened in theme-init.js, loaded earlier in <head> —
// this module only has to build the button and react to clicks.

const THEME_KEY = "fgt_theme"; // "light" | "dark"

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // localStorage unavailable — the toggle still works for this page
    // load, it just won't persist or sync across tabs/reloads.
  }
}

function paintToggleButton(btn) {
  const isLight = currentTheme() === "light";
  btn.textContent = isLight ? "🌙" : "☀️";
  btn.title = isLight ? "Switch to dark theme" : "Switch to light theme";
  btn.setAttribute("aria-pressed", isLight ? "true" : "false");
}

function buildToggleButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "theme-toggle";
  btn.setAttribute("aria-label", "Toggle light/dark theme");
  paintToggleButton(btn);

  btn.addEventListener("click", () => {
    const next = currentTheme() === "light" ? "dark" : "light";
    applyTheme(next);
    paintToggleButton(btn);
  });

  return btn;
}

// Keeps other open tabs/pages in sync when the theme is changed in one of
// them. The `storage` event only fires in OTHER tabs (never the one that
// made the change), which is exactly the behavior wanted here — no need
// to guard against reacting to our own click.
window.addEventListener("storage", (e) => {
  if (e.key !== THEME_KEY) return;
  applyTheme(e.newValue === "light" ? "light" : "dark");
  const btn = document.querySelector(".theme-toggle");
  if (btn) paintToggleButton(btn);
});

document.addEventListener("DOMContentLoaded", () => {
  document.body.appendChild(buildToggleButton());
});
