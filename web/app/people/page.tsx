import { AskBar } from "@/components/ask-bar";
import { PeopleDirectory } from "@/components/people-directory";
import { expertiseMap, getPeople } from "@/lib/people";

export const metadata = { title: "People · FINN" };

// The Network, queried directly (FR-24, FR-25).
export default function PeoplePage() {
  const people = getPeople();
  const rows = people.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.current?.role ?? c.headline,
    org: c.current?.org && c.current.org !== "Independent" ? c.current.org : "",
    tie: c.tie.label,
    strength: c.tie.strength,
    lastSpoke: c.tie.last_interaction
      ? new Date(c.tie.last_interaction).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      : null,
    expertise: c.expertise,
  }));
  const themes = expertiseMap().map((t) => ({ theme: t.theme, count: t.ids.length }));
  return (
    <main className="px-4 pt-[max(20px,env(safe-area-inset-top))]">
      <h1 className="pt-2 font-serif text-[30px] tracking-[-0.02em]">People</h1>
      <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
        Who you know, what they know, and where they show up in your portfolio.
      </p>
      <div className="mt-4">
        <AskBar placeholder="Ask: who knows semiconductors?" />
      </div>
      <PeopleDirectory rows={rows} themes={themes} />
      <p className="mt-6 px-1 pb-4 text-[11.5px] leading-snug text-muted">
        Synthetic network for this prototype. In use, it is built from your own LinkedIn export and meeting log, kept private
        to you, and never sent to a language model.
      </p>
    </main>
  );
}
