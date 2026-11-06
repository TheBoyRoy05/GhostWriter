/**
 * Builds LaTeX from the template.tex structure using matcher result + profile.
 */

import { join } from "node:path";
import { RESUME_STY } from "./resume-sty";

export interface MatcherJsonResult {
  experiences?: Array<{
    company?: string;
    title?: string;
    description?: string[];
    skills?: string[];
    start?: string;
    end?: string;
  }>;
  projects?: Array<{
    name?: string;
    title?: string;
    description?: string[];
    skills?: string[];
    link?: string;
    start?: string;
    end?: string;
  }>;
  languages?: string[];
  tools?: string[];
  domain?: string[];
  certifications?: string[];
}

interface ProfileData {
  name?: string | null;
  personal_website?: string | null;
  github?: string | null;
  linkedin?: string | null;
  email?: string | null;
  phone?: string | null;
  hobbies?: string | null;
  location?: string | null;
  citizenship?: boolean | null;
}

interface EducationData {
  school?: string;
  degree?: string;
  start?: string;
  end?: string;
  grade?: string | null;
}

// One pass, so the braces an escape adds are never escaped again.
const LATEX_ESCAPES: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
  "&": "\\&",
  "%": "\\%",
  "#": "\\#",
  $: "\\$",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
};
export const escapeLatex = (s: string) => s.replace(/[\\^~&%#$_{}]/g, (char) => LATEX_ESCAPES[char]);
// hyperref's \href reads its URL verbatim except `#` and `%`, which still end or start TeX syntax.
const escapeUrl = (url: string) => url.replace(/[#%]/g, (char) => `\\${char}`);

interface ResumeData {
  education?: EducationData[];
}

export function buildLatexFromMatcherResult(
  result: MatcherJsonResult,
  profile: ProfileData | null,
  resume?: ResumeData | null,
  jobTitle?: string | null,
): string {
  const education = resume?.education?.[0] ?? null;
  const name = escapeLatex(profile?.name || "Your Name");
  const email = escapeLatex(profile?.email || "email@example.com");
  let phone = escapeLatex(profile?.phone || "");
  phone = phone.replace(/^1?(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");

  const websiteUrl = escapeUrl(profile?.personal_website || "#");
  const websiteDisplay = escapeLatex(
    profile?.personal_website
      ? new URL(profile.personal_website).hostname.replace("www.", "")
      : "Website",
  );
  const githubUrl = escapeUrl(profile?.github || "#");
  const githubDisplay = escapeLatex(
    profile?.github ? profile.github.replace(/^https?:\/\//, "").replace(/\/$/, "") : "GitHub",
  );
  const linkedinUrl = escapeUrl(profile?.linkedin || "#");
  const linkedinDisplay = escapeLatex(
    profile?.linkedin
      ? profile.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
      : "LinkedIn",
  );
  const hobbies = escapeLatex(profile?.hobbies || "");
  const title = jobTitle ? escapeLatex(jobTitle) : "";
  const location = escapeLatex(profile?.location || "");
  const citizenship = profile?.citizenship === true;
  // An empty line ended with \\ is a LaTeX error, so the tagline goes when every part is missing.
  const tagline = [citizenship && "U.S. Citizen", title, location].filter(Boolean).join(" $|$ ");

  const edu = education;
  const eduSchool = escapeLatex(edu?.school || "University");
  const eduDegree = escapeLatex(edu?.degree || "Degree");
  const eduGrade = edu?.grade ? escapeLatex(edu.grade) : "";
  const eduEnd = escapeLatex(edu?.end || "");

  const experiences = result.experiences ?? [];
  const projects = result.projects ?? [];
  const languages = (result.languages ?? []).map(escapeLatex);
  const tools = (result.tools ?? []).map(escapeLatex);
  const domain = (result.domain ?? []).map(escapeLatex);
  const certifications = (result.certifications ?? []).map(escapeLatex);

  const experiencesSection = experiences
    .map(
      (exp, idx) => `
\\resumeProjectHeading{\\textbf{${escapeLatex(exp.company ?? "")}} $|$ \\emph{${escapeLatex(exp.title ?? "")}}}{${escapeLatex(exp.start ?? "")}${exp.end ? ` -- ${escapeLatex(exp.end)}` : ""}}
\\resumeItemListStart
${(exp.description ?? []).map((b) => `    \\resumeItem{${escapeLatex(b)}}`).join("\n")}
\\resumeItemListEnd
${idx === experiences.length - 1 ? "" : "\\vspace{-15pt}"}
`,
    )
    .join("\n");

  const projectItems = projects
    .map((proj, idx) => {
      const title = escapeLatex(proj.name ?? proj.title ?? "");

      const skillsStr = (proj.skills ?? [])
        .slice(0, 5)
        .map((s) => escapeLatex(s))
        .reduce((acc, s) => {
          const next = acc ? `${acc}, ${s}` : s;
          return title.length + next.length <= 85 ? next : acc;
        }, "");

      const dates = proj.start
        ? `${escapeLatex(proj.start)}${proj.end ? ` -- ${escapeLatex(proj.end)}` : ""}`
        : "";
      const heading = proj.link
        ? `\\textbf{\\href{${escapeUrl(proj.link)}}{\\underline{${title}}}}`
        : `\\textbf{${title}}`;
      return `
\\resumeProjectHeading
    {${heading} $|$ \\emph{${skillsStr}}}{${dates}}
\\resumeItemListStart
${(proj.description ?? []).map((b) => `        \\resumeItem{${escapeLatex(b)}}`).join("\n")}
\\resumeItemListEnd
${idx === projects.length - 1 ? "" : "\\vspace{-15pt}"}
`;
    })
    .join("\n");
  // An empty item list is a LaTeX error, and projects may all be dropped.
  const projectsSection = `%-----------PROJECTS-----------
\\section{\\textcolor{\\accentColor}{Projects}}
\\vspace{-7pt}
\\resumeSubHeadingListStart
${projectItems}
\\resumeSubHeadingListEnd
`;

  return `
\\documentclass[letterpaper,11pt]{article}
${RESUME_STY}

\\begin{document}

%----------HEADING----------
\\begin{center}
  {\\Huge \\scshape \\textcolor{\\accentColor}{${name}}} \\\\ \\vspace{1pt}
  ${tagline ? `${tagline} \\\\ \\vspace{1pt}` : ""}
  \\small \\raisebox{-0.1\\height}{\\href{${websiteUrl}}{\\raisebox{-0.2\\height}\\faGlobe\\ \\underline{${websiteDisplay}}}} ~
    \\href{${githubUrl}}{\\raisebox{-0.2\\height}\\faGithub\\ \\underline{${githubDisplay}}} ~
    \\href{${linkedinUrl}}{\\raisebox{-0.2\\height}\\faLinkedin\\ \\underline{${linkedinDisplay}}} ~ \\href{mailto:${email}}{\\raisebox{-0.2\\height}\\faEnvelope\\ \\underline{${email}}} ~ \\raisebox{-0.1\\height}{\\reflectbox{\\faPhone}}\\ ${phone}
  \\vspace{-8pt}
\\end{center}

%-----------EDUCATION-----------
\\section{\\textcolor{\\accentColor}{Education}}
\\resumeSubHeadingListStart
\\resumeSubheading{${eduSchool}${eduGrade ? ` (${eduGrade})` : ""}}{${eduEnd}}{\\textbf{${eduDegree}}}{}
\\resumeSubHeadingListEnd

%-----------EXPERIENCE-----------
\\section{\\textcolor{\\accentColor}{Experience}}
\\vspace{-7pt}
\\resumeSubHeadingListStart
${experiencesSection}
\\resumeSubHeadingListEnd

${projects.length ? projectsSection : ""}
%-----------PROGRAMMING SKILLS-----------
\\section{\\textcolor{\\accentColor}{Technical Skills}}
\\begin{itemize}[leftmargin=0.15in, label={}]
  \\small{\\item{
        \\textbf{Languages: }{${languages.join(", ")}} \\\\
        \\textbf{Tools: }{${tools.join(", ")}} \\\\
        \\textbf{Domain: }{${domain.join(", ")}} \\\\
        \\textbf{Certifications: }{${certifications.join(", ")}} \\\\
        \\textbf{Hobbies: }{${hobbies}}
        }}
\\end{itemize}
\\vspace{-10pt}

\\end{document}
`;
}

// Compiles dir/resume.tex to dir/resume.pdf and returns its page count.
export async function compileLatex(dir: string, latex: string, timeoutMs = 30_000) {
  await Bun.write(join(dir, "resume.tex"), latex);
  const proc = Bun.spawn(["tectonic", "--chatter", "minimal", "--keep-logs", "resume.tex"], { cwd: dir, stderr: "pipe", timeout: timeoutMs });
  const stderr = await new Response(proc.stderr).text();
  // Bun sets `killed` on any exit once `timeout` is passed, so only the signal shows a timeout kill.
  if ((await proc.exited) !== 0) throw new Error(proc.signalCode === "SIGTERM" ? `Tectonic timed out after ${timeoutMs / 1000} s` : stderr);

  const log = await Bun.file(join(dir, "resume.log")).text();
  const pages = log.match(/^Output written on .*\((\d+) pages?/m)?.[1];
  if (!pages) throw new Error("Tectonic log has no page count");
  return Number(pages);
}
