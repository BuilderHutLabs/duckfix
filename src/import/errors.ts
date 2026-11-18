export type ImportErrorCode = 'encrypted' | 'corrupt' | 'unsupported';

export class ImportError extends Error {
  code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string = code) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
  }
}
