import { PageHead } from "@/components/desk-shell";
import { Paper } from "@/components/ui";

export function ExtensionDesk({ loadPath }: { loadPath: string }) {
  return (
    <div>
      <PageHead
        kicker="Extension"
        title="Fill from Chrome"
        lede="Load the unpacked extension, sign in, then start Auto bid on Job Links. It opens each apply page in your Chrome and fills it with the old engine."
      />
      <Paper className="grid max-w-2xl gap-3 text-sm text-ink/80">
        <p>1. Open <span className="font-mono text-copper">chrome://extensions</span></p>
        <p>2. Turn on Developer mode.</p>
        <p>3. Load unpacked and choose this folder:</p>
        <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-copper">{loadPath}</p>
        <p>Sign in from the popup to <span className="font-mono">http://localhost:3000</span>. Auto bid on Job Links then opens each job, fills the profile, uploads the resume text, and asks Groq for questions that are still empty. Submit stays off unless you check it.</p>
        <p>If Auto bid says the extension is missing, click Reload on this extension in Chrome, then reload the desk.</p>
      </Paper>
    </div>
  );
}
