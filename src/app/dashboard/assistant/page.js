import { getCurrentUser } from "@/lib/auth";
import AssistantChat from "@/components/assistant/AssistantChat";
import { DATA_INTENTS, POLICY_INTENT } from "@/lib/ai-capabilities.mjs";

// Server Component — role comes from the verified profile. The suggestion
// chips mirror exactly what the server's intent registry allows for that
// role (no client-side capability logic).

export default async function AssistantPage() {
  // Layout guarantees a verified user with an active profile.
  const { profile } = await getCurrentUser();

  const suggestions = [
    ...DATA_INTENTS.filter((i) => i.roles.includes(profile.role)).flatMap(
      (i) => i.suggestions.slice(0, 1)
    ),
    ...POLICY_INTENT.suggestions.slice(0, 2),
  ].slice(0, 5);

  return (
    <AssistantChat role={profile.role} suggestions={suggestions} />
  );
}
