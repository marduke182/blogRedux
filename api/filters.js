// # Filters
// Filters are not yet properly used, this system is intended to allow Apps to extend Ghost in various ways.
import pipeline from './utils/pipeline';
import _ from 'lodash'; // eslint-disable-line


// ## Default values
/**
 * A hash of default values to use instead of 'magic' numbers/strings.
 * @type {Object}
 */
const defaults = {
  filterPriority: 5,
  maxPriority: 9
};

export class Filters {
  constructor() {
    // Holds the filters
    this.filterCallbacks = [];

    // Holds the filter hooks (that are built in to Ghost Core)
    this.filters = [];
  }

  // Register a new filter callback function
  registerFilter(name, priorityArg, fnArg) {
    let priority = priorityArg;
    let fn = fnArg;
    // Carry the priority optional parameter to a default of 5
    if (_.isFunction(priority)) {
      fn = priority; //
      priority = null;
    }

    // Null priority should be set to default
    if (priority === null) {
      priority = defaults.filterPriority;
    }

    this.filterCallbacks[name] = this.filterCallbacks[name] || {};
    this.filterCallbacks[name][priority] = this.filterCallbacks[name][priority] || [];

    this.filterCallbacks[name][priority].push(fn);
  }

// Unregister a filter callback function
  deregisterFilter(name, priorityArg, fnArg) {
    let priority = priorityArg;
    let fn = fnArg;
    // Curry the priority optional parameter to a default of 5
    if (_.isFunction(priority)) {
      fn = priority;
      priority = defaults.filterPriority;
    }

    // Check if it even exists
    if (this.filterCallbacks[name] && this.filterCallbacks[name][priority]) {
      // Remove the function from the list of filter funcs
      this.filterCallbacks[name][priority] = _.without(this.filterCallbacks[name][priority], fn);
    }
  }

// Execute filter functions in priority order
  doFilter(name, args, context) {
    const callbacks = this.filterCallbacks[name];
    const priorityCallbacks = [];

    // Bug out early if no callbacks by that name
    if (!callbacks) {
      return Promise.resolve(args);
    }

    // For each priorityLevel
    _.times(defaults.maxPriority + 1, (priority) => {
      // Add a function that runs its priority level callbacks in a pipeline
      priorityCallbacks.push((currentArgs) => {
        let callables;

        // Bug out if no handlers on this priority
        if (!_.isArray(callbacks[priority])) {
          return Promise.resolve(currentArgs);
        }

        callables = _.map(callbacks[priority], (callback) => {
          return (argsInt) => callback(argsInt, context);
        });
        // Call each handler for this priority level, allowing for promises or values
        return pipeline(callables, currentArgs);
      });
    });

    return pipeline(priorityCallbacks, args);
  }
}

export default new Filters();
