import SparkMD5 from 'spark-md5';
import { AUTH_SALT } from './config';

// Web Crypto MD5 neumí, proto spark-md5.

/** Hash pro katalogové API: md5(md5("user:heslo") + sůl). */
export function sosacPasswordHash(username: string, password: string): string {
  const inner = SparkMD5.hash(`${username}:${password}`);
  return SparkMD5.hash(inner + AUTH_SALT);
}

/** Hash pro Streamuj: md5(heslo). */
export function streamujPasswordHash(password: string): string {
  return SparkMD5.hash(password);
}
