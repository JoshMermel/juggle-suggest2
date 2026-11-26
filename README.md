# juggle-suggest2

Juggle-suggest 2 is a suite of tools for interacting with siteswaps. You can
play with it at https://joshmermelstein.com/juggle-suggest2. It has zero
external dependencies and no build step—once you've loaded the page, no further
internet connection is required, so feel free to save it to your phone and use
it offline.

## Input Box

The input box is how you can enter siteswaps you want to visualize. It supports
both async and sync but not mixed sync/async.

### Suggestions

As you type, the input box autocompletes possible suffixes for your input. These
suffixes are random but will always be as short as possible (counting number of
added throws, not number of characters). Press `Tab`, `Enter`, or `Right Arrow`
at the end of the input to accept the suggestion.

Before you've entered anything, this box will show a randomly chosen siteswap.

### Suggest Modes

A toggle lets you pick whether you want multiplex suggestions or not.

In vanilla mode, the suggest box will not suggest multiplexes. However, if your
input ends in an unmatched `[` in vanilla mode, the suggest box will make
sure that throw is a multiplex of at least two balls, then will suggest vanilla
throws after that.

In multiplex mode, anything goes. The suggest box will use multiplexes wherever
possible to make the pattern as short as possible.

Note that this mode selector is also used when generating random siteswaps to
show when the input box is empty.

### Randomize button

The randomize button randomizes the suffix. If the suffix is 0 or 1 throws long,
then there's nothing to change so it does nothing. If the suffix is longer than
that it swaps sites to produce a different valid suffix with the same length.

When the input box is empty, it generates a new random siteswap. This is a nice
way to generate unusual siteswaps quickly.

## Animator

The animator animates the pattern. If the pattern has very high throws, it
adjusts gravity to make sure everything fits in the canvas element.

There is also a speed slider for making the animator run faster or slower.

## Orbits Visualization

Eventually I'll have this once I convince James to explain how to integrate it
or write my own.

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

## TODOs for V2

- UI
  - Add screenshots to readme
- New features
  - Integrate orbits visualizer like https://jbuckland.com/juggle-graph

## TODOs for the nebulous future

- Suggestion
  - Have some way for users to select the length they want.
- UI
  - Improve UI when user input is valid
  - Better error messages explaining why a pattern is invalid
- Animation
  - Add a stick figure
  - Support styles like Mills
- New features
  - Show transition to/from ground state for suggested pattern
