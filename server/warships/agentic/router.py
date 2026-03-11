from __future__ import annotations

import os
from typing import Any

from .crewai_runner import run_crewai_workflow
from .graph import run_graph
from .runlog import write_agent_run_log


def _prepare_langgraph_context(context: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(context)
    explicit_checkpoint_url = os.getenv(
        "LANGGRAPH_CHECKPOINT_POSTGRES_URL", "").strip()
    db_engine = os.getenv("DB_ENGINE", "postgresql_psycopg2").strip().lower()
    db_password = os.getenv("DB_PASSWORD", "").strip()

    if prepared.get("checkpoint_backend"):
        return prepared

    if explicit_checkpoint_url:
        return prepared

    if db_engine.startswith("postgresql") and not db_password:
        prepared["checkpoint_backend"] = "memory"

    return prepared


def route_agent_workflow(task: str, context: dict[str, Any] | None = None, engine: str = "auto") -> dict[str, Any]:
    resolved_context = context or {}
    normalized_task = task.lower()
    explicit_engine = engine.strip().lower()

    if explicit_engine in {"crewai", "langgraph", "hybrid"}:
        chosen = explicit_engine
        rationale = f"Explicit engine override requested: {chosen}."
    else:
        planning_signal = any(token in normalized_task for token in (
            "plan", "design", "persona", "review", "scope"))
        execution_signal = any(token in normalized_task for token in (
            "implement", "fix", "test", "modify", "code", "refactor"))
        verification_signal = bool(
            resolved_context.get("verification_commands"))

        if planning_signal and execution_signal:
            chosen = "hybrid"
            rationale = "Task mixes persona-driven planning and implementation execution; hybrid routing is the safest fit."
        elif execution_signal or verification_signal:
            chosen = "langgraph"
            rationale = "Task emphasizes implementation or verification; guarded LangGraph execution is preferred."
        else:
            chosen = "crewai"
            rationale = "Task leans toward planning, coordination, or synthesis; CrewAI is preferred."

    return {
        "engine": chosen,
        "rationale": rationale,
        "task": task,
    }


def run_routed_workflow(
    task: str,
    context: dict[str, Any] | None = None,
    engine: str = "auto",
    dry_run: bool = False,
    llm: str | None = None,
) -> dict[str, Any]:
    route = route_agent_workflow(task, context=context, engine=engine)
    resolved_context = context or {}

    if route["engine"] == "langgraph":
        result = run_graph(
            task, context=_prepare_langgraph_context(resolved_context))
        result["selected_engine"] = "langgraph"
        result["route_rationale"] = route["rationale"]
        result["run_log_path"] = write_agent_run_log("langgraph", result)
        return result

    if route["engine"] == "crewai":
        result = run_crewai_workflow(
            task, context=resolved_context, dry_run=dry_run, llm=llm)
        result["selected_engine"] = "crewai"
        result["route_rationale"] = route["rationale"]
        result["run_log_path"] = write_agent_run_log("crewai", result)
        return result

    crew_result = run_crewai_workflow(
        task, context=resolved_context, dry_run=True, llm=llm)
    graph_result = run_graph(
        task, context=_prepare_langgraph_context(resolved_context))
    result = {
        "workflow_id": graph_result.get("workflow_id"),
        "status": "completed" if graph_result.get("status") == "completed" else "needs_attention",
        "selected_engine": "hybrid",
        "route_rationale": route["rationale"],
        "summary": [
            "Hybrid workflow executed: CrewAI planning plus LangGraph guarded execution.",
            f"CrewAI status: {crew_result.get('status')}",
            f"LangGraph status: {graph_result.get('status')}",
        ],
        "crew_result": crew_result,
        "langgraph_result": graph_result,
    }
    result["run_log_path"] = write_agent_run_log("hybrid", result)
    return result
