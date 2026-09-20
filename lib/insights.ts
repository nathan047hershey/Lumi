import { prisma } from "./prisma";

export async function buildInsights(userId?: number) {
  const courses = await prisma.bidCourse.findMany({
    where: userId ? { userId } : undefined,
    include: { events: true },
  });
  const total = courses.length;
  const interviews = courses.filter((c) => c.outcome === "interview").length;
  const applied = courses.filter((c) => c.outcome === "applied" || c.outcome === "interview").length;
  const rejected = courses.filter((c) => c.outcome === "rejected").length;
  const byCompany = new Map<string, { total: number; interviews: number }>();
  for (const course of courses) {
    const key = course.companyName || "Unknown";
    const row = byCompany.get(key) || { total: 0, interviews: 0 };
    row.total += 1;
    if (course.outcome === "interview") row.interviews += 1;
    byCompany.set(key, row);
  }
  const playbook = [...byCompany.entries()]
    .map(([company, row]) => ({
      company,
      total: row.total,
      interviewRate: row.total ? Math.round((row.interviews / row.total) * 100) : 0,
    }))
    .sort((a, b) => b.interviewRate - a.interviewRate || b.total - a.total)
    .slice(0, 8);

  return {
    summary: {
      total,
      applied,
      interviews,
      rejected,
      interviewRate: total ? Math.round((interviews / total) * 100) : 0,
    },
    playbook,
  };
}
