import ExtendableError from './extendableError';

export default class ValidationError extends ExtendableError {
  constructor(message, offendingProperty) {
    super(message);
    this.code = 422;
    this.errorType = this.name;
    if (offendingProperty) {
      this.property = offendingProperty;
    }
  }
}
