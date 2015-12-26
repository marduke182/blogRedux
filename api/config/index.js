// # Config
// General entry point for all configuration data
import chalk from 'chalk';
import _ from 'lodash';
import knex from 'knex';

import errors from '../errors';
import defaultConfig from './config';

let knexInstance;

class ConfigManager {
  constructor(config) {
    this._config = {};

    // If we're given an initial config object then we can set it.
    if (config && _.isObject(config)) {
      this.set(config);
    }
  }

  init(rawConfig) {
    this.set(rawConfig);
    return Promise.resolve(this._config);
  }

  /**
   * Allows you to set the config object.
   * @param {Object} config Only accepts an object at the moment.
   */
  set(config) {
    // Merge passed in config object onto our existing config object.
    // We're using merge here as it doesn't assign `undefined` properties
    // onto our cached config object.  This allows us to only update our
    // local copy with properties that have been explicitly set.
    _.merge(this._config, config);

    if (!knexInstance && this._config.database && this._config.database.client) {
      knexInstance = knex(this._config.database);
    }

    _.merge(this._config, {
      database: {
        knex: knexInstance
      },
      slugs: {
        // Used by generateSlug to generate slugs for posts, tags, users, ..
        // reserved slugs are reserved but can be extended/removed by apps
        // protected slugs cannot be changed or removed
        reserved: ['admin', 'app', 'apps', 'archive', 'archives', 'categories', 'category', 'dashboard', 'feed', 'ghost-admin', 'login', 'logout', 'page', 'pages', 'post', 'posts', 'public', 'register', 'setup', 'signin', 'signout', 'signup', 'user', 'users', 'wp-admin', 'wp-login'],
        protected: ['ghost', 'rss']
      },
      uploads: {
        // Used by the upload API to limit uploads to images
        extensions: ['.jpg', '.jpeg', '.gif', '.png', '.svg', '.svgz'],
        contentTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml']
      },
      deprecatedItems: []
    });

    _.extend(this, this._config);

  }

  /**
   * Allows you to read the config object.
   * @return {Object} The config object.
   */
  get() {
    return this._config;
  }

  /**
   * Helper method for checking the state of a particular privacy flag
   * @param {String} privacyFlag The flag to check
   * @returns {boolean}
   */
  isPrivacyDisabled(privacyFlag) {
    if (!this.privacy) {
      return false;
    }

    if (this.privacy.useTinfoil === true) {
      return true;
    }

    return this.privacy[privacyFlag] === false;
  }

  /**
   * Check if any of the currently set config items are deprecated, and issues a warning.
   */
  checkDeprecated() {
    _.each(this.deprecatedItems, (property) => {
      this.displayDeprecated(this._config, property.split('.'), []);
    });
  }

  displayDeprecated(item, properties, address) {
    const property = properties.shift();
    let errorText;
    let explanationText;
    let helpText;

    address.push(property);

    if (item.hasOwnProperty(property)) {
      if (properties.length) {
        return this.displayDeprecated(item[property], properties, address);
      }
      errorText = 'The configuration property [' + chalk.bold(address.join('.')) + '] has been deprecated.';
      explanationText = 'This will be removed in a future version, please update your config.js file.';
      helpText = 'Please check http://support.ghost.org/config for the most up-to-date example.';
      errors.logWarn(errorText, explanationText, helpText);
    }
  }

}


export default new ConfigManager(defaultConfig);
