import ExtendableError from './extendableError';

export default class InternalServerError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 500;
    this.errorType = this.name;
  }
}
