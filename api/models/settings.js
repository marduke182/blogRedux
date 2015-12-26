import ghostBookshelf from './base';
import uuid from 'node-uuid';
import _ from 'lodash'; // eslint-disable-line
import errors from '../errors';
import validation from '../data/validation';

const internal = {context: {internal: true}};
let defaultSettings;

// For neatness, the defaults file is split into categories.
// It's much easier for us to work with it as a single level
// instead of iterating those categories every time
function parseDefaultSettings() {
  const defaultSettingsInCategories = require('../data/default-settings.json'); // check if i can import this before
  const defaultSettingsFlattened = {};

  _.each(defaultSettingsInCategories, (settings, categoryName) => {
    _.each(settings, (setting, settingName) => {
      setting.type = categoryName;
      setting.key = settingName;

      defaultSettingsFlattened[settingName] = setting;
    });
  });

  return defaultSettingsFlattened;
}

function getDefaultSettings() {
  if (!defaultSettings) {
    defaultSettings = parseDefaultSettings();
  }

  return defaultSettings;
}

// Each setting is saved as a separate row in the database,
// but the overlying API treats them as a single key:value mapping
export const Settings = ghostBookshelf.Model.extend({

  tableName: 'settings',

  defaults() {
    return {
      uuid: uuid.v4(),
      type: 'core'
    };
  },

  emitChange(event) {
    console.log('settings' + '.' + event, this);
  },

  initialize() {
    ghostBookshelf.Model.prototype.initialize.apply(this, arguments);

    this.on('created', (model) => {
      model.emitChange('added');
      model.emitChange(model.attributes.key + '.' + 'added');
    });
    this.on('updated', (model) => {
      model.emitChange('edited');
      model.emitChange(model.attributes.key + '.' + 'edited');
    });
    this.on('destroyed', (model) => {
      model.emitChange('deleted');
      model.emitChange(model.attributes.key + '.' + 'deleted');
    });
  },

  validate() {
    const setting = this.toJSON();

    return validation.validateSchema(self.tableName, setting).then(function then() {
      return validation.validateSettings(getDefaultSettings(), self);
    }).then(() => {
      const themeName = setting.value || '';

      if (setting.key !== 'activeTheme') {
        return;
      }

      return validation.validateActiveTheme(themeName); // eslint-disable-line
    });
  },

  saving() {
    // disabling sanitization until we can implement a better version
    // All blog setting keys that need their values to be escaped.
    // if (this.get('type') === 'blog' && _.contains(['title', 'description', 'email'], this.get('key'))) {
    //    this.set('value', this.sanitize('value'));
    // }

    return ghostBookshelf.Model.prototype.saving.apply(this, arguments);
  }

}, {
  findOne(options) {
    // Allow for just passing the key instead of attributes
    if (!_.isObject(options)) {
      options = {key: options}; // eslint-disable-line
    }
    return Promise.resolve(ghostBookshelf.Model.findOne.call(this, options));
  },

  edit(data, optionsArg) {
    const options = this.filterOptions(optionsArg, 'edit');

    if (!Array.isArray(data)) {
      data = [data]; // eslint-disable-line
    }
    const promises = data.map((item) => {
      // Accept an array of models as input
      if (item.toJSON) {
        item = item.toJSON(); // eslint-disable-line
      }
      if (!(_.isString(item.key) && item.key.length > 0)) {
        return Promise.reject(new errors.ValidationError('Value in [settings.key] cannot be blank.'));
      }

      item = self.filterData(item); // eslint-disable-line

      return Settings.forge({key: item.key}).fetch(options).then(function then(setting) {
        const saveData = {};

        if (setting) {
          if (item.hasOwnProperty('value')) {
            saveData.value = item.value;
          }
          // Internal context can overwrite type (for fixture migrations)
          if (options.context.internal && item.hasOwnProperty('type')) {
            saveData.type = item.type;
          }
          return setting.save(saveData, options);
        }

        return Promise.reject(new errors.NotFoundError('Unable to find setting to update: ' + item.key));
      }, errors.logAndThrowError);
    });

    return Promise.all(promises);
  },

  populateDefault(key) {
    if (!getDefaultSettings()[key]) {
      return Promise.reject(new errors.NotFoundError('Unable to find default setting: ' + key));
    }

    return this.findOne({key: key}).then(function then(foundSetting) {
      if (foundSetting) {
        return foundSetting;
      }

      const defaultSetting = _.clone(getDefaultSettings()[key]);
      defaultSetting.value = defaultSetting.defaultValue;

      return Settings.forge(defaultSetting).save(null, internal);
    });
  },

  populateDefaults() {
    return this.findAll()
      .then((allSettings) => {
        const usedKeys = allSettings.models.map((setting) => setting.get('key'));
        const insertOperations = [];

        _.each(getDefaultSettings(), (defaultSetting, defaultSettingKey) => {
          let isMissingFromDB = usedKeys.indexOf(defaultSettingKey) === -1;
          // Temporary code to deal with old databases with currentVersion settings
          if (defaultSettingKey === 'databaseVersion' && usedKeys.indexOf('currentVersion') !== -1) {
            isMissingFromDB = false;
          }
          if (isMissingFromDB) {
            defaultSetting.value = defaultSetting.defaultValue;
            insertOperations.push(Settings.forge(defaultSetting).save(null, internal));
          }
        });

        return Promise.all(insertOperations);
      });
  }

});

