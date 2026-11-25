GPT-6.2 Sol and GPT-6.2 Astra are available in the existing Wuwei hosted, Codex subscription, and OpenAI API model lists. GPT choices appear before Claude in the corresponding model categories.

The composer shows the reasoning levels supported by the selected model. Settings → Reasoning lets each provider/model have its own default; changing a chat's level preserves that chat's setting through provider refreshes. Subscription requests now send the selected level, and official OpenAI GPT-6 tool calls use Responses.

Platform management keeps provider names separate from individual model names. Existing provider and credential records are retained.

GLM-5.4 was verified as released for Coding Plan, but the configured Zhipu key returned 403 on both the general and Coding Plan endpoints. It is not advertised as an available hosted model. It can use the supported Low/High/Max settings when connected through an authorized account.

Validation: GPT-6.2 Sol/Astra both returned real tool calls through the configured hosted upstream and the local Codex subscription. Model defaults, transport serialization, membership boundaries, and built Chinese/English UI flows were checked. No production customer account was used for acceptance.
