import _ from 'lodash'; // eslint-disable-line
import validation from '../validation';
import errors from '../../errors';
import uuid from 'node-uuid';
import importer from './data-importer';
import { tables } from '../schema';

const cleanError = (error) => {
  let temp;
  let message;
  let offendingProperty;
  let value;

  if (error.raw.message.toLowerCase().indexOf('unique') !== -1) {
    // This is a unique constraint failure
    if (error.raw.message.indexOf('ER_DUP_ENTRY') !== -1) {
      temp = error.raw.message.split('\'');
      if (temp.length === 5) {
        value = temp[1];
        temp = temp[3].split('_');
        offendingProperty = temp.length === 3 ? temp[0] + '.' + temp[1] : error.model;
      }
    } else if (error.raw.message.indexOf('SQLITE_CONSTRAINT') !== -1) {
      temp = error.raw.message.split('failed: ');
      offendingProperty = temp.length === 2 ? temp[1] : error.model;
      temp = offendingProperty.split('.');
      value = temp.length === 2 ? error.data[temp[1]] : 'unknown';
    } else if (error.raw.detail) {
      value = error.raw.detail;
      offendingProperty = error.model;
    }
    message = 'Duplicate entry found. Multiple values of "' + value + '" found for ' + offendingProperty + '.';
  }

  offendingProperty = offendingProperty || error.model;
  value = value || 'unknown';
  message = message || error.raw.message;

  return new errors.DataImportError(message, offendingProperty, value);
};

const handleErrors = (errorList) => {
  let processedErrors = [];

  if (!_.isArray(errorList)) {
    return Promise.reject(errorList);
  }

  _.each(errorList, (error) => {
    if (!error.raw) {
      // These are validation errors
      processedErrors.push(error);
    } else if (_.isArray(error.raw)) {
      processedErrors = processedErrors.concat(error.raw);
    } else {
      processedErrors.push(cleanError(error));
    }
  });

  return Promise.reject(processedErrors);
};

const checkDuplicateAttributes = (data, comparedValue, attribs) => {
  // Check if any objects in data have the same attribute values
  return _.find(data, (datum) => {
    return _.all(attribs, (attrib) => {
      return datum[attrib] === comparedValue[attrib];
    });
  });
};

const sanitize = (data) => {
  const allProblems = {};
  const tableNames = _.sortBy(_.keys(data.data), (tableName) => {
    // We want to guarantee posts and tags go first
    if (tableName === 'posts') {
      return 1;
    } else if (tableName === 'tags') {
      return 2;
    }

    return 3;
  });

  _.each(tableNames, (tableName) => {
    // Sanitize the table data for duplicates and valid uuid and created_at values
    const sanitizedTableData = _.transform(data.data[tableName], (memo, importValues) => {
      const uuidMissing = (!importValues.uuid && tables[tableName].uuid) ? true : false;
      const uuidMalformed = (importValues.uuid && !validation.validator.isUUID(importValues.uuid)) ? true : false;
      let isDuplicate;
      let problemTag;

      // Check for correct UUID and fix if necessary
      if (uuidMissing || uuidMalformed) {
        importValues.uuid = uuid.v4();
      }

      // Custom sanitize for posts, tags and users
      if (tableName === 'posts') {
        // Check if any previously added posts have the same
        // title and slug
        isDuplicate = checkDuplicateAttributes(memo.data, importValues, ['title', 'slug']);

        // If it's a duplicate add to the problems and continue on
        if (isDuplicate) {
          // TODO: Put the reason why it was a problem?
          memo.problems.push(importValues);
          return;
        }
      } else if (tableName === 'tags') {
        // Check if any previously added posts have the same
        // name and slug
        isDuplicate = checkDuplicateAttributes(memo.data, importValues, ['name', 'slug']);

        // If it's a duplicate add to the problems and continue on
        if (isDuplicate) {
          // TODO: Put the reason why it was a problem?
          // Remember this tag so it can be updated later
          importValues.duplicate = isDuplicate;
          memo.problems.push(importValues);

          return;
        }
      } else if (tableName === 'posts_tags') {
        // Fix up removed tags associations
        problemTag = _.find(allProblems.tags, (tag) => {
          return tag.id === importValues.tag_id;
        });

        // Update the tag id to the original "duplicate" id
        if (problemTag) {
          importValues.tag_id = problemTag.duplicate.id;
        }
      }

      memo.data.push(importValues);
    }, {
      data: [],
      problems: []
    });

    // Store the table data to return
    data.data[tableName] = sanitizedTableData.data;

    // Keep track of all problems for all tables
    if (!_.isEmpty(sanitizedTableData.problems)) {
      allProblems[tableName] = sanitizedTableData.problems;
    }
  });

  return {
    data: data,
    problems: allProblems
  };
};

const validate = (data) => {
  const validateOps = [];

  _.each(_.keys(data.data), (tableName) => {
    _.each(data.data[tableName], (importValues) => {
      validateOps.push(validation.validateSchema(tableName, importValues));
    });
  });

  return Promise.settle(validateOps)
    .then((descriptors) => {
      let errorList = [];

      _.each(descriptors, (descriptor) => {
        if (descriptor.isRejected()) {
          errorList = errorList.concat(descriptor.reason());
        }
      });

      if (!_.isEmpty(errorList)) {
        return Promise.reject(errorList);
      }
    });
};

export const doImport = (dataDirty) => {
  const sanitizeResults = sanitize(dataDirty);

  const data = sanitizeResults.data;

  return validate(data)
    .then(() => importer.importData(data))
    .then(() => sanitizeResults)
    .catch((result) => handleErrors(result));
};
