import type { Env } from '../types';
import { jsonOk } from '../responses';

export const onRequestGet: PagesFunction<Env> = async ({ data }) => {
  return jsonOk(data.user);
};
