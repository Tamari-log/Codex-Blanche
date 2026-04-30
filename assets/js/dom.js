(function initDomRegistry(global) {
  function camelize(id = '') {
    return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function createDomRegistry(ids = []) {
    const refs = {};
    ids.forEach((id) => {
      refs[camelize(id)] = document.getElementById(id);
    });
    return refs;
  }

  global.appDom = {
    createDomRegistry,
  };
})(globalThis);
