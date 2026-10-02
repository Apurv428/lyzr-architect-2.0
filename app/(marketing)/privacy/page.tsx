import Link from "next/link";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Privacy · Architect" };

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "What we store",
    points: [
      "Your account: email address, and your name and profile picture if you sign in with Google or GitHub.",
      "What you build: prompts, chat messages, plans, generated code, checkpoints, agents, test results and deployments.",
      "Files you attach to a chat or add as agent knowledge.",
      "Usage records: agent runs with their tokens and latency, credits spent, and product events such as “project created” or “deployed”.",
    ],
  },
  {
    title: "Where it goes",
    points: [
      "Supabase hosts the database, sign-in and file storage. Every table is protected so that an account can read only its own data, plus projects shared with a workspace it belongs to.",
      "Vercel hosts the app.",
      "The AI model provider (Google Gemini on this deployment, or the provider behind a key you add yourself) receives the prompts, attached files and agent messages needed to answer a request.",
      "App previews run in your browser through CodeSandbox Sandpack or StackBlitz WebContainers, which load the generated code.",
      "Anything you connect yourself, such as a Slack webhook, an MCP server or a webhook forward URL, receives what your agent sends it.",
    ],
  },
  {
    title: "Secrets",
    points: [
      "Model keys, Slack webhook URLs, MCP tokens and environment variables are encrypted before they are stored.",
      "Agent API keys are stored only as a hash; the key is shown once when you create it.",
    ],
  },
  {
    title: "What we don’t do",
    points: ["We don’t sell your data or use it for advertising.", "We use cookies only to keep you signed in and to remember a connected GitHub account."],
  },
  {
    title: "Public links",
    points: ["An app you deploy is public: anyone with its link can open it. Don’t put private data in an app you deploy."],
  },
  {
    title: "Deleting your data",
    points: [
      "Delete a project from the Projects page, or all of your projects from Settings. Deleting a project removes its messages, checkpoints, agents and deployments.",
      "To delete your account, open an issue on the project’s GitHub repository.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <header className="relative mx-auto flex max-w-6xl items-center px-4 py-5 sm:px-8">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>Sign in</Link>
          <Link href="/signup" className={buttonVariants()}>Get started</Link>
        </div>
      </header>
      <main className="relative mx-auto max-w-2xl space-y-8 px-4 py-12 sm:px-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
          <p className="text-sm text-muted-foreground">
            Architect 2.0 is a concept build made for a hiring challenge. This page says plainly what it stores and who else handles it.
          </p>
        </div>
        {SECTIONS.map((s) => (
          <section key={s.title} className="space-y-2">
            <h2 className="text-base font-semibold">{s.title}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              {s.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-sm text-muted-foreground">
          Questions or deletion requests:{" "}
          <a href="https://github.com/Apurv428/lyzr-architect-2.0/issues" className="text-primary hover:underline" target="_blank" rel="noreferrer">
            github.com/Apurv428/lyzr-architect-2.0
          </a>
          .
        </p>
      </main>
    </div>
  );
}
