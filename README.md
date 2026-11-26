# juggle-suggest2

Juggle-suggest 2 is a suite of tools for interacting with siteswaps. You can
play with it at https://joshmermelstein.com/juggle-suggest2. It has zero
external dependencies, no build step, and includes a web app manifest + service
worker so you can install it to your home screen and use it fully offline.

## Features

### Input Box & Suggestions

Enter async or sync siteswap prefixes (vanilla or multiplex). As you type, the
input box autocompletes a valid suffix—starting from the shortest possible
suffix (by number of added throws). Press `Tab`, `Enter`, or `Right Arrow` at
the end of the input to accept the suggestion.

- **Vanilla vs. Multiplex**: In vanilla mode, suggestions avoid adding new
  multiplexes (while honoring an open `[` you typed). In multiplex mode,
  multiplexes are used freely to keep suffixes short.
- **Suffix Length Stepper (`-` / `+`)**: Step beyond the shortest suffix to
  explore longer valid completions for your prefix.
- **Randomize**: Re-shuffles the suffix (or generates a brand-new random
  siteswap via the juggling-cards model when the input is empty).
- **Copy & Star**: Copy the completed pattern to your clipboard or star it to
  save in `localStorage`.

### Animator

Animates the completed pattern on an HTML5 Canvas with a toggleable 3D-IK
juggler, automatic gravity scaling for tall throws, orbit or random ball
coloring, and a speed slider.

### Orbits Visualizer

Renders an interactive SVG throw-arc diagram inspired by James Buckland's
[juggling-graph](https://jbuckland.com/juggling-graph/), with multiplex bracket
grouping, forward arcs above, wrap-around arcs below, per-orbit coloring synced
with the animator, and hover-to-highlight on any arc.

## Local Development & Tests

The app uses native ES modules with zero build step and zero runtime dependencies.

- **Run locally**: serve the repo with any static HTTP server (ES modules require HTTP rather than `file://`), e.g.:
  ```sh
  python3 -m http.server 8000
  ```
- **Run tests** (requires Node 18+):
  ```sh
  npm test
  ```

## Future Ideas

- Add screenshots to README
- Show transitions to/from ground state for excited patterns
- Support styles like Mills Mess
- Research JugglingLab extended notation (`!`, `*`) for sync/async transitions
