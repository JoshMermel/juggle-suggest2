// LocalStorage-backed store for starred and recent siteswap patterns.

const STARRED_KEY = 'juggle_suggest_starred_v1';
const RECENT_KEY = 'juggle_suggest_recent_v1';
const MAX_RECENT = 8;

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
  let starred = readList(storage, STARRED_KEY);
  let recent = readList(storage, RECENT_KEY);

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

    getRecent() {
      return recent.slice();
    },

    recordRecent(pattern) {
      if (!pattern) {
        return recent.slice();
      }
      recent = [pattern, ...recent.filter(p => p !== pattern)].slice(0, MAX_RECENT);
      writeList(storage, RECENT_KEY, recent);
      return recent.slice();
    },
  };
}
