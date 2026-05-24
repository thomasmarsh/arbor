// packages/common/src/http/errors.ts
import { Data } from 'effect';

export class NetworkError extends Data.TaggedError('NetworkError')<{
  message: string;
}> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class UnauthorizedError extends Data.TaggedError('UnauthorizedError')<{}> {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class ForbiddenError extends Data.TaggedError('ForbiddenError')<{}> {}

export class StatusError extends Data.TaggedError('StatusError')<{
  code: number;
  message: string;
}> {}

export class ParseError extends Data.TaggedError('ParseError')<{
  message: string;
}> {}

export type HttpError =
  | NetworkError
  | UnauthorizedError
  | ForbiddenError
  | StatusError
  | ParseError;
