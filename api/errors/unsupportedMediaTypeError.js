import ExtendableError from './extendableError';

export default class UnsupportedMediaTypeError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 415;
    this.errorType = this.name;
  }
}
