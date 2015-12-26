import ExtendableError from './extendableError';

export default class EmailError extends ExtendableError {
  constructor(message) {
    super(message);
    this.code = 500;
    this.errorType = this.name;
  }
}
