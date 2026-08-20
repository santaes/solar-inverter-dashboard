    function savedSelections(name) {
      try {
        return new Set(JSON.parse(window.localStorage.getItem(name) || '[]'));
      } catch {
        return new Set();
      }
    }
    function saveSelections(name, selections) {
      try {
        window.localStorage.setItem(name, JSON.stringify([...selections]));
      } catch {
        // The dashboard still works when browser storage is unavailable.
      }
    }
    function savedMap(name) {
      try {
        const value = JSON.parse(window.localStorage.getItem(name) || '{}');
        return new Map(Object.entries(value && typeof value === 'object' ? value : {}));
      } catch {
        return new Map();
      }
    }
    function saveMap(name, values) {
      try {
        window.localStorage.setItem(name, JSON.stringify(Object.fromEntries(values)));
      } catch {
        // Appearance settings remain stable until the page is closed.
      }
    }

