# Higgsfield integration

AUTO-YTB treats Higgsfield as a video-generation provider behind the common `GenerativeVideoProvider` contract. It is not the production brain and it is not allowed to bypass production budgets, QC, provenance or `VIDEO_ONLY` gates.

Official references:

- API quick start: https://open.higgsfield.ai/quick-start
- API product overview: https://higgsfield.ai/higgsfield-api
- Seedance 2.5 text-to-video: https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference
- Seedance 2.5 image-to-video: https://open.higgsfield.ai/models/bytedance/seedance-2.5/image-to-video/api-reference
- Seedance 2.5 reference-to-video: https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference
- Seedance 2.5 video edit: https://open.higgsfield.ai/models/bytedance/seedance-2.5/video-edit/api-reference

## Connection boundary

A Higgsfield connection in ChatGPT/MCP is **not** a server-side credential for AUTO-YTB.

The repository runtime becomes live only when one of these legitimate server-side credential forms is configured:

```env
HF_CREDENTIALS=<KEY_ID>:<KEY_SECRET>
```

or:

```env
HF_API_KEY_ID=...
HF_API_KEY_SECRET=...
```

Never copy credentials from public repositories, MCP traffic, browser storage, logs or another user's environment. Secrets stay outside Git and outside production receipts.

The default safe behavior remains unchanged: media generation is still subject to the project's explicit real-generation enablement and budget gates.

## Model selection

The adapter accepts the configured endpoint through:

```env
HIGGSFIELD_VIDEO_MODEL=bytedance/seedance-2.5/text-to-video
```

`HF_VIDEO_MODEL` remains a compatibility alias.

The legacy/default route `wan/v2.7/text-to-video` remains supported and intentionally conservative: it is classified as text-to-video only.

Seedance 2.5 is model-aware. Configuring any `bytedance/seedance-2.5/*` route enables AUTO-YTB to select the dedicated official endpoint for the requested operation:

| AUTO-YTB mode | Higgsfield route | Intended use |
| --- | --- | --- |
| `TEXT_TO_VIDEO` | `bytedance/seedance-2.5/text-to-video` | New shots from a structured shot prompt |
| `IMAGE_TO_VIDEO` | `bytedance/seedance-2.5/image-to-video` | Animate canonical start/end frames |
| `REFERENCE_TO_VIDEO` | `bytedance/seedance-2.5/reference-to-video` | Character/world/style continuity from image/video references |
| `VIDEO_TO_VIDEO` | `bytedance/seedance-2.5/video-edit` | Repair/style-match an existing moving clip |

The provider advertises up to 30 seconds for Seedance 2.5, `480p`/`720p`, the documented aspect ratios, first/last frame support and character/reference conditioning. Seedance 2.0 remains supported with its documented 15-second ceiling and up to 4K routes.

## Reference safety

Higgsfield's REST API consumes remotely reachable media URLs. The adapter rejects local-only `file://` references before submitting a paid generation. The upstream asset/publication layer must deliberately expose or upload a reference through an approved storage path first.

This prevents a generation from being charged when the provider could never read its conditioning asset.

## Output download security

Generation requests and status polling use:

```http
Authorization: Key <KEY_ID>:<KEY_SECRET>
```

Generated output URLs may resolve to a third-party CDN. AUTO-YTB therefore downloads the finished MP4 **without forwarding the Higgsfield Authorization header** to the output origin.

This is a hard security boundary and has regression coverage.

## Cost safety

`HIGGSFIELD_USD_PER_SECOND` can override routing estimates:

```env
HIGGSFIELD_USD_PER_SECOND=0.144
```

If it is not configured, the registry uses a conservative non-zero model-family estimate instead of treating unknown pricing as `$0`. Exact billing remains provider-side unless the API response exposes an authoritative cost.

Routing should optimize expected accepted quality per dollar / cost per accepted usable second, not raw call price.

## Production policy

- `FULL_GENERATIVE` and `CHARACTER_SERIES` may use Higgsfield for the entire visual timeline when the selected model is the best fit.
- Hybrid/editorial productions source legitimate real footage first and use Higgsfield only for unresolved or intentionally synthetic shots.
- `REFERENCE_TO_VIDEO` is preferred for recurring characters/worlds when reference conditioning improves continuity.
- `VIDEO_TO_VIDEO` can repair/style-match an otherwise useful moving shot instead of paying for a complete replacement.
- Every returned clip still passes technical QC, semantic/creative QC, story coverage and final MP4 QC.
- Higgsfield output never bypasses the 0%-still-image `VIDEO_ONLY` requirement.

## Testing

The deterministic adapter tests do not spend credits and cover:

- Seedance 2.5 capability metadata;
- text-to-video routing;
- start/end-frame image-to-video;
- image/video reference conditioning;
- video-edit routing;
- local-reference fail-closed behavior;
- output-CDN credential isolation;
- Wan 2.7 compatibility;
- provider-registry character/reference routing;
- non-zero unknown-price handling;
- no-credential runtime behavior.

GitHub Actions runs these regressions in addition to the repository's normal typecheck, full test suite, pipeline mock and web build.
