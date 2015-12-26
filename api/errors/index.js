// # Errors
import _ from 'lodash'; // eslint-disable
import chalk from 'chalk';
import path from 'path';
export { default as NotFoundError} from './notFoundError';
export { default as BadRequestError } from './badRequestError';
export { default as InternalServerError } from './internalServerError';
export { default as NoPermissionError } from './noPermissionError';
export { default as wedError } from './methodNotAllowedError';
export { default as RequestEntityTooLargeError } from './requestTooLargeError';
export { default as UnauthorizedError } from './unauthorizedError';
export { default as ValidationError } from './validationError';
export { default as UnsupportedMediaTypeError } from './unsupportedMediaTypeError';
export { default as EmailError } from './emailError';
export { default as DataImportError } from './dataImportError';
export { default as TooManyRequestsError } from './tooManyRequestsError';

let config;
// Paths for views
let userErrorTemplateExists = false;

// Shim right now to deal with circular dependencies.
// @TODO(hswolff): remove circular dependency and lazy require.
function getConfigModule() {
  if (!config) {
    config = require('../config');
  }

  return config;
}

/**
 * Basic error handling helpers
 */
const errors = {
  updateActiveTheme(activeTheme) {
    userErrorTemplateExists = getConfigModule().paths.availableThemes[activeTheme].hasOwnProperty('error.hbs');
  },

  throwError(err) {
    if (!err) {
      err = new Error('An error occurred');
    }

    if (_.isString(err)) {
      throw new Error(err);
    }

    throw err;
  },

  // ## Reject Error
  // Used to pass through promise errors when we want to handle them at a later time
  rejectError(err) {
    return Promise.reject(err);
  },

  logInfo(component, info) {
    if ((process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production')) {
      console.info(chalk.cyan(component + ':', info));
    }
  },

  logWarn(warn, context, help) {
    if ((process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production')) {
      warn = warn || 'no message supplied';
      var msgs = [chalk.yellow('\nWarning:', warn), '\n'];

      if (context) {
        msgs.push(chalk.white(context), '\n');
      }

      if (help) {
        msgs.push(chalk.green(help));
      }

      // add a new line
      msgs.push('\n');

      console.log.apply(console, msgs);
    }
  },

  logError(err, context, help) {
    const origArgs = _.toArray(arguments).slice(1);
    let stack;
    let msgs;

    if (_.isArray(err)) {
      _.each(err, (error) => {
        const newArgs = [error].concat(origArgs);
        errors.logError.apply(this, newArgs);
      });
      return;
    }

    stack = err ? err.stack : null;

    if (!_.isString(err)) {
      if (_.isObject(err) && _.isString(err.message)) {
        err = err.message;
      } else {
        err = 'An unknown error occurred.';
      }
    }

    // Overwrite error to provide information that this is probably a permission problem
    // TODO: https://github.com/TryGhost/Ghost/issues/3687
    if (err.indexOf('SQLITE_READONLY') !== -1) {
      context = 'Your database is in read only mode. Visitors can read your blog, but you can\'t log in or add posts.';
      help = 'Check your database file and make sure that file owner and permissions are correct.';
    }
    // TODO: Logging framework hookup
    // Eventually we'll have better logging which will know about envs
    if ((process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'staging' ||
      process.env.NODE_ENV === 'production')) {
      msgs = [chalk.red('\nERROR:', err), '\n'];

      if (context) {
        msgs.push(chalk.white(context), '\n');
      }

      if (help) {
        msgs.push(chalk.green(help));
      }

      // add a new line
      msgs.push('\n');

      if (stack) {
        msgs.push(stack, '\n');
      }

      console.error.apply(console, msgs);
    }
  },

  logErrorAndExit(err, context, help) {
    this.logError(err, context, help);
    // Exit with 0 to prevent npm errors as we have our own
    process.exit(0);
  },

  logAndThrowError(err, context, help) {
    this.logError(err, context, help);

    this.throwError(err, context, help);
  },

  logAndRejectError(err, context, help) {
    this.logError(err, context, help);

    return this.rejectError(err, context, help);
  },

  logErrorWithRedirect(msg, context, help, redirectTo, req, res) {
    return () => {
      this.logError(msg, context, help);

      if (_.isFunction(res.redirect)) {
        res.redirect(redirectTo);
      }
    };
  },

  /**
   * ### Format HTTP Errors
   * Converts the error response from the API into a format which can be returned over HTTP
   *
   * @private
   * @param {Array} error
   * @return {{errors: Array, statusCode: number}}
   */
  formatHttpErrors(error) {
    let statusCode = 500;
    const errors = [];

    if (!_.isArray(error)) {
      error = [].concat(error);
    }

    _.each(error, function each(errorItem) {
      const errorContent = {};

      // TODO: add logic to set the correct status code
      statusCode = errorItem.code || 500;

      errorContent.message = _.isString(errorItem) ? errorItem :
        (_.isObject(errorItem) ? errorItem.message : 'Unknown API Error');
      errorContent.errorType = errorItem.errorType || 'InternalServerError';
      errors.push(errorContent);
    });

    return {errors: errors, statusCode: statusCode};
  },

  formatAndRejectAPIError(error, permsMessage) {
    if (!error) {
      return this.rejectError(
        new this.NoPermissionError(permsMessage || 'You do not have permission to perform this action')
      );
    }

    if (_.isString(error)) {
      return this.rejectError(new this.NoPermissionError(error));
    }

    if (error.errorType) {
      return this.rejectError(error);
    }

    // handle database errors
    if (error.code && (error.errno || error.detail)) {
      error.db_error_code = error.code;
      error.errorType = 'DatabaseError';
      error.code = 500;

      return this.rejectError(error);
    }

    return this.rejectError(new this.InternalServerError(error));
  },

  handleAPIError(err, req, res, next) {
    const httpErrors = this.formatHttpErrors(err);
    this.logError(err);
    // Send a properly formatted HTTP response containing the errors
    res.status(httpErrors.statusCode).json({errors: httpErrors.errors});
  },

  renderErrorPage(code, err, req, res, next) {
    const defaultErrorTemplatePath = path.resolve(getConfigModule().paths.adminViews, 'user-error.hbs');

    const parseStack = (stack) => {
      if (!_.isString(stack)) {
        return stack;
      }

      // TODO: split out line numbers
      const stackRegex = /\s*at\s*(\w+)?\s*\(([^\)]+)\)\s*/i;

      return (
        stack
          .split(/[\r\n]+/)
          .slice(1)
          .map((line) => {
            const parts = line.match(stackRegex);
            if (!parts) {
              return null;
            }

            return {
              function: parts[1],
              at: parts[2]
            };
          })
          .filter((line) => {
            return !!line;
          })
      );
    };

    // Render the error!
    const renderErrorInt = (errorView) => {
      let stack = null;

      if (code !== 404 && process.env.NODE_ENV !== 'production' && err.stack) {
        stack = parseStack(err.stack);
      }

      res.status(code).render((errorView || 'error'), {
        message: err.message || err,
        code: code,
        stack: stack
      }, (templateErr, html) => {
        if (!templateErr) {
          return res.status(code).send(html);
        }
        // There was an error trying to render the error page, output the error
        this.logError(templateErr, 'Error whilst rendering error page', 'Error template has an error');

        // And then try to explain things to the user...
        // Cheat and output the error using handlebars escapeExpression
        return res.status(500).json({
          message: `Oops, seems there is an error in the error template.: ${templateErr.message || templateErr}`
        });
      });
    };

    if (code >= 500) {
      this.logError(err, 'Rendering Error Page', 'Ghost caught a processing error in the middleware layer.');
    }

    // Are we admin? If so, don't worry about the user template
    if ((res.isAdmin && req.user && req.user.id) || userErrorTemplateExists === true) {
      return renderErrorInt();
    }

    // We're not admin and the template doesn't exist. Render the default.
    return renderErrorInt(defaultErrorTemplatePath);
  },

  error404(req, res, next) {
    const message = 'Page not found';

    // do not cache 404 error
    res.set({'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'});
    if (req.method === 'GET') {
      this.renderErrorPage(404, message, req, res, next);
    } else {
      res.status(404).send(message);
    }
  },

  error500(err, req, res, next) {
    // 500 errors should never be cached
    res.set({'Cache-Control': 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0'});

    if (err.status === 404 || err.code === 404) {
      return this.error404(req, res, next);
    }

    if (req.method === 'GET') {
      if (!err || !(err instanceof Error)) {
        next();
      }
      errors.renderErrorPage(err.status || err.code || 500, err, req, res, next);
    } else {
      let statusCode = 500;
      const returnErrors = [];

      if (!_.isArray(err)) {
        err = [].concat(err);
      }

      _.each(err, (errorItem) => {
        const errorContent = {};

        statusCode = errorItem.code || 500;

        errorContent.message = _.isString(errorItem) ? errorItem :
          (_.isObject(errorItem) ? errorItem.message : 'Unknown Error');
        errorContent.errorType = errorItem.errorType || 'InternalServerError';
        returnErrors.push(errorContent);
      });

      res.status(statusCode).json({errors: returnErrors});
    }
  }
};

// Ensure our 'this' context for methods and preserve method arity by
// using Function#bind for expressjs
_.each([
  'logWarn',
  'logInfo',
  'rejectError',
  'throwError',
  'logError',
  'logAndThrowError',
  'logAndRejectError',
  'logErrorAndExit',
  'logErrorWithRedirect',
  'handleAPIError',
  'formatAndRejectAPIError',
  'formatHttpErrors',
  'renderErrorPage',
  'error404',
  'error500'
], (funcName) => {
  errors[funcName] = errors[funcName].bind(errors);
});

export default errors;
