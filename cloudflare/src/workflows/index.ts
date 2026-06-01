// Stub workflows. The wrangler config declares Workflow bindings
// (IMPORT_WORKFLOW, SNAPSHOT_WORKFLOW) that point at ImportWorkflow and
// SnapshotWorkflow class names. Real workflow bodies are a later phase
// (see AGENTS.md Phase 8/9); for now we just need the named exports so
// wrangler dev and `wrangler deploy` accept the entry point. Real
// snapshot/import work still flows through the existing queue pipeline.
//
// Tracked separately; this file is intentionally minimal.

export class ImportWorkflow {
  async run(
    _event: unknown,
    step: { do: (name: string, cfg: unknown) => Promise<unknown> }
  ): Promise<unknown> {
    return await step.do('noop', {});
  }
}

export class SnapshotWorkflow {
  async run(
    _event: unknown,
    step: { do: (name: string, cfg: unknown) => Promise<unknown> }
  ): Promise<unknown> {
    return await step.do('noop', {});
  }
}
