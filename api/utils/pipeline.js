/**
 * # Pipeline Utility
 *
 * Based on pipeline.js from when.js:
 * https://github.com/cujojs/when/blob/3.7.4/pipeline.js
 */

function pipeline(tasks, ...args) {
  let runTask = (task, args) => { // eslint-disable-line
    // Self-optimizing function to run first task with multiple
    // args using apply, but subsequent tasks via direct invocation
    runTask = (task, arg) => { // eslint-disable-line
      return task(arg);
    };

    return task.apply(null, args);
  };
  return Promise
    .all(args)
    .then((argsResolve) => Promise.all(tasks.reduce((arg, task) => runTask(task, arg), argsResolve)));

}

module.exports = pipeline;
