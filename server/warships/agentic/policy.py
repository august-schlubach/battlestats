from __future__ import annotations

from dataclasses import asdict, dataclass
import os


DEFAULT_ALLOWED_PROVIDERS = ("openai", "anthropic", "ollama")


@dataclass(frozen=True)
class CrewLLMPolicy:
    configured: bool
    provider: str | None
    model: str | None
    source: str
    allowed_providers: tuple[str, ...]

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


def _allowed_providers() -> tuple[str, ...]:
    raw = os.getenv("CREWAI_ALLOWED_PROVIDERS", "")
    if not raw.strip():
        return DEFAULT_ALLOWED_PROVIDERS
    return tuple(item.strip().lower() for item in raw.split(",") if item.strip())


def _infer_provider(model: str | None, provider_hint: str | None) -> str | None:
    if provider_hint:
        return provider_hint.strip().lower()
    if not model:
        return None
    if "/" in model:
        return model.split("/", 1)[0].strip().lower()
    if model.startswith("gpt-"):
        return "openai"
    if model.startswith("claude"):
        return "anthropic"
    return None


def resolve_crewai_policy(llm: str | None = None) -> CrewLLMPolicy:
    source = "none"
    model = llm
    if model:
        source = "argument"
    elif os.getenv("CREWAI_LLM_MODEL"):
        model = os.getenv("CREWAI_LLM_MODEL")
        source = "CREWAI_LLM_MODEL"
    elif os.getenv("CREWAI_LLM"):
        model = os.getenv("CREWAI_LLM")
        source = "CREWAI_LLM"
    elif os.getenv("OPENAI_MODEL"):
        model = os.getenv("OPENAI_MODEL")
        source = "OPENAI_MODEL"
    elif os.getenv("MODEL"):
        model = os.getenv("MODEL")
        source = "MODEL"

    provider = _infer_provider(model, os.getenv("CREWAI_LLM_PROVIDER"))
    allowed = _allowed_providers()
    if provider and provider not in allowed:
        raise ValueError(
            f"CrewAI provider '{provider}' is not allowed. Allowed providers: {', '.join(allowed)}"
        )

    return CrewLLMPolicy(
        configured=bool(model),
        provider=provider,
        model=model,
        source=source,
        allowed_providers=allowed,
    )
