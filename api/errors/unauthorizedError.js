import ExtendableError from './extendableError';

export default class UnauthorizedError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 401;
    this.errorType = this.name;
  }
}
