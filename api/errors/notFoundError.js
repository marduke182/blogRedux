import ExtendableError from './extendableError';

export default class NotFoundError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 404;
    this.errorType = this.name;
  }
}
