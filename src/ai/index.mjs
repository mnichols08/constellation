// Optional prompt-to-spec layer over the ConstellationSpec engine.
// Provider-neutral: bring any model through a small adapter, or none at all.
export { describeConstellation, modelTools, AI_LIMITS, SUBMIT_TOOL, SYSTEM_PROMPT } from './describe.mjs';
export { createScriptedModel, createKeywordModel, interpretDescription } from './fake-model.mjs';
export { describePlan, planChanges, describeFailure } from './plan.mjs';
