/**
 * Builds LaTeX from the template.tex structure using matcher result + profile.
 */

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

const escapeLatex = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/\$/g, "\\$")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");

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

  const websiteUrl = profile?.personal_website || "#";
  const websiteDisplay = escapeLatex(
    profile?.personal_website
      ? new URL(profile.personal_website).hostname.replace("www.", "")
      : "Website",
  );
  const githubUrl = profile?.github || "#";
  const githubDisplay = escapeLatex(
    profile?.github ? profile.github.replace(/^https?:\/\//, "").replace(/\/$/, "") : "GitHub",
  );
  const linkedinUrl = profile?.linkedin || "#";
  const linkedinDisplay = escapeLatex(
    profile?.linkedin
      ? profile.linkedin.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
      : "LinkedIn",
  );
  const hobbies = escapeLatex(profile?.hobbies || "");
  const title = escapeLatex(jobTitle || "Your Title");
  const location = profile?.location;
  const citizenship = profile?.citizenship === true;

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

  const projectsSection = projects
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
        ? `\\textbf{\\href{${proj.link}}{\\underline{${title}}}}`
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

  return `
\\documentclass[letterpaper,11pt]{article}
\\usepackage{../resume}

\\begin{document}

%----------HEADING----------
\\begin{center}
  {\\Huge \\scshape \\textcolor{\\accentColor}{${name}}} \\\\ \\vspace{1pt}
  ${citizenship ? "U.S. Citizen $|$ " : ""}${title} ${location ? `$|$ ${location}` : ""} \\\\ \\vspace{1pt}
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

%-----------PROJECTS-----------
\\section{\\textcolor{\\accentColor}{Projects}}
\\vspace{-7pt}
\\resumeSubHeadingListStart
${projectsSection}
\\resumeSubHeadingListEnd

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
