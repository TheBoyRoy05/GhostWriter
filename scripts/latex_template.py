"""
Render a LaTeX resume from user_data and resume_data.
"""

from pathlib import Path
from jinja2 import Environment, FileSystemLoader

TEMPLATE_DIR = Path(__file__).parent / "template"


def _latex_escape(s: str) -> str:
    """Escape LaTeX special characters in user content."""
    if not s:
        return ""
    return (
        str(s)
        .replace("&", "\\&")
        .replace("%", "\\%")
        .replace("#", "\\#")
        .replace("_", "\\_")
        .replace("$", "\\$")
    )


def render_resume(user_data: dict, resume_data: dict, output_path: Path | None = None) -> str:
    """
    Render the resume template with user_data and resume_data.

    Args:
        user_data: Static user info (name, title, location, contact, education, etc.)
        resume_data: Scraped data (experience, projects, certifications, skills)
        output_path: If provided, write the rendered .tex to this path

    Returns:
        The rendered LaTeX string
    """
    env = Environment(
        loader=FileSystemLoader(TEMPLATE_DIR),
        block_start_string="[[%",
        block_end_string="%]]",
        variable_start_string="[[",
        variable_end_string="]]",
    )
    env.filters["latex"] = _latex_escape

    template = env.get_template("template.tex")
    output = template.render(**user_data, **resume_data)

    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output, encoding="utf-8")

    return output
