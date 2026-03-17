function createTaskQueue() {
  const scopes = new Map();

  function enqueue(scope, task) {
    const previous = scopes.get(scope) || Promise.resolve();
    const current = previous.catch(() => {}).then(task);

    scopes.set(
      scope,
      current.finally(() => {
        if (scopes.get(scope) === current) {
          scopes.delete(scope);
        }
      })
    );

    return current;
  }

  return {
    enqueue,
  };
}

module.exports = {
  createTaskQueue,
};
