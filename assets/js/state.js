(function initAppState(global) {
  const SAFE_NOOP = () => {};

  function createStore(initialState) {
    let state = structuredClone(initialState);
    const listeners = new Set();

    const notify = () => listeners.forEach((listener) => listener(state));

    return {
      getState() {
        return state;
      },
      update(producer) {
        const draft = structuredClone(state);
        producer(draft);
        state = draft;
        notify();
        return state;
      },
      replace(nextState) {
        state = structuredClone(nextState);
        notify();
      },
      subscribe(listener = SAFE_NOOP) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  global.appState = {
    createStore,
  };
})(globalThis);
