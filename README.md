# juggle-suggest2
Successor to juggle-suggest 1, now with sync and better multiplex support

Unordered todos
 - Suggestion
   - Handle cases when all suggestions contains a value higher than z i.e 666666666666666666666666666666666666[67]
   - Have so way for users to select the length they want.
 - UI
   - improve ui when user input is valid
   - Better error messages explaining why a pattern is invalid
 - Animation
   - Make dwell look more natural for low throws.
   - Add a stick figure
   - Write some tests
 - Randomization
   - See if there's a way to avoid patterns where one throw is much higher than others in a way that makes it boring
   - Pass around and use a seed for randomization that isn't reset on certain actions (i.e. multiplex toggle).
   - Write some tests
 - New features
   - Integrate orbits visualizer like jbuckland.com/juggle-graph
   - Show transition to/from ground state for suggested patern
 - Software Engineering/Misc
   - Read input from URL
   - Refactor what's in each file and get js out of .html files. This might be a rewrite in typescript or it might starting to use closure to manage dependencies and merge/minify.
   - It'd be cool to cut dependencies like jquery that I'm not using very much.
 
