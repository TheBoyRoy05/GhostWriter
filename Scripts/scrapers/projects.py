import re

try:
    from playwright.sync_api import Page
except ImportError:
    Page = None

POSITION_DATES = re.compile(
    r"^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} (?:-|to) "
    r"(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})(?: · .+)?$"
)
DATE_RANGE = re.compile(
    r"^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}) (?:-|to) "
    r"(Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4})"
)


def _bullets(text: str) -> list[str]:
    return [
        (line[2:].strip() if line.startswith("- ") else line.strip())
        for line in text.split("\n") if line.strip()
    ]


def _skills(text: str) -> list[str]:
    if "Skills:" not in text:
        return []
    return [s.strip() for s in text.split("Skills:", 1)[1].strip().split(" · ") if s.strip()]


def _get_project_links(page: Page) -> list[str]:
    links = []
    modal_triggers = page.locator("main section li > a[href]").all()
    for trigger in modal_triggers:
        trigger.click()
        view_link = page.get_by_role("link", name="View").first
        view_link.wait_for(state="visible", timeout=5000)
        links.append(view_link.get_attribute("href") or "")
        page.locator('button[aria-label="Dismiss"]').click()
        page.wait_for_timeout(300)
    return links


def parse_project_items(items: list[str], links: list[str]) -> list[dict]:
    projects, link_idx, i = [], 0, 0
    while i < len(items):
        item = items[i]
        if POSITION_DATES.match(item) and i > 0:
            title = items[i - 1]
            m = DATE_RANGE.search(item)
            start, end = m.groups() if m else (None, None)
            desc_parts, skills = [], []
            i += 1
            while i < len(items):
                nxt = items[i]
                if nxt.startswith("Skills:"):
                    skills = _skills(nxt)
                    i += 1
                    break
                if POSITION_DATES.match(nxt):
                    break
                desc_parts.append(nxt)
                i += 1
            desc = "\n\n".join(desc_parts) if desc_parts else None
            link = links[link_idx] if link_idx < len(links) else None
            link_idx += 1
            projects.append({
                "title": title,
                "link": link,
                "start": start,
                "end": end,
                "description": _bullets(desc) if desc else [],
                "skills": skills,
            })
            continue
        i += 1
    return projects


def scrape_projects(page: Page) -> list[dict]:
    links = _get_project_links(page)
    items = [s.inner_text() for s in page.locator("main > section span[aria-hidden]").all()]
    projects = parse_project_items(items, links)
    print(f"\nFound {len(projects)} project(s):\n")
    return projects
