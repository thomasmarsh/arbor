import { HelloResponseSchema, type HelloResponse } from '@arbo/common';

export async function fetchHello(): Promise<HelloResponse> {
  const res = await fetch('/api/hello');
  if (!res.ok) throw new Error(`HTTP ${res.status.toString()}: ${res.statusText}`);
  return HelloResponseSchema.parse(await res.json());
}
