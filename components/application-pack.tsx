import Link from "next/link";
import { StatusActions } from "@/components/status-actions";
import { Badge, Paper } from "@/components/ui";
import { scoreResume } from "@/lib/quality";

export function ApplicationPack({
  app,
}: {
  app: {
    id: number;
    companyName: string;
    jobRole: string | null;
    jobDescription: string;
    resumeMarkdown: string | null;
    answersJson: string | null;
    generationStatus: string;
    status: string;
    profile: { firstName: string; lastName: string };
  };
}) {
  const report = scoreResume(app.resumeMarkdown || "", app.jobDescription);
  const answers = app.answersJson
    ? (JSON.parse(app.answersJson) as Array<{ label: string; answer: string }>)
    : [];
  return (
    <div className="grid gap-4">
      <Paper className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-soft">{app.profile.firstName} {app.profile.lastName}</p>
          <p className="font-semibold">{app.generationStatus}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={report.score >= 70 ? "forest" : "copper"}>{report.score} quality</Badge>
          <Badge>{app.status}</Badge>
        </div>
      </Paper>
      <div className="flex flex-wrap gap-3 text-sm">
        <a className="text-copper underline" href={`/api/applications/${app.id}/cv`}>Download CV</a>
        <a className="text-copper underline" href={`/api/applications/${app.id}/print`} target="_blank" rel="noreferrer">Print CV</a>
        <Link className="text-copper underline" href="../generate">Generate another</Link>
      </div>
      {app.resumeMarkdown ? (
        <Paper>
          <h2 className="display text-2xl font-semibold">CV</h2>
          <pre className="mt-3 max-h-[32rem] overflow-auto whitespace-pre-wrap text-sm">{app.resumeMarkdown}</pre>
        </Paper>
      ) : null}
      <Paper>
        <h2 className="display text-2xl font-semibold">Answers</h2>
        <div className="mt-3 grid gap-2">
          {answers.length === 0 ? <p className="text-sm text-ink-soft">No answers stored.</p> : null}
          {answers.map((row) => (
            <div key={row.label} className="grid gap-1 border-b border-white/[0.06] py-2 text-sm">
              <p className="text-ink-soft">{row.label}</p>
              <p>{row.answer}</p>
            </div>
          ))}
        </div>
      </Paper>
      <Paper>
        <h2 className="display text-2xl font-semibold">Quality checks</h2>
        <ul className="mt-3 grid gap-1 text-sm">
          {report.checks.map((check) => (
            <li key={check.label}>{check.pass ? "Pass" : "Fail"} — {check.label}</li>
          ))}
        </ul>
      </Paper>
      <StatusActions id={app.id} />
    </div>
  );
}
