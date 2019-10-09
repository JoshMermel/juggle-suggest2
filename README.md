# juggle-suggest2

Juggle-suggest 2 is a suite of tools for interacting with siteswaps. You can
play with it at http://joshmermelstein.com/juggle-suggest2. Once you've loaded
the page, no further internet connection is request, so feel free to download to
your phone and use it offline.

## Input Box

The input box is how you can enter siteswaps you want to visualize. It supports
both async and sync but not mixed sync/async.

### Suggestsions

As you type the input box autocompletes possible suffixes for your input. These
suffixes are random but will always be as short as possible (counting number of
added throws, not number of chracters).

Before you've entered anything, this box will show a randomly chosen siteswap.

### Suggest Modes

A radio button lets you pick if they want multiplex suggestions or not.

In vanilla mode, the suggest box will not suggest multiplexes. However, if your
input ends in an unmatched [ in vanilla mode, the suggestbox will make
sure that throw is a multiplex of at least two balls, then will suggest vanilla
throws after that.

In multiplex mode, anything goes. The suggestbox will use multiplexes wherever
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

The animator animates the pattern. If the pattern has an very high throws, it
adjusts gravity to make sure everything fits in the canvas element.

There is also a speed slider for making the animator run faster or slower.

## Orbits Visualization

Eventually I'll have this once I convince James to explain how to integrate it
or write my own.

## TODOs for V2

 - UI
   - Add screenshots to readme
 - Randomization
   - Simplify how I decide the multiplicity of each throw
 - New features
   - Integrate orbits visualizer like jbuckland.com/juggle-graph
 
## TODOs for the nebulous future

 - Suggestion
   - Handle cases when all suggestions contains a value higher than z i.e
     666666666666666666666666666666666666[67]
   - Have so way for users to select the length they want.
 - UI
   - Improve UI when user input is valid
   - Better error messages explaining why a pattern is invalid
 - Animation
   - Add a stick figure
   - Write some tests
   - Support styles like Mills
 - Randomization
   - Write some tests
 - New features
   - Show transition to/from ground state for suggested pattern
 - Software Engineering/Misc
   - Refactor what's in each file and get js out of .html files. This might be a
     rewrite in typescript or it might starting to use closure to manage
     dependencies and merge/minify
   - It'd be cool to cut dependencies like jquery that I'm not using very much
