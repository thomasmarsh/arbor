import { describe, expect, it } from 'vitest';
import { parseBody } from './parse-body.js';

const MAX = 1024 * 1024; // 1 MB

function jsonRequest(body: unknown, extra?: Record<string, string>): Request {
  return new Request('https://example.com/', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  });
}

function multipartRequest(fields: Record<string, string | Blob>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request('https://example.com/', { method: 'POST', body: fd });
}

function textRequest(body: string): Request {
  return new Request('https://example.com/', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body,
  });
}

describe('parseBody', () => {
  it('parses application/json', async () => {
    const req = jsonRequest({ name: 'Alice' });
    const result = await parseBody(req, MAX);
    expect(result).toEqual({ ok: true, data: { name: 'Alice' } });
  });

  it('parses multipart/form-data into a plain object', async () => {
    const req = multipartRequest({ username: 'alice' });
    const result = await parseBody(req, MAX);
    expect(result).toMatchObject({ ok: true });
    expect((result as { ok: true; data: Record<string, unknown> }).data['username']).toBe('alice');
  });

  it('parses multipart/form-data with a File field', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const req = multipartRequest({ upload: file });
    const result = await parseBody(req, MAX);
    expect(result).toMatchObject({ ok: true });
    const data = (result as { ok: true; data: Record<string, unknown> }).data;
    expect(data['upload']).toBeInstanceOf(File);
  });

  it('parses text/plain', async () => {
    const req = textRequest('hello world');
    const result = await parseBody(req, MAX);
    expect(result).toEqual({ ok: true, data: 'hello world' });
  });

  it('returns 415 for unknown content-type', async () => {
    const req = new Request('https://example.com/', {
      method: 'POST',
      headers: { 'content-type': 'application/xml' },
      body: '<foo/>',
    });
    const result = await parseBody(req, MAX);
    expect(result).toMatchObject({ ok: false, status: 415 });
  });

  it('returns ok with undefined data when no content-type (e.g. GET)', async () => {
    const req = new Request('https://example.com/', { method: 'GET' });
    const result = await parseBody(req, MAX);
    expect(result).toEqual({ ok: true, data: undefined });
  });

  it('returns 413 when content-length exceeds maxBodySize', async () => {
    const req = jsonRequest(
      { x: 'y' },
      { 'content-length': String(MAX + 1) },
    );
    const result = await parseBody(req, MAX);
    expect(result).toMatchObject({ ok: false, status: 413 });
  });
});
