const text = (value) => String(value ?? '').trim();

function wavFromSilence(durationSeconds, sampleRate = 24_000, channels = 1, bits = 16) {
  const samples = Math.max(1, Math.ceil(Number(durationSeconds) * sampleRate));
  const pcmBytes = samples * channels * (bits / 8);
  const output = new Uint8Array(44 + pcmBytes);
  const view = new DataView(output.buffer);
  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) output[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bits / 8, true);
  view.setUint16(32, channels * bits / 8, true);
  view.setUint16(34, bits, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcmBytes, true);
  return output;
}

function approximateAlignment(value, durationSeconds) {
  const characters = [...String(value ?? '')];
  const step = Number(durationSeconds) / Math.max(1, characters.length);
  return {
    characters,
    characterStartTimesSeconds: characters.map((_, index) => index * step),
    characterEndTimesSeconds: characters.map((_, index) => (index + 1) * step),
  };
}

/**
 * Last-resort provider used only to keep a production job recoverable when
 * every network TTS provider is unavailable. It deliberately emits silence,
 * never a tone or synthetic noise, and exposes the degraded state in the
 * manifest so the result cannot be mistaken for narrated audio.
 */
export function createSilentVoiceFallback(store) {
  return {
    name: 'local-silent-fallback',
    async synthesize(input) {
      const words = String(input.text ?? '').trim().split(/\s+/).filter(Boolean).length;
      const durationSeconds = Math.max(1.5, Math.min(900, words / 2.35));
      const data = wavFromSilence(durationSeconds);
      const key = `voice/fallback-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;
      const stored = await store.put({ key, contentType: 'audio/wav', data });
      return {
        id: key.replace(/[^a-z0-9]/gi, '-'),
        uri: stored.uri,
        mimeType: 'audio/wav',
        bytes: stored.bytes ?? data.byteLength,
        provider: 'local-silent-fallback',
        model: 'silence-recovery',
        language: input.language,
        voiceId: input.voice,
        durationSeconds,
        alignment: approximateAlignment(input.text, durationSeconds),
        metadata: {
          degraded: true,
          narrationAvailable: false,
          recoveryReason: 'All configured network voice providers failed',
        },
      };
    },
  };
}

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
  const finalFallback = options.finalFallback;
  if (!primary) return fallback ?? finalFallback;
  if (!fallback) {
    if (!finalFallback) return primary;
    return {
      name: 'voice-terminal-failover',
      primary: text(primary.name) || 'voice',
      fallback: text(finalFallback.name) || 'local-fallback',
      async synthesize(input) {
        try {
          return await primary.synthesize(input);
        } catch (error) {
          const detail = text(error instanceof Error ? error.message : error).slice(0, 400);
          if (options.onFailure) await options.onFailure({ provider: text(primary.name) || 'voice', status: classifyElevenLabsFailure(error), detail });
          const asset = await finalFallback.synthesize(input);
          return {
            ...asset,
            metadata: {
              ...(asset.metadata ?? {}),
              voiceRouting: {
                requestedProvider: text(primary.name) || 'voice',
                selectedProvider: text(asset.provider) || text(finalFallback.name) || 'local-fallback',
                fallback: true,
                status: 'DEGRADED_NO_NETWORK_VOICE',
                primaryError: detail,
              },
            },
          };
        }
      },
    };
  }
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
        try {
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
        } catch (fallbackError) {
          const fallbackFailure = classifyElevenLabsFailure(fallbackError);
          const fallbackDetail = text(fallbackError instanceof Error ? fallbackError.message : fallbackError).slice(0, 400);
          if (options.onFailure) await options.onFailure({ provider: fallbackName, status: fallbackFailure, detail: fallbackDetail, primaryProvider: primaryName });
          if (!finalFallback) throw fallbackError;
          const asset = await finalFallback.synthesize(input);
          return {
            ...asset,
            metadata: {
              ...(asset.metadata ?? {}),
              voiceRouting: {
                requestedProvider: primaryName,
                selectedProvider: text(asset.provider) || 'local-silent-fallback',
                fallback: true,
                status: 'DEGRADED_NO_NETWORK_VOICE',
                primaryError: detail,
                fallbackError: fallbackDetail,
              },
            },
          };
        }
      }
    },
  };
}

export function classifyVoiceProviderFailure(error) {
  return classifyElevenLabsFailure(error);
}
