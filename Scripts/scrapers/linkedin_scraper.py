"""
LinkedIn Profile Scraper using Playwright.
"""

import os
import json
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page

from experience import scrape_experience
from projects import scrape_projects

load_dotenv(Path(__file__).parent.parent.parent / ".env")

LINKEDIN_USERNAME = os.getenv("LINKEDIN_USERNAME")
LINKEDIN_PASSWORD = os.getenv("LINKEDIN_PASSWORD")
LINKEDIN_URL = os.getenv("LINKEDIN_URL")


def login(page: Page) -> None:
    if not LINKEDIN_USERNAME or not LINKEDIN_PASSWORD:
        raise ValueError("LINKEDIN_USERNAME and LINKEDIN_PASSWORD must be set in .env")

    print("Navigating to LinkedIn login...")
    page.goto("https://www.linkedin.com/login", wait_until="domcontentloaded")

    print("Entering credentials...")
    page.fill('input[name="session_key"]', LINKEDIN_USERNAME)
    page.fill('input[name="session_password"]', LINKEDIN_PASSWORD)
    page.click('button[type="submit"]')

    print("Waiting for login to complete...")
    page.wait_for_url(lambda url: "login" not in url, timeout=15000)
    print("Login successful.")


def load_profile(page: Page) -> None:
    print(f"Navigating to profile: {LINKEDIN_URL}")
    page.goto(LINKEDIN_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(1000)
    print("Profile loaded.")
    
    
def load_page_details(page: Page, url: str) -> None:
    print(f"Navigating to experience details: {url}")
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(2000)
    print("Scrolling to load lazy content...")
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    page.wait_for_timeout(2000)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)
    print("Page details loaded.")


def main():
    print("Starting LinkedIn scraper...")

    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        try:
            login(page)
            load_profile(page)
            
            experience_url = LINKEDIN_URL.rstrip("/") + "/details/experience/"
            load_page_details(page, experience_url)
            experiences = scrape_experience(page)
            page.go_back()
            
            projects_url = LINKEDIN_URL.rstrip("/") + "/details/projects/"
            load_page_details(page, projects_url)
            projects = scrape_projects(page)
            page.go_back()
        finally:
            browser.close()

    resume_data = {"experiences": experiences, "projects": projects}

    output_path = Path(__file__).parent / "resume_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(resume_data, f, indent=2, default=str)
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    main()
