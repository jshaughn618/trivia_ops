import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { mediaUploadSchema } from '../../../shared/validators';

export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  const payload = await parseJson(request);
  const parsed = mediaUploadSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid upload request', details: parsed.error.flatten() }, 400);
  }

  return jsonOk({
    uploadUrl: '/api/media/upload',
    method: 'POST',
    fields: { kind: parsed.data.kind }
  });
};
