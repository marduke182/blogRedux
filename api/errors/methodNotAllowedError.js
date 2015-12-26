import ExtendableError from './extendableError';

export default class MethodNotAllowedError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 405;
    this.errorType = this.name;
  }
}
