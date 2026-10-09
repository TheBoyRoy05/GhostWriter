import { entityItems, entitySkills } from "./entity.js";

const ISSUED = /^Issued (.+?)(?: · Expires (.+))?$/;
const CREDENTIAL_ID = /^Credential ID (.+)$/;

// Credential links go through LinkedIn's /safety/go/?url=<target> redirect.
function credentialUrl(anchor) {
  if (!anchor) return null;
  const url = new URL(anchor.href);
  return url.pathname.startsWith("/safety/go") ? url.searchParams.get("url") : anchor.href;
}

export function scrapeCertifications(doc = document) {
  return entityItems(doc, "profile_CertificationDetails").map(({ item, id }) => {
    const lines = [...item.querySelectorAll("p")]
      .filter((p) => !p.closest('a[href*="/skill-associations-details/"]'))
      .map((p) => p.textContent.trim())
      .filter(Boolean);
    const issued = lines.map((l) => l.match(ISSUED)).find(Boolean);
    const credentialId = lines.map((l) => l.match(CREDENTIAL_ID)).find(Boolean);
    const [name = null, issuer = null] = lines.filter((l) => !ISSUED.test(l) && !CREDENTIAL_ID.test(l));
    return {
      name,
      issuer,
      issued: issued?.[1] ?? null,
      expires: issued?.[2] ?? null,
      credential_id: credentialId?.[1] ?? null,
      link: credentialUrl(item.querySelector('a[aria-label^="Show credential"]')),
      skills: entitySkills(item, id),
    };
  });
}
