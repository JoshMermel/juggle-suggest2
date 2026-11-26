// Shared math and array helpers.

// Mod that always returns a non-negative result for positive m.
export function mod(n, m) {
  return ((n % m) + m) % m;
}

// Returns the sum of an array of numbers.
export function arraysum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

// Non-mutating Fisher-Yates shuffle returning a new array.
export function shuffled(array) {
  const copy = array.slice();
  for (let m = copy.length - 1; m > 0; m--) {
    const i = Math.floor(Math.random() * (m + 1));
    const t = copy[m];
    copy[m] = copy[i];
    copy[i] = t;
  }
  return copy;
}
