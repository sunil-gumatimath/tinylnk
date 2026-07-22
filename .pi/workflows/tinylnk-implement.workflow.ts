import { agent, compute, decision, decisionEdge, defineWorkflow } from "pi-workflows";

type Input = { task?: string };

const reviewChoices = ["clean", "issues_found"] as const;

/**
 * Implement a tinylnk change, validate it, and loop through review/fixes.
 * Run with: /workflow tinylnk-implement <task>
 */
export default defineWorkflow({
  name: "tinylnk-implement",
  title: ({ input }) => {
    const task = (input as Input).task;
    return task ? `tinylnk: ${task.slice(0, 60)}` : "tinylnk implementation";
  },
  maxSteps: 20,
  startAt: "implement",
  nodes: {
    implement: agent({
      timeoutMs: 60 * 60_000,
      statusDetail: "implementing",
      prompt: ({ input }) => [
        `Implement ${(input as Input).task ?? "the change discussed in this conversation"} end-to-end in this tinylnk repository.`,
        "First inspect the existing code and preserve its FastAPI/React/TypeScript conventions.",
        "Make the smallest production-ready change; do not change secrets, generated databases, or unrelated files.",
      ].join("\n"),
      expectedOutput: `{ "summary": "what was implemented", "files": ["changed file"] }`,
    }),
    verify: agent({
      timeoutMs: 30 * 60_000,
      statusDetail: "verifying",
      prompt: () => [
        "Verify the implementation and fix any failures you encounter.",
        "Run relevant checks. For frontend changes, run `bun run lint` and `bun run build` from `frontend/`. For backend changes, run the relevant safe Python checks/tests available in the repository.",
        "Do not run destructive commands or modify tracked database files.",
      ].join("\n"),
      expectedOutput: `{ "passed": true | false, "details": "commands run and results" }`,
    }),
    review: decision({
      choices: reviewChoices,
      question: ({ outputs }) => [
        "Act as a strict reviewer of the completed tinylnk change.",
        "Check requirements, correctness, security, FastAPI API behavior, React/TypeScript quality, and verification results.",
        "Choose `issues_found` for any issue that must be fixed; otherwise choose `clean`.",
        "Include a concise reason for your choice.",
        "",
        `Implementation: ${JSON.stringify(outputs.implement)}`,
        `Verification: ${JSON.stringify(outputs.verify)}`,
      ].join("\n"),
    }),
    fix: agent({
      timeoutMs: 30 * 60_000,
      statusDetail: "fixing",
      prompt: ({ outputs }) => [
        "Fix every issue identified by the review. Keep the scope limited to the requested change, then stop so verification can rerun.",
        "",
        `Review: ${JSON.stringify(outputs.review)}`,
      ].join("\n"),
      expectedOutput: `{ "fixed": "what was changed" }`,
    }),
    finalize: compute({
      run: ({ outputs }) => ({
        implementation: outputs.implement,
        verification: outputs.verify,
        review: outputs.review,
      }),
    }),
  },
  edges: [
    { from: "implement", to: "verify" },
    { from: "verify", to: "review" },
    decisionEdge({
      from: "review",
      choices: reviewChoices,
      cases: { clean: "finalize", issues_found: "fix" },
    }),
    { from: "fix", to: "verify" },
  ],
});
