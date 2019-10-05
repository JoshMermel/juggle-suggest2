# juggle-suggest2
Successor to juggle-suggest 1, now with sync and better multiplex support

Unordered todos
 - Suggestion
   - Handle cases when all suggestions contains a value higher than z i.e
     666666666666666666666666666666666666[67]
   - Have so way for users to select the length they want.
 - UI
   - Improve UI when user input is valid
   - Make suggestion stay visible when user presses ctrl, downarrow, ...
   - Better error messages explaining why a pattern is invalid
 - Animation
   - Make dwell look more better for low throws in a way that works with
     squeezes
   - Horizontally scale when translating coordinate systems.
   - Add a stick figure
   - Write some tests
   - Support styles like Mills
 - Randomization
   - See if there's a way to avoid patterns where one throw is much higher than
     others in a way that makes it boring
   - Pass around and use a seed for randomization that isn't reset on certain
     actions (i.e. multiplex toggle).
   - Simplify how I decide the multiplicity of each throw.
   - Write some tests
 - New features
   - Integrate orbits visualizer like jbuckland.com/juggle-graph
   - Show transition to/from ground state for suggested patern
 - Software Engineering/Misc
   - Read input from URL
   - Refactor what's in each file and get js out of .html files. This might be a
     rewrite in typescript or it might starting to use closure to manage
     dependencies and merge/minify.
   - It'd be cool to cut dependencies like jquery that I'm not using very much.
 
