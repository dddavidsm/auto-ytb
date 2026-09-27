const text = (value) => String(value ?? '').trim();

function classifyElevenLabsFailure(error) {
  const message = text(error instanceof Error ? error.message : error);
  if (/\b(401|403)\b|unauthori[sz]ed|invalid.{0,20}(api|credential|key)|api.{0,20}key.{0,20}invalid/i.test(message)) return 'INVALID_CREDENTIALS';
  if (/\b(429)\b|rate.?limit|quota|too many requests/i.test(message)) return 'RATE_LIMITED';
  if (/\b(408|409|425|500|502|503|504)\b|timeout|temporar|network|fetch failed/i.test(message)) return 'RECOVERABLE_FAILURE';
  return 'PROVIDER_FAILURE';
}

/**
 * ElevenLabs remains the primary provider. Gemini is an explicit fallback and
 * the returned asset carries the decision so receipts cannot mistake fallback
 * audio for an ElevenLabs success.
 */
export function withVoiceFailover(primary, fallback, options = {}) {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const primaryName = text(primary.name) || 'elevenlabs';
  const fallbackName = text(fallback.name) || 'gemini';
  return {
    name: 'voice-failover',
    primary: primaryName,
    fallback: fallbackName,
    async synthesize(input) {
      try {
        const asset = await primary.synthesize(input);
        return {
          ...asset,
          metadata: {
            ...(asset.metadata ?? {}),
            voiceRouting: {
              requestedProvider: primaryName,
              selectedProvider: text(asset.provider) || primaryName,
              fallback: false,
              status: 'AVAILABLE',
            },
          },
        };
      } catch (error) {
        const failure = classifyElevenLabsFailure(error);
        const detail = text(error instanceof Error ? error.message : error).slice(0, 400);
        if (options.onFailure) await options.onFailure({ provider: primaryName, status: failure, detail });
        const asset = await fallback.synthesize(input);
        return {
          ...asset,
          metadata: {
            ...(asset.metadata ?? {}),
            voiceRouting: {
              requestedProvider: primaryName,
              selectedProvider: text(asset.provider) || fallbackName,
              fallback: true,
              status: failure,
              primaryError: detail,
            },
          },
        };
      }
    },
  };
}

export function classifyVoiceProviderFailure(error) {
  return classifyElevenLabsFailure(error);
}
