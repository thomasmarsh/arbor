export type ParseBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; body: unknown };

export async function parseBody(request: Request, maxBodySize: number): Promise<ParseBodyResult> {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const len = parseInt(contentLength, 10);
    if (!isNaN(len) && len > maxBodySize) {
      return { ok: false, status: 413, body: { error: 'payload too large' } };
    }
  }

  const contentType = request.headers.get('content-type');

  if (!contentType) {
    return { ok: true, data: undefined };
  }

  if (contentType.startsWith('application/json')) {
    const data = await request.json() as unknown;
    return { ok: true, data };
  }

  if (contentType.startsWith('multipart/form-data')) {
    const fd = await request.formData();
    const obj: Record<string, unknown> = {};
    fd.forEach((value, key) => { obj[key] = value; });
    return { ok: true, data: obj };
  }

  if (contentType.startsWith('text/plain')) {
    const data = await request.text();
    return { ok: true, data };
  }

  return { ok: false, status: 415, body: { error: 'unsupported media type' } };
}
