declare module 'axios-cookiejar-support' {
  import { AxiosInstance, AxiosRequestConfig } from 'axios';

  export function wrapper(instance: AxiosInstance): AxiosInstance;
  export default wrapper;
}
