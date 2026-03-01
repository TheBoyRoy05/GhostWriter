"""
LinkedIn Profile Scraper using Playwright.
"""

import os
import json
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page

from experience import scrape_experience

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
            experiences = scrape_experience(page, experience_url)
        finally:
            browser.close()

    print(f"\nFound {len(experiences)} experience(s):\n")
    resume_data = {"experiences": experiences}

    output_path = Path(__file__).parent / "resume_data.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(resume_data, f, indent=2, default=str)
    print(f"Saved to {output_path}")


if __name__ == "__main__":
    main()
