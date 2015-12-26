import ExtendableError from './extendableError';

export default class BadRequestError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 400;
    this.errorType = this.name;
  }
}
