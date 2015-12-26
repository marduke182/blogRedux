import ExtendableError from './extendableError';

export default class TooManyRequestsError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 429;
    this.errorType = this.name;
  }
}
