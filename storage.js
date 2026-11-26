// LocalStorage-backed store for starred siteswap patterns.

const STARRED_KEY = 'juggle_suggest_starred_v1';

function readList(storage, key) {
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.length > 0) : [];
  } catch {
    return [];
  }
}

function writeList(storage, key, list) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, JSON.stringify(list));
  } catch {
    // Ignore storage quota or private-mode errors gracefully.
  }
}

export function createPatternStore(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const starred = readList(storage, STARRED_KEY);

  return {
    getStarred() {
      return starred.slice();
    },

    isStarred(pattern) {
      return Boolean(pattern) && starred.includes(pattern);
    },

    toggleStar(pattern) {
      if (!pattern) {
        return { starred: false, list: starred.slice() };
      }
      const idx = starred.indexOf(pattern);
      let isNowStarred;
      if (idx >= 0) {
        starred.splice(idx, 1);
        isNowStarred = false;
      } else {
        starred.unshift(pattern);
        isNowStarred = true;
      }
      writeList(storage, STARRED_KEY, starred);
      return { starred: isNowStarred, list: starred.slice() };
    },

    removeStar(pattern) {
      const idx = starred.indexOf(pattern);
      if (idx >= 0) {
        starred.splice(idx, 1);
        writeList(storage, STARRED_KEY, starred);
      }
      return starred.slice();
    },
  };
}
