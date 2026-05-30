# Testing Philosophy

Treat testing as a tool to **understand and stabilize** the system, not just to check boxes. The goal is maximal insight and confidence, not maximal line coverage.

## 1. Core Testing Matrix

Choose the method that best reveals the system’s behavior:

### A. Example‑Based Tests (Unit/Integration)

- **Use when:** Behavior is best shown via concrete inputs, edge cases are known/finite, or clarity matters more than coverage.
- **Execution:** Treat these as executable documentation. Group by feature, keep setup minimal, and name tests after the business outcome, not the function name.

### B. Property‑Based Tests (PBT)

- **Use when:** System has invariants, round-trip guarantees (e.g., `serialize(deserialize(x)) == x`), or the input space is massive.
- **Execution:** Focus on deep architectural properties (e.g., "state machine never enters state X") rather than brute-force fuzzing.

### C. Snapshot Tests

- **Use when:** Output is large/structured (UI trees, ASTs, API payloads) and you want to detect unintended structural changes.
- **Execution:** Keep snapshots small, highly readable, and version-controlled. **Never** snapshot dynamic data (timestamps, UUIDs).

### D. Integration & E2E Tests

- **Use when:** Testing boundaries, network boundaries, database side-effects, or critical user flows where units work individually but fail together.
- **Execution:** Mock external third-party APIs, but use real/spawned databases where possible to catch schema drift.

## 2. Testing Principles

- **Triangulation:** Triangulate truth from multiple angles. Examples show _intent_, properties reveal _invariants_, snapshots capture _structure_, and integration proves _cohesion_.
- **Justification (Inline):** Every test file or major suite must begin with a 1-sentence comment justifying the chosen strategy.
- **Minimal but Expressive:** Prefer the smallest set of tests that fully bounds the system’s behavior. Strip away redundant assertions.
- **Deterministic Execution:** Zero tolerance for flakiness. If a test fails intermittently due to race conditions or time-dependence, rewrite or delete it.
