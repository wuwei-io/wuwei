# GPT-Image-1

> For the complete documentation index, see [llms.txt](/llms.txt). Markdown versions of documentation pages are available by appending `.md` to the page URL.

> Our previous image generation model

Model ID: `gpt-image-1`

GPT Image 1 is a natively multimodal language model that accepts both text and image inputs, and produces image outputs.

## Model details

- Default snapshot: `gpt-image-1`
- Input modalities: text, image
- Output modalities: image

## Pricing

Pricing is based on the number of tokens used, or other metrics based on the model type. For tool-specific models, like search and computer use, there’s a fee per tool call. See details in the [pricing page](/api/docs/pricing).

### Text tokens

| Metric | Price | Unit |
| --- | ---: | --- |
| Input | $5 | 1M tokens |
| Cached input | $1.25 | 1M tokens |

### Image tokens

| Metric | Price | Unit |
| --- | ---: | --- |
| Input | $10 | 1M tokens |
| Cached input | $2.5 | 1M tokens |
| Output | $40 | 1M tokens |

### Image generation

| Metric | Price | Unit |
| --- | ---: | --- |
| Quality | Low | image |
| 1024x1024 | $0.011 | image |
| 1024x1536 | $0.016 | image |
| 1536x1024 | $0.016 | image |

### Image generation

| Metric | Price | Unit |
| --- | ---: | --- |
| Quality | Medium | image |
| 1024x1024 | $0.042 | image |
| 1024x1536 | $0.063 | image |
| 1536x1024 | $0.063 | image |

### Image generation

| Metric | Price | Unit |
| --- | ---: | --- |
| Quality | High | image |
| 1024x1024 | $0.167 | image |
| 1024x1536 | $0.25 | image |
| 1536x1024 | $0.25 | image |

## Endpoints

| Endpoint | Route | Support |
| --- | --- | --- |
| Live | `v1/live/sessions` | Not supported |
| Chat Completions | `v1/chat/completions` | Not supported |
| Responses | `v1/responses` | Supported |
| Realtime | `v1/realtime` | Not supported |
| Realtime translation | `v1/realtime/translations` | Not supported |
| Realtime transcription | `v1/realtime/transcription_sessions` | Not supported |
| Assistants | `v1/assistants` | Not supported |
| Batch | `v1/batch` | Supported |
| Fine-tuning | `v1/fine-tuning` | Not supported |
| Embeddings | `v1/embeddings` | Not supported |
| Image generation | `v1/images/generations` | Supported |
| Videos | `v1/videos` | Not supported |
| Image edit | `v1/images/edits` | Supported |
| Speech generation | `v1/audio/speech` | Not supported |
| Transcription | `v1/audio/transcriptions` | Not supported |
| Translation | `v1/audio/translations` | Not supported |
| Moderation | `v1/moderations` | Not supported |
| Completions (legacy) | `v1/completions` | Not supported |

## Supported features

- inpainting

## Snapshots

Snapshots let you lock in a specific version of the model so that performance and behavior remain consistent. Below is a list of all available snapshots and aliases for GPT-Image-1.

- `gpt-image-1`

## Rate limits

Rate limits ensure fair and reliable access to the API by placing specific caps on requests, tokens, audio duration, or other usage within a given time period. Your usage tier determines how high these limits are set and automatically increases as you send more requests and spend more on the API.

### default

| Tier | TPM | IPM |
| --- | ---: | ---: |
| Tier 1 | 100,000 | 5 |
| Tier 2 | 250,000 | 20 |
| Tier 3 | 800,000 | 50 |
| Tier 4 | 3,000,000 | 150 |
| Tier 5 | 8,000,000 | 250 |
