import ExtendableError from './extendableError';

export default class NoPermissionError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 403;
    this.errorType = this.name;
  }
}

