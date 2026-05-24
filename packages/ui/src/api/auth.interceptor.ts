// packages/ui/src/api/auth.interceptor.ts
import { createHttpClient, type HttpClient } from '@arbo/common/http';
import { authStore } from '../auth/auth.store.js';

export const httpClient: HttpClient = createHttpClient({
  onUnauthorized: () => {
    authStore.send({ tag: 'reauth-required' });
  },
});

export const resolveReauth = () => {
  httpClient.resolveReauth();
};
