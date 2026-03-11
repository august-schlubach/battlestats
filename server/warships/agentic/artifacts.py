from __future__ import annotations

from pydantic import BaseModel, Field


class RoutingPlanArtifact(BaseModel):
    problem_statement: str = Field(description="What needs to be solved.")
    execution_sequence: list[str] = Field(
        default_factory=list, description="Ordered execution steps.")
    dependencies: list[str] = Field(
        default_factory=list, description="Dependencies and prerequisites.")
    blockers: list[str] = Field(
        default_factory=list, description="Known blockers or open questions.")


class ProductRequirementArtifact(BaseModel):
    objective: str
    scope: list[str] = Field(default_factory=list)
    non_goals: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class ArchitectureArtifact(BaseModel):
    chosen_approach: str
    interfaces: list[str] = Field(default_factory=list)
    migration_steps: list[str] = Field(default_factory=list)
    rollback_steps: list[str] = Field(default_factory=list)
    operational_checks: list[str] = Field(default_factory=list)


class UXBriefArtifact(BaseModel):
    primary_flow: list[str] = Field(default_factory=list)
    edge_states: list[str] = Field(default_factory=list)
    accessibility_checks: list[str] = Field(default_factory=list)


class DesignBriefArtifact(BaseModel):
    component_states: list[str] = Field(default_factory=list)
    responsive_notes: list[str] = Field(default_factory=list)
    visual_constraints: list[str] = Field(default_factory=list)


class EngineeringHandoffArtifact(BaseModel):
    touched_surfaces: list[str] = Field(default_factory=list)
    implementation_notes: list[str] = Field(default_factory=list)
    verification_steps: list[str] = Field(default_factory=list)
    follow_ups: list[str] = Field(default_factory=list)


class QASummaryArtifact(BaseModel):
    verified_criteria: list[str] = Field(default_factory=list)
    regression_scope: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    release_recommendation: str = Field(default="pending")


class SafetyReviewArtifact(BaseModel):
    reviewed_scope: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    mitigations: list[str] = Field(default_factory=list)
    release_decision: str = Field(default="pending")
