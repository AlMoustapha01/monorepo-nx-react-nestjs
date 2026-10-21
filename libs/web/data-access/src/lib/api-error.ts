export interface ApiErrorFieldIssue {
  path: string;
  message: string;
}

export interface ApiErrorInit {
  status: number;
  /** Code de l'API (`NOT_FOUND`…) ou code propre au client : TIMEOUT, NETWORK_ERROR, HTTP_ERROR, INVALID_RESPONSE. */
  code: string;
  title: string;
  detail: string;
  requestId?: string | undefined;
  errors?: ApiErrorFieldIssue[] | undefined;
  cause?: unknown;
}

/** Erreur unique du client HTTP : problem+json de l'API ou échec côté client. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail: string;
  readonly requestId?: string;
  readonly errors?: ApiErrorFieldIssue[];

  constructor(init: ApiErrorInit) {
    super(init.detail, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.title = init.title;
    this.detail = init.detail;
    if (init.requestId !== undefined) this.requestId = init.requestId;
    if (init.errors !== undefined) this.errors = init.errors;
  }
}
