export type HookOutput = Record<string, unknown>;

export const decision = (permissionDecision: "deny" | "ask", reason: string): HookOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision,
    permissionDecisionReason: reason,
  },
});

export const deny = (reason: string): HookOutput => decision("deny", reason);

export const rewrite = (
  toolInput: Record<string, unknown>,
  command: string,
  approve: boolean,
): HookOutput => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    ...(approve ? { permissionDecision: "allow" } : {}),
    updatedInput: { ...toolInput, command },
  },
});
