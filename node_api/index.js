import express from 'express';
import { handleUpload } from '@vercel/blob/client';

export function createApp({ uploadHandler = handleUpload, fetchBackend = fetch, env = process.env } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/blob-upload', async (req, res) => {
    const backendBase = env.GEOLABEL_BACKEND_URL;
    const authorization = req.get('authorization');
    if (!backendBase || !env.BLOB_READ_WRITE_TOKEN) {
      return res.status(503).json({ error: 'Private upload service is not configured.' });
    }
    const completion = req.body?.type === 'blob.upload-completed';
    if (!completion && req.body?.type !== 'blob.generate-client-token') {
      return res.status(400).json({ error: 'Unsupported private upload request.' });
    }
    if (!completion && (!authorization || !authorization.startsWith('Bearer '))) {
      return res.status(401).json({ error: 'Sign in before uploading an asset.' });
    }
    const origin = req.get('origin');
    const host = req.get('host');
    if (origin && host && origin !== `https://${host}`) {
      return res.status(403).json({ error: 'Cross-origin upload requests are not allowed.' });
    }

    try {
      const result = await uploadHandler({
        token: env.BLOB_READ_WRITE_TOKEN,
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (requestedPathname, clientPayload) => {
          if (!clientPayload) throw new Error('Upload metadata is required.');
          const payload = JSON.parse(clientPayload);
          const datasetId = payload?.dataset_id;
          const intent = {
            asset_id: payload?.asset_id,
            filename: payload?.filename,
            content_type: payload?.content_type,
            size_bytes: payload?.size_bytes,
          };
          if (typeof datasetId !== 'string' || datasetId.length < 1 || datasetId.length > 128) {
            throw new Error('Dataset is invalid.');
          }
          const response = await fetchBackend(new URL(
            `/api/datasets/${encodeURIComponent(datasetId)}/assets/upload-authorize`, backendBase,
          ), {
            method: 'POST',
            headers: { authorization, 'content-type': 'application/json' },
            body: JSON.stringify(intent),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('Upload is not authorized for this account.');
          const authorized = await response.json();
          const now = Date.now();
          if (authorized.pathname !== requestedPathname
            || !Number.isSafeInteger(intent.size_bytes) || intent.size_bytes <= 0
            || authorized.maximum_size_bytes !== intent.size_bytes
            || typeof authorized.content_type !== 'string'
            || !authorized.allowed_content_types?.includes(authorized.content_type)
            || !Number.isFinite(authorized.valid_until_ms) || authorized.valid_until_ms <= now) {
            throw new Error('Upload intent is invalid or expired.');
          }
          return {
            allowedContentTypes: [authorized.content_type],
            maximumSizeInBytes: intent.size_bytes,
            validUntil: Math.min(authorized.valid_until_ms, now + 15 * 60 * 1000),
            addRandomSuffix: false,
            allowOverwrite: false,
          };
        },
        // The SDK authenticates completion signatures. Application finalization
        // remains a separate member-authenticated, DB-locked operation.
        onUploadCompleted: async () => {},
      });
      return res.status(200).json(result);
    } catch {
      // Never log request bodies, session credentials, upload tokens, or provider responses.
      return res.status(400).json({ error: 'The private upload request could not be authorized.' });
    }
  });
  app.all('/api/blob-upload', (_req, res) => res.status(405).json({ error: 'Method not allowed.' }));
  return app;
}

export default createApp();
