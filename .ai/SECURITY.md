# Security & Trust Boundaries

**Overall Project Security/Trust Risk:**
MEDIUM overall
HIGH review rigor for authentication/authorization/hidden-information boundaries

* Browser/client is untrusted.
* `Telegram.WebApp.initDataUnsafe` is not authentication authority.
* Raw Telegram `initData` must be validated server-side.
* Telegram Bot token is server secret only.
* Hidden card values must never be broadcast and hidden only by UI.
* Produce recipient-specific server projections.
* Eliminated spectators receive Public State only.
* Room tokens must be opaque/high-entropy.
* No secrets in Git, prompts, evidence or logs.
* Avoid logging hands, undealt cards, future revolver sequence or credentials.
* Validate membership, current turn, card ownership, turnId, revision and legal action on server.
* Host role cannot bypass gameplay authorization.
