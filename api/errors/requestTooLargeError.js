import ExtendableError from './extendableError';

export default class RequestTooLargeError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 413;
    this.errorType = this.name;
  }
}
