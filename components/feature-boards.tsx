import Link from "next/link";
import { JobLinkActions } from "@/components/job-link-actions";
import { Badge, Empty, Paper } from "@/components/ui";
import { formatWhen, fullName } from "@/lib/format";

export function InsightsBoard({
  summary,
  playbook,
}: {
  summary: { total: number; applied: number; interviews: number; rejected: number; interviewRate: number };
  playbook: Array<{ company: string; total: number; interviewRate: number }>;
}) {
  const tiles = [
    ["Courses", summary.total],
    ["Applied", summary.applied],
    ["Interviews", summary.interviews],
    ["Win rate", `${summary.interviewRate}%`],
  ] as const;
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Paper key={label}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-ink-soft">{label}</p>
            <p className="display mt-2 text-4xl font-extrabold">{value}</p>
          </Paper>
        ))}
      </div>
      <Paper>
        <h2 className="display text-2xl font-extrabold">Playbook</h2>
        <div className="mt-4 grid gap-2">
          {playbook.length === 0 ? <p className="text-sm text-ink-soft">No interview-winning courses yet.</p> : null}
          {playbook.map((row) => (
            <div key={row.company} className="flex justify-between text-sm">
              <span>{row.company}</span>
              <span>{row.interviewRate}% · {row.total} runs</span>
            </div>
          ))}
        </div>
      </Paper>
    </div>
  );
}

export function QualityBoard({
  reports,
}: {
  reports: Array<{ id: number; companyName: string; jobRole: string | null; score: number; checks: Array<{ label: string; pass: boolean }> }>;
}) {
  if (reports.length === 0) return <Empty title="No CVs to score" body="Prepare an application first." />;
  return (
    <div className="grid gap-3">
      {reports.map((report) => (
        <Paper key={report.id}>
          <div className="flex justify-between gap-3">
            <div>
              <p className="font-semibold">{report.companyName} · {report.jobRole}</p>
              <ul className="mt-2 text-sm text-ink-soft">
                {report.checks.map((check) => (
                  <li key={check.label}>{check.pass ? "Pass" : "Gap"} — {check.label}</li>
                ))}
              </ul>
            </div>
            <Badge tone={report.score >= 70 ? "forest" : "copper"}>{report.score}</Badge>
          </div>
        </Paper>
      ))}
    </div>
  );
}

export function JobLinkBoard({
  links,
  detailPrefix,
}: {
  links: Array<{
    id: number;
    company: string | null;
    title: string | null;
    description: string | null;
    fetchStatus: string;
    techstack: string;
    applications: unknown[];
  }>;
  detailPrefix: string;
}) {
  if (links.length === 0) return <Empty title="No jobs yet" body="Add an apply URL." />;
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <Link key={link.id} href={`${detailPrefix}/${link.id}`}>
          <Paper className="grid gap-2">
            <div className="flex justify-between gap-2">
              <p className="font-semibold">{link.company || "Company"} — {link.title || "Untitled"}</p>
              <div className="flex items-center gap-2">
                <JobLinkActions id={link.id} />
                <Badge tone={link.fetchStatus === "success" ? "forest" : "copper"}>{link.fetchStatus}</Badge>
              </div>
            </div>
            <p className="line-clamp-3 text-sm text-ink-soft">{link.description}</p>
            <p className="text-xs text-ink-soft">{link.techstack} · {link.applications.length} applications</p>
          </Paper>
        </Link>
      ))}
    </div>
  );
}

export function CourseList({
  courses,
  hrefPrefix,
}: {
  courses: Array<{
    id: number;
    companyName: string | null;
    jobRole: string | null;
    outcome: string;
    startedAt: Date;
    events: unknown[];
  }>;
  hrefPrefix: string;
}) {
  if (courses.length === 0) return <Empty title="No courses" body="Prepare an application to start a course." />;
  return (
    <div className="grid gap-3">
      {courses.map((course) => (
        <Link key={course.id} href={`${hrefPrefix}/${course.id}`}>
          <Paper>
            <div className="flex justify-between gap-2">
              <p className="font-semibold">{course.companyName} · {course.jobRole}</p>
              <Badge tone={course.outcome === "interview" ? "forest" : "rule"}>{course.outcome}</Badge>
            </div>
            <p className="mt-2 text-sm text-ink-soft">{course.events.length} events · {formatWhen(course.startedAt)}</p>
          </Paper>
        </Link>
      ))}
    </div>
  );
}

export function ProfileRead({
  profile,
}: {
  profile: {
    firstName: string;
    lastName: string;
    middleName?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    workExperience?: string | null;
    education?: string | null;
    techstacks?: Array<{ techstack: string }>;
  };
}) {
  return (
    <Paper className="grid gap-3">
      <p className="display text-3xl font-extrabold">{fullName(profile)}</p>
      <p className="text-sm text-ink-soft">{profile.email} · {profile.phone} · {profile.city}</p>
      <div className="flex flex-wrap gap-2">
        {(profile.techstacks || []).map((stack) => (
          <Badge key={stack.techstack}>{stack.techstack}</Badge>
        ))}
      </div>
      <p className="whitespace-pre-wrap text-sm">{profile.workExperience}</p>
      <p className="whitespace-pre-wrap text-sm text-ink-soft">{profile.education}</p>
    </Paper>
  );
}
